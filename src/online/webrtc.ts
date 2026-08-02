import type {
  CoopCloseReason,
  CoopRole,
  CoopSession,
  CoopStats,
  CoopStatus,
} from './types';

export type CoopChannel = 'unreliable' | 'reliable';

export type SignalPayload =
  | { kind: 'sdp'; sdpType: 'offer' | 'answer'; sdp: string }
  | { kind: 'ice'; candidate: string; sdpMid: string | null; sdpMLineIndex: number | null };

export interface RtcSignaling {
  readonly role: CoopRole;
  status(): CoopStatus;
  onConnecting(callback: () => void): () => void;
  sendSignal(signal: SignalPayload): void;
  onSignal(callback: (signal: SignalPayload) => void): () => void;
  markConnected(): void;
  close(reason: CoopCloseReason): void;
  onClosed(callback: (reason: CoopCloseReason) => void): () => void;
}

export type PeerConnectionFactory = (configuration: RTCConfiguration) => RTCPeerConnection;

export interface WebRtcSessionOptions {
  peerConnectionFactory?: PeerConnectionFactory;
}

/** CO-3開発用の公開STUN。TURNと本番向けの接続先選定はCO-5で行う。 */
export const DEVELOPMENT_STUN_URL = 'stun:stun.cloudflare.com:3478';

const DEVELOPMENT_RTC_CONFIGURATION: RTCConfiguration = {
  iceServers: [{ urls: DEVELOPMENT_STUN_URL }],
};
const MAX_MESSAGE_BYTES = 16 * 1024;
const UNRELIABLE_BUFFER_LIMIT = 64 * 1024;
const RELIABLE_BUFFER_LIMIT = 1024 * 1024;
const STATS_INTERVAL_MS = 1_000;
const KEEPALIVE_INTERVAL_MS = 1_000;
const WATCHDOG_TIMEOUT_MS = 3_000;
const KEEPALIVE_PAYLOAD = Uint8Array.of(1);
const NOOP = () => {};

function safeCall<T extends unknown[]>(callback: (...args: T) => void, ...args: T): void {
  try {
    callback(...args);
  } catch {
    // Consumer callbacks cannot break transport cleanup or delivery.
  }
}

function callSoon(callback: () => void): void {
  try {
    queueMicrotask(() => safeCall(callback));
  } catch {
    safeCall(callback);
  }
}

function dataView(value: unknown): Uint8Array | null {
  try {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    return null;
  } catch {
    return null;
  }
}

export class WebRtcSession implements CoopSession {
  readonly role: CoopRole;

  private readonly messageCallbacks = new Set<(data: Uint8Array, channel: CoopChannel) => void>();
  private readonly peerJoinedCallbacks = new Set<() => void>();
  private readonly closedCallbacks = new Set<(reason: CoopCloseReason) => void>();
  private readonly cachedStats: CoopStats = {
    rttMs: -1,
    bytesSent: 0,
    bytesReceived: 0,
    messagesSent: 0,
    messagesReceived: 0,
    lastReceivedAtMs: 0,
    maintenanceOpen: false,
  };
  private readonly pendingIce: RTCIceCandidateInit[] = [];
  private readonly unsubscribers: Array<() => void> = [];
  private readonly peerConnection: RTCPeerConnection;
  private readonly reliable: RTCDataChannel;
  private readonly unreliable: RTCDataChannel;
  private readonly maintenance: RTCDataChannel;

  private negotiationChain: Promise<void> = Promise.resolve();
  private negotiationStarted = false;
  private remoteDescriptionReady = false;
  private connected = false;
  private closed = false;
  private closeReason: CoopCloseReason | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private statsRequestPending = false;
  private generation = 0;
  private lastAnyReceivedAtMs = 0;
  private bytesSent = 0;
  private bytesReceived = 0;
  private messagesSent = 0;
  private messagesReceived = 0;
  private lastDataReceivedAtMs = 0;

  private constructor(
    private readonly signaling: RtcSignaling,
    peerConnection: RTCPeerConnection,
    reliable: RTCDataChannel,
    unreliable: RTCDataChannel,
    maintenance: RTCDataChannel,
  ) {
    this.role = signaling.role;
    this.peerConnection = peerConnection;
    this.reliable = reliable;
    this.unreliable = unreliable;
    this.maintenance = maintenance;

    this.configureDataChannel(this.reliable, 'reliable');
    this.configureDataChannel(this.unreliable, 'unreliable');
    this.configureMaintenanceChannel();
    this.configurePeerConnection();

    // The channels and peer handlers must exist before queued signaling is released.
    this.unsubscribers.push(
      signaling.onSignal((signal) => this.enqueueSignal(signal)),
      signaling.onConnecting(() => this.beginNegotiation()),
      signaling.onClosed((reason) => this.finish(reason, false)),
    );
  }

  static create(signaling: RtcSignaling, options: WebRtcSessionOptions = {}): WebRtcSession | null {
    let peerConnection: RTCPeerConnection | null = null;
    const channels: RTCDataChannel[] = [];
    try {
      const factory = options.peerConnectionFactory
        ?? ((configuration: RTCConfiguration) => new RTCPeerConnection(configuration));
      peerConnection = factory(DEVELOPMENT_RTC_CONFIGURATION);
      const reliable = peerConnection.createDataChannel('reliable', {
        ordered: true,
        negotiated: true,
        id: 0,
      });
      channels.push(reliable);
      const unreliable = peerConnection.createDataChannel('unreliable', {
        ordered: false,
        maxRetransmits: 0,
        negotiated: true,
        id: 1,
      });
      channels.push(unreliable);
      const maintenance = peerConnection.createDataChannel('maintenance', {
        ordered: false,
        maxRetransmits: 2,
        negotiated: true,
        id: 2,
      });
      channels.push(maintenance);
      return new WebRtcSession(signaling, peerConnection, reliable, unreliable, maintenance);
    } catch {
      for (const channel of channels) {
        try {
          channel.close();
        } catch {
          // Continue releasing the remaining partial initialization.
        }
      }
      try {
        peerConnection?.close();
      } catch {
        // Initialization failure is represented by null.
      }
      try {
        signaling.close('error');
      } catch {
        // Initialization failure is represented by null.
      }
      return null;
    }
  }

  status(): CoopStatus {
    if (this.closed) return 'closed';
    if (this.connected) return 'connected';
    return this.signaling.status();
  }

  rttMs(): number {
    return this.cachedStats.rttMs;
  }

  stats(): CoopStats {
    return this.cachedStats;
  }

  sendUnreliable(data: Uint8Array): void {
    try {
      if (!this.connected || this.closed || data.byteLength > MAX_MESSAGE_BYTES) return;
      if (this.unreliable.readyState !== 'open') return;
      if (this.unreliable.bufferedAmount > UNRELIABLE_BUFFER_LIMIT) return;
      this.unreliable.send(data);
      this.bytesSent += data.byteLength;
      this.messagesSent += 1;
    } catch {
      // Unreliable data is intentionally discarded on any failure.
    }
  }

  sendReliable(data: Uint8Array): void {
    try {
      if (!this.connected || this.closed || data.byteLength > MAX_MESSAGE_BYTES) return;
      if (this.reliable.readyState !== 'open') return;
      if (this.reliable.bufferedAmount > RELIABLE_BUFFER_LIMIT) {
        this.close('error');
        return;
      }
      this.reliable.send(data);
      this.bytesSent += data.byteLength;
      this.messagesSent += 1;
    } catch {
      this.close('error');
    }
  }

  onMessage(callback: (data: Uint8Array, channel: CoopChannel) => void): () => void {
    try {
      this.messageCallbacks.add(callback);
      return () => {
        try {
          this.messageCallbacks.delete(callback);
        } catch {
          // Idempotent and silent.
        }
      };
    } catch {
      return NOOP;
    }
  }

  onPeerJoined(callback: () => void): () => void {
    try {
      this.peerJoinedCallbacks.add(callback);
      if (this.connected && !this.closed) callSoon(callback);
      return () => {
        try {
          this.peerJoinedCallbacks.delete(callback);
        } catch {
          // Idempotent and silent.
        }
      };
    } catch {
      return NOOP;
    }
  }

  onClosed(callback: (reason: CoopCloseReason) => void): () => void {
    try {
      this.closedCallbacks.add(callback);
      if (this.closeReason) {
        const reason = this.closeReason;
        callSoon(() => safeCall(callback, reason));
      }
      return () => {
        try {
          this.closedCallbacks.delete(callback);
        } catch {
          // Idempotent and silent.
        }
      };
    } catch {
      return NOOP;
    }
  }

  close(reason: CoopCloseReason): void {
    this.finish(reason, true);
  }

  private configurePeerConnection(): void {
    this.peerConnection.onicecandidate = (event) => {
      try {
        if (this.closed || !event.candidate) return;
        this.signaling.sendSignal({
          kind: 'ice',
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
        });
      } catch {
        // Trickle ICE is best effort; the 20 second signaling timeout owns failure.
      }
    };
    this.peerConnection.onconnectionstatechange = () => {
      try {
        const state = this.peerConnection.connectionState;
        if (state === 'failed') this.close(this.connected ? 'peer-left' : 'error');
        if (state === 'closed' && !this.closed) this.close('peer-left');
      } catch {
        this.close('error');
      }
    };
    this.peerConnection.oniceconnectionstatechange = () => {
      try {
        if (this.peerConnection.iceConnectionState === 'failed') {
          this.close(this.connected ? 'peer-left' : 'error');
        }
      } catch {
        this.close('error');
      }
    };
  }

  private configureDataChannel(channel: RTCDataChannel, name: CoopChannel): void {
    channel.binaryType = 'arraybuffer';
    channel.onopen = () => this.maybeConnected();
    channel.onclose = () => {
      if (!this.closed) this.close('peer-left');
    };
    channel.onerror = () => {
      if (!this.closed) this.close('peer-left');
    };
    channel.onmessage = (event) => this.receiveData(event.data, name);
  }

  private configureMaintenanceChannel(): void {
    this.maintenance.binaryType = 'arraybuffer';
    this.maintenance.onopen = () => {
      if (this.closed) return;
      this.cachedStats.maintenanceOpen = true;
      if (this.connected) this.startMaintenanceTimers();
    };
    this.maintenance.onclose = () => this.degradeMaintenance();
    this.maintenance.onerror = () => this.degradeMaintenance();
    this.maintenance.onmessage = () => {
      if (this.closed) return;
      this.lastAnyReceivedAtMs = Date.now();
    };
  }

  private beginNegotiation(): void {
    try {
      if (this.closed || this.negotiationStarted) return;
      this.negotiationStarted = true;
      if (this.role === 'host') {
        this.negotiationChain = this.negotiationChain
          .then(async () => {
            const offer = await this.peerConnection.createOffer();
            if (this.closed) return;
            await this.peerConnection.setLocalDescription(offer);
            if (this.closed || !this.peerConnection.localDescription?.sdp) return;
            this.signaling.sendSignal({
              kind: 'sdp',
              sdpType: 'offer',
              sdp: this.peerConnection.localDescription.sdp,
            });
          })
          .catch(() => this.close('error'));
      }
    } catch {
      this.close('error');
    }
  }

  private enqueueSignal(signal: SignalPayload): void {
    try {
      if (this.closed) return;
      this.negotiationChain = this.negotiationChain
        .then(() => this.processSignal(signal))
        .catch(() => this.close('error'));
    } catch {
      this.close('error');
    }
  }

  private async processSignal(signal: SignalPayload): Promise<void> {
    if (this.closed) return;
    if (signal.kind === 'ice') {
      const candidate: RTCIceCandidateInit = {
        candidate: signal.candidate,
        sdpMid: signal.sdpMid,
        sdpMLineIndex: signal.sdpMLineIndex,
      };
      if (!this.remoteDescriptionReady) {
        this.pendingIce.push(candidate);
        return;
      }
      await this.addIce(candidate);
      return;
    }

    if (this.role === 'guest' && signal.sdpType === 'offer') {
      await this.peerConnection.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
      this.remoteDescriptionReady = true;
      await this.flushIce();
      if (this.closed) return;
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      if (this.closed || !this.peerConnection.localDescription?.sdp) return;
      this.signaling.sendSignal({
        kind: 'sdp',
        sdpType: 'answer',
        sdp: this.peerConnection.localDescription.sdp,
      });
      return;
    }

    if (this.role === 'host' && signal.sdpType === 'answer') {
      await this.peerConnection.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
      this.remoteDescriptionReady = true;
      await this.flushIce();
    }
  }

  private async flushIce(): Promise<void> {
    while (!this.closed && this.pendingIce.length > 0) {
      const candidate = this.pendingIce.shift();
      if (candidate) await this.addIce(candidate);
    }
  }

  private async addIce(candidate: RTCIceCandidateInit): Promise<void> {
    try {
      await this.peerConnection.addIceCandidate(candidate);
    } catch {
      // One malformed or obsolete candidate must not discard later candidates.
    }
  }

  private maybeConnected(): void {
    try {
      if (this.closed || this.connected) return;
      if (this.reliable.readyState !== 'open' || this.unreliable.readyState !== 'open') return;
      this.connected = true;
      this.signaling.markConnected();
      this.startStatsTimer();
      if (this.maintenance.readyState === 'open') {
        this.cachedStats.maintenanceOpen = true;
        this.startMaintenanceTimers();
      }
      for (const callback of this.peerJoinedCallbacks) safeCall(callback);
    } catch {
      this.close('error');
    }
  }

  private receiveData(value: unknown, channel: CoopChannel): void {
    try {
      if (!this.connected || this.closed) return;
      const view = dataView(value);
      if (!view || view.byteLength > MAX_MESSAGE_BYTES) return;
      const now = Date.now();
      this.lastAnyReceivedAtMs = now;
      this.lastDataReceivedAtMs = now;
      this.bytesReceived += view.byteLength;
      this.messagesReceived += 1;
      // The view is valid only for this callback turn. Consumers copy only if they need to retain it.
      for (const callback of this.messageCallbacks) safeCall(callback, view, channel);
    } catch {
      // Invalid browser or consumer data is ignored.
    }
  }

  private startStatsTimer(): void {
    if (this.statsTimer || this.closed) return;
    this.refreshStats();
    this.statsTimer = setInterval(() => this.refreshStats(), STATS_INTERVAL_MS);
  }

  private refreshStats(): void {
    try {
      if (this.closed) return;
      this.cachedStats.bytesSent = this.bytesSent;
      this.cachedStats.bytesReceived = this.bytesReceived;
      this.cachedStats.messagesSent = this.messagesSent;
      this.cachedStats.messagesReceived = this.messagesReceived;
      this.cachedStats.lastReceivedAtMs = this.lastDataReceivedAtMs;
      if (this.statsRequestPending) return;
      this.statsRequestPending = true;
      const generation = this.generation;
      void this.peerConnection.getStats()
        .then((report) => {
          if (this.closed || generation !== this.generation) return;
          let selectedPairId: string | null = null;
          report.forEach((entry) => {
            const value = entry as RTCStats & { selectedCandidatePairId?: unknown };
            if (value.type === 'transport' && typeof value.selectedCandidatePairId === 'string') {
              selectedPairId = value.selectedCandidatePairId;
            }
          });

          let rttSeconds: number | null = null;
          report.forEach((entry) => {
            const value = entry as RTCStats & {
              currentRoundTripTime?: unknown;
              nominated?: unknown;
              selected?: unknown;
              state?: unknown;
            };
            if (value.type !== 'candidate-pair' || typeof value.currentRoundTripTime !== 'number') return;
            const isSelected = selectedPairId === value.id
              || value.selected === true
              || (value.state === 'succeeded' && value.nominated === true);
            if (isSelected && Number.isFinite(value.currentRoundTripTime)) {
              rttSeconds = value.currentRoundTripTime;
            }
          });
          this.cachedStats.rttMs = rttSeconds === null ? -1 : Math.max(0, rttSeconds * 1_000);
        })
        .catch(() => {
          // RTT remains at the last cached value.
        })
        .finally(() => {
          if (generation === this.generation) this.statsRequestPending = false;
        });
    } catch {
      this.statsRequestPending = false;
    }
  }

  private startMaintenanceTimers(): void {
    if (this.closed || !this.connected || this.maintenance.readyState !== 'open') return;
    this.stopMaintenanceTimers();
    this.lastAnyReceivedAtMs = Date.now();
    this.keepaliveTimer = setInterval(() => {
      try {
        if (this.closed || this.maintenance.readyState !== 'open') return;
        this.maintenance.send(KEEPALIVE_PAYLOAD);
      } catch {
        this.degradeMaintenance();
      }
    }, KEEPALIVE_INTERVAL_MS);
    this.watchdogTimer = setInterval(() => {
      try {
        if (this.closed || !this.cachedStats.maintenanceOpen) return;
        if (Date.now() - this.lastAnyReceivedAtMs >= WATCHDOG_TIMEOUT_MS) this.close('peer-left');
      } catch {
        this.close('error');
      }
    }, KEEPALIVE_INTERVAL_MS);
  }

  private degradeMaintenance(): void {
    this.cachedStats.maintenanceOpen = false;
    this.stopMaintenanceTimers();
  }

  private stopMaintenanceTimers(): void {
    if (this.keepaliveTimer) clearInterval(this.keepaliveTimer);
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.keepaliveTimer = null;
    this.watchdogTimer = null;
  }

  private finish(reason: CoopCloseReason, closeSignaling: boolean): void {
    if (this.closed) return;
    this.closed = true;
    this.connected = false;
    this.closeReason = reason;
    this.generation += 1;
    this.statsRequestPending = false;
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.statsTimer = null;
    this.stopMaintenanceTimers();
    this.cachedStats.maintenanceOpen = false;
    for (const unsubscribe of this.unsubscribers.splice(0)) safeCall(unsubscribe);
    this.pendingIce.splice(0);

    for (const channel of [this.reliable, this.unreliable, this.maintenance]) {
      try {
        channel.onopen = null;
        channel.onclose = null;
        channel.onerror = null;
        channel.onmessage = null;
        channel.close();
      } catch {
        // One browser channel failure must not skip the remaining cleanup.
      }
    }
    try {
      this.peerConnection.onicecandidate = null;
      this.peerConnection.onconnectionstatechange = null;
      this.peerConnection.oniceconnectionstatechange = null;
      this.peerConnection.close();
    } catch {
      // Cleanup is best effort and terminal.
    }
    if (closeSignaling) {
      try {
        this.signaling.close(reason);
      } catch {
        // The local terminal state is already authoritative.
      }
    }
    for (const callback of this.closedCallbacks) safeCall(callback, reason);
  }
}
