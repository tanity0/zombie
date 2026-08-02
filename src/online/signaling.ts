import { enabled as onlineEnabled, signalUrl as configuredSignalUrl } from './config';
import { getAnonymousId } from './id';
import {
  WebRtcSession,
  type PeerConnectionFactory,
  type SignalPayload,
} from './webrtc';
import type {
  CoopAd,
  CoopApi,
  CoopCloseReason,
  CoopOpenRoom,
  CoopRole,
  CoopSession,
  CoopStats,
  CoopStatus,
} from './types';

type CoopChannel = 'unreliable' | 'reliable';

type ServerMessage = {
  type?: string;
  requestId?: string;
  ok?: boolean;
  roomId?: string;
  rooms?: unknown;
  signal?: unknown;
};

type PendingRequest = {
  timer: ReturnType<typeof setTimeout>;
  resolve: (message: ServerMessage | null) => void;
};

export interface SignalingApiOptions {
  signalUrl?: string;
  webSocketFactory?: (url: string) => WebSocket;
  peerConnectionFactory?: PeerConnectionFactory;
  requestTimeoutMs?: number;
  connectTimeoutMs?: number;
}

const NOOP = () => {};
const DEFAULT_REQUEST_TIMEOUT_MS = 2_500;
const DEFAULT_WEBSOCKET_CONNECT_TIMEOUT_MS = 8_000;
const DEFAULT_CONNECT_TIMEOUT_MS = 20_000;
const ROOM_HEARTBEAT_INTERVAL_MS = 30_000;
const SIGNAL_GRACE_MS = 5_000;
const MAX_EVENT_BACKLOG = 64;
const MAX_INCOMING_MESSAGE_LENGTH = 16_384;

function safeCall<T extends unknown[]>(callback: (...args: T) => void, ...args: T): void {
  try {
    callback(...args);
  } catch {
    // Consumer callbacks cannot break the online layer.
  }
}

function callSoon(callback: () => void): void {
  try {
    queueMicrotask(() => safeCall(callback));
  } catch {
    safeCall(callback);
  }
}

function finiteTimeout(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.min(value, 60_000)
    : fallback;
}

function randomRequestId(): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  } catch {
    // The monotonic fallback below is sufficient for one WebSocket connection.
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function isRoom(value: unknown): value is CoopOpenRoom {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const room = value as Partial<CoopOpenRoom>;
  return typeof room.roomId === 'string'
    && typeof room.label === 'string'
    && typeof room.matchKey === 'string'
    && typeof room.ageMs === 'number'
    && Number.isFinite(room.ageMs)
    && room.ageMs >= 0;
}

function isSignal(value: unknown): value is SignalPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const signal = value as Partial<SignalPayload>;
  if (signal.kind === 'sdp') {
    return (signal.sdpType === 'offer' || signal.sdpType === 'answer') && typeof signal.sdp === 'string';
  }
  return signal.kind === 'ice'
    && typeof signal.candidate === 'string'
    && (signal.sdpMid === null || typeof signal.sdpMid === 'string')
    && (signal.sdpMLineIndex === null || Number.isInteger(signal.sdpMLineIndex));
}

class SignalConnection {
  private readonly pending = new Map<string, PendingRequest>();
  private readonly eventCallbacks = new Set<(message: ServerMessage) => void>();
  private readonly closeCallbacks = new Set<() => void>();
  private readonly backlog: ServerMessage[] = [];
  private closed = false;

  constructor(
    private readonly socket: WebSocket,
    private readonly requestTimeoutMs: number,
  ) {
    socket.addEventListener('message', (event) => this.handleMessage(event));
    socket.addEventListener('close', () => this.handleClose());
    socket.addEventListener('error', () => this.handleClose());
  }

  request(message: Record<string, unknown>): Promise<ServerMessage | null> {
    try {
      if (this.closed || this.socket.readyState !== WebSocket.OPEN) return Promise.resolve(null);
      const requestId = randomRequestId();
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          this.pending.delete(requestId);
          resolve(null);
        }, this.requestTimeoutMs);
        this.pending.set(requestId, { timer, resolve });
        try {
          this.socket.send(JSON.stringify({ ...message, requestId }));
        } catch {
          clearTimeout(timer);
          this.pending.delete(requestId);
          resolve(null);
        }
      });
    } catch {
      return Promise.resolve(null);
    }
  }

  send(message: Record<string, unknown>): void {
    try {
      if (this.closed || this.socket.readyState !== WebSocket.OPEN) return;
      this.socket.send(JSON.stringify(message));
    } catch {
      // Signaling is best effort here; session timeout/close owns recovery.
    }
  }

  onEvent(callback: (message: ServerMessage) => void): () => void {
    try {
      this.eventCallbacks.add(callback);
      for (const message of this.backlog.splice(0)) safeCall(callback, message);
      return () => {
        try {
          this.eventCallbacks.delete(callback);
        } catch {
          // Idempotent and silent.
        }
      };
    } catch {
      return NOOP;
    }
  }

  onClose(callback: () => void): () => void {
    try {
      this.closeCallbacks.add(callback);
      if (this.closed) callSoon(callback);
      return () => {
        try {
          this.closeCallbacks.delete(callback);
        } catch {
          // Idempotent and silent.
        }
      };
    } catch {
      return NOOP;
    }
  }

  close(): void {
    try {
      if (this.closed) return;
      this.socket.close(1000, 'local');
    } catch {
      this.handleClose();
    }
  }

  private handleMessage(event: MessageEvent): void {
    try {
      if (typeof event.data !== 'string' || event.data.length > MAX_INCOMING_MESSAGE_LENGTH) return;
      const message = JSON.parse(event.data) as ServerMessage;
      if (!message || typeof message !== 'object' || Array.isArray(message)) return;
      if (message.type === 'response' && typeof message.requestId === 'string') {
        const pending = this.pending.get(message.requestId);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(message.requestId);
        pending.resolve(message);
        return;
      }
      if (this.eventCallbacks.size === 0) {
        if (this.backlog.length >= MAX_EVENT_BACKLOG) this.backlog.shift();
        this.backlog.push(message);
        return;
      }
      for (const callback of [...this.eventCallbacks]) safeCall(callback, message);
    } catch {
      // Invalid server input is ignored.
    }
  }

  private handleClose(): void {
    if (this.closed) return;
    this.closed = true;
    for (const { timer, resolve } of this.pending.values()) {
      clearTimeout(timer);
      resolve(null);
    }
    this.pending.clear();
    for (const callback of [...this.closeCallbacks]) safeCall(callback);
  }
}

function openConnection(
  url: string,
  factory: (url: string) => WebSocket,
  connectTimeoutMs: number,
  requestTimeoutMs: number,
): Promise<SignalConnection | null> {
  try {
    const socket = factory(url);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value: SignalConnection | null): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };
      const timer = setTimeout(() => {
        try {
          socket.close();
        } catch {
          // Best effort.
        }
        finish(null);
      }, connectTimeoutMs);
      socket.addEventListener('open', () => finish(new SignalConnection(socket, requestTimeoutMs)), { once: true });
      socket.addEventListener('error', () => finish(null), { once: true });
      socket.addEventListener('close', () => finish(null), { once: true });
    });
  } catch {
    return Promise.resolve(null);
  }
}

/** WebRTCの確立中だけ生かす、ゲームデータを一切通さないシグナリング状態。 */
export class SignalingSession implements CoopSession {
  readonly role: CoopRole;

  private currentStatus: CoopStatus;
  private closeReason: CoopCloseReason | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private signalCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly messageCallbacks = new Set<(data: Uint8Array, channel: CoopChannel) => void>();
  private readonly peerJoinedCallbacks = new Set<() => void>();
  private readonly closedCallbacks = new Set<(reason: CoopCloseReason) => void>();
  private readonly signalCallbacks = new Set<(signal: SignalPayload) => void>();
  private readonly connectingCallbacks = new Set<() => void>();
  private readonly signalBacklog: SignalPayload[] = [];
  private readonly emptyStats: CoopStats = {
    rttMs: -1,
    bytesSent: 0,
    bytesReceived: 0,
    messagesSent: 0,
    messagesReceived: 0,
    lastReceivedAtMs: 0,
    maintenanceOpen: false,
  };

  constructor(
    role: CoopRole,
    initialStatus: CoopStatus,
    private readonly roomId: string,
    private readonly connection: SignalConnection,
    private readonly connectTimeoutMs: number,
    private readonly onFinished: () => void,
  ) {
    this.role = role;
    this.currentStatus = initialStatus;
    connection.onEvent((message) => this.handleEvent(message));
    connection.onClose(() => {
      if (this.currentStatus !== 'connected') this.finish('error');
    });
    if (role === 'host') this.startHeartbeat();
    if (initialStatus === 'connecting') this.startConnectTimeout();
  }

  status(): CoopStatus {
    return this.currentStatus;
  }

  rttMs(): number {
    return -1;
  }

  stats(): CoopStats {
    return this.emptyStats;
  }

  sendUnreliable(_data: Uint8Array): void {
    // Game bytes intentionally do not enter the signaling server. CO-3 supplies DataChannels.
  }

  sendReliable(_data: Uint8Array): void {
    // Game bytes intentionally do not enter the signaling server. CO-3 supplies DataChannels.
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
      if (this.currentStatus === 'connected') callSoon(callback);
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

  sendSignal(signal: SignalPayload): void {
    try {
      if ((this.currentStatus !== 'connecting' && this.currentStatus !== 'connected') || !isSignal(signal)) return;
      this.connection.send({ type: 'relay', roomId: this.roomId, signal });
    } catch {
      // SDP/ICE relay is best effort; connection timeout owns recovery.
    }
  }

  onSignal(callback: (signal: SignalPayload) => void): () => void {
    try {
      this.signalCallbacks.add(callback);
      for (const signal of this.signalBacklog.splice(0)) safeCall(callback, signal);
      return () => {
        try {
          this.signalCallbacks.delete(callback);
        } catch {
          // Idempotent and silent.
        }
      };
    } catch {
      return NOOP;
    }
  }

  onConnecting(callback: () => void): () => void {
    try {
      this.connectingCallbacks.add(callback);
      if (this.currentStatus === 'connecting') callSoon(callback);
      return () => {
        try {
          this.connectingCallbacks.delete(callback);
        } catch {
          // Idempotent and silent.
        }
      };
    } catch {
      return NOOP;
    }
  }

  markConnected(): void {
    try {
      if (this.currentStatus !== 'connecting') return;
      this.clearConnectTimeout();
      this.clearHeartbeat();
      this.currentStatus = 'connected';
      for (const callback of [...this.peerJoinedCallbacks]) safeCall(callback);
      this.signalCloseTimer = setTimeout(() => this.connection.close(), SIGNAL_GRACE_MS);
    } catch {
      this.finish('error');
    }
  }

  close(reason: CoopCloseReason): void {
    try {
      if (this.currentStatus === 'closed') return;
      this.connection.send({
        type: this.role === 'host' ? 'close-room' : 'leave-room',
        roomId: this.roomId,
      });
      this.finish(reason);
    } catch {
      this.finish('error');
    }
  }

  private handleEvent(message: ServerMessage): void {
    try {
      if (message.roomId !== this.roomId) return;
      if (message.type === 'peer-joined' && this.role === 'host' && this.currentStatus === 'advertising') {
        this.currentStatus = 'connecting';
        this.startConnectTimeout();
        for (const callback of this.connectingCallbacks) safeCall(callback);
        return;
      }
      if (message.type === 'signal' && isSignal(message.signal)) {
        if (this.signalCallbacks.size === 0) {
          if (this.signalBacklog.length >= MAX_EVENT_BACKLOG) this.signalBacklog.shift();
          this.signalBacklog.push(message.signal);
        } else {
          for (const callback of this.signalCallbacks) safeCall(callback, message.signal);
        }
        return;
      }
      if (this.currentStatus === 'connected') return;
      if (message.type === 'peer-left') this.finish('peer-left');
      if (message.type === 'room-expired') this.finish('timeout');
    } catch {
      this.finish('error');
    }
  }

  private startConnectTimeout(): void {
    this.clearConnectTimeout();
    this.connectTimer = setTimeout(() => this.close('timeout'), this.connectTimeoutMs);
  }

  private clearConnectTimeout(): void {
    if (!this.connectTimer) return;
    clearTimeout(this.connectTimer);
    this.connectTimer = null;
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      try {
        if (this.currentStatus !== 'advertising' && this.currentStatus !== 'connecting') return;
        this.connection.send({ type: 'heartbeat', roomId: this.roomId });
      } catch {
        // TTL provides the eventual cleanup path.
      }
    }, ROOM_HEARTBEAT_INTERVAL_MS);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private finish(reason: CoopCloseReason): void {
    if (this.currentStatus === 'closed') return;
    this.clearConnectTimeout();
    this.clearHeartbeat();
    if (this.signalCloseTimer) clearTimeout(this.signalCloseTimer);
    this.signalCloseTimer = null;
    this.currentStatus = 'closed';
    this.closeReason = reason;
    this.connection.close();
    safeCall(this.onFinished);
    for (const callback of [...this.closedCallbacks]) safeCall(callback, reason);
  }
}

export function createSignalingApi(options: SignalingApiOptions = {}): CoopApi {
  const factory = options.webSocketFactory ?? ((url: string) => new WebSocket(url));
  const requestTimeoutMs = finiteTimeout(options.requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS);
  const connectTimeoutMs = finiteTimeout(options.connectTimeoutMs, DEFAULT_CONNECT_TIMEOUT_MS);
  const explicitSignalUrl = options.signalUrl;
  let activeSession: WebRtcSession | null = null;
  let sessionPending = false;

  const available = (): boolean => {
    try {
      return onlineEnabled(explicitSignalUrl) && typeof factory === 'function';
    } catch {
      return false;
    }
  };

  const connect = async (): Promise<SignalConnection | null> => {
    try {
      const url = configuredSignalUrl(explicitSignalUrl);
      if (!available() || !url) return null;
      return await openConnection(url, factory, DEFAULT_WEBSOCKET_CONNECT_TIMEOUT_MS, requestTimeoutMs);
    } catch {
      return null;
    }
  };

  return {
    enabled: available,

    async advertise(ad: CoopAd): Promise<CoopSession | null> {
      let connection: SignalConnection | null = null;
      try {
        if (!available() || sessionPending || (activeSession && activeSession.status() !== 'closed')) return null;
        sessionPending = true;
        const hostId = getAnonymousId();
        if (!hostId) return null;
        connection = await connect();
        if (!connection) return null;
        const response = await connection.request({ type: 'advertise', hostId, ad });
        if (!response?.ok || typeof response.roomId !== 'string') {
          connection.close();
          return null;
        }
        let session: WebRtcSession | null = null;
        const signaling = new SignalingSession(
          'host',
          'advertising',
          response.roomId,
          connection,
          connectTimeoutMs,
          () => {
            if (activeSession === session) activeSession = null;
          },
        );
        session = WebRtcSession.create(signaling, {
          peerConnectionFactory: options.peerConnectionFactory,
        });
        if (!session) {
          signaling.close('error');
          return null;
        }
        activeSession = session;
        return session;
      } catch {
        connection?.close();
        return null;
      } finally {
        sessionPending = false;
      }
    },

    async listOpen(matchKey: string, buildVersion: string): Promise<CoopOpenRoom[]> {
      try {
        if (!available()) return [];
        const connection = await connect();
        if (!connection) return [];
        const response = await connection.request({ type: 'list', matchKey, buildVersion });
        connection.close();
        if (!response?.ok || !Array.isArray(response.rooms)) return [];
        return response.rooms.filter(isRoom).map((room) => ({ ...room }));
      } catch {
        return [];
      }
    },

    async join(roomId: string): Promise<CoopSession | null> {
      let connection: SignalConnection | null = null;
      try {
        if (!available() || sessionPending || (activeSession && activeSession.status() !== 'closed')) return null;
        sessionPending = true;
        const guestId = getAnonymousId();
        if (!guestId) return null;
        connection = await connect();
        if (!connection) return null;
        const response = await connection.request({ type: 'join', guestId, roomId });
        if (!response?.ok || response.roomId !== roomId) {
          connection.close();
          return null;
        }
        let session: WebRtcSession | null = null;
        const signaling = new SignalingSession(
          'guest',
          'connecting',
          roomId,
          connection,
          connectTimeoutMs,
          () => {
            if (activeSession === session) activeSession = null;
          },
        );
        session = WebRtcSession.create(signaling, {
          peerConnectionFactory: options.peerConnectionFactory,
        });
        if (!session) {
          signaling.close('error');
          return null;
        }
        activeSession = session;
        return session;
      } catch {
        connection?.close();
        return null;
      } finally {
        sessionPending = false;
      }
    },
  };
}
