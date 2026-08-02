import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebRtcSession, type RtcSignaling, type SignalPayload } from './webrtc';
import type { CoopCloseReason, CoopRole, CoopStatus } from './types';

class MockSignaling implements RtcSignaling {
  readonly signals: SignalPayload[] = [];
  readonly role: CoopRole;
  private currentStatus: CoopStatus;
  private readonly connectingCallbacks = new Set<() => void>();
  private readonly signalCallbacks = new Set<(signal: SignalPayload) => void>();
  private readonly closedCallbacks = new Set<(reason: CoopCloseReason) => void>();

  constructor(role: CoopRole, status: CoopStatus = 'connecting') {
    this.role = role;
    this.currentStatus = status;
  }

  status(): CoopStatus {
    return this.currentStatus;
  }

  onConnecting(callback: () => void): () => void {
    this.connectingCallbacks.add(callback);
    if (this.currentStatus === 'connecting') queueMicrotask(callback);
    return () => this.connectingCallbacks.delete(callback);
  }

  sendSignal(signal: SignalPayload): void {
    this.signals.push(signal);
  }

  onSignal(callback: (signal: SignalPayload) => void): () => void {
    this.signalCallbacks.add(callback);
    return () => this.signalCallbacks.delete(callback);
  }

  markConnected(): void {
    this.currentStatus = 'connected';
  }

  close(reason: CoopCloseReason): void {
    if (this.currentStatus === 'closed') return;
    this.currentStatus = 'closed';
    for (const callback of this.closedCallbacks) callback(reason);
  }

  onClosed(callback: (reason: CoopCloseReason) => void): () => void {
    this.closedCallbacks.add(callback);
    return () => this.closedCallbacks.delete(callback);
  }

  emitSignal(signal: SignalPayload): void {
    for (const callback of this.signalCallbacks) callback(signal);
  }
}

class MockDataChannel {
  binaryType = '';
  bufferedAmount = 0;
  readyState: RTCDataChannelState = 'connecting';
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  readonly sent: ArrayBufferView[] = [];

  constructor(
    readonly label: string,
    readonly options: RTCDataChannelInit,
  ) {}

  send(data: ArrayBufferView): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 'closed';
  }

  open(): void {
    this.readyState = 'open';
    this.onopen?.(new Event('open'));
  }

  receive(data: ArrayBuffer): void {
    this.onmessage?.(new MessageEvent('message', { data }));
  }

  remoteClose(): void {
    this.readyState = 'closed';
    this.onclose?.(new Event('close'));
  }
}

class MockPeerConnection {
  readonly channels = new Map<string, MockDataChannel>();
  readonly operations: string[] = [];
  localDescription: RTCSessionDescription | null = null;
  remoteDescription: RTCSessionDescription | null = null;
  connectionState: RTCPeerConnectionState = 'new';
  iceConnectionState: RTCIceConnectionState = 'new';
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
  onconnectionstatechange: ((event: Event) => void) | null = null;
  oniceconnectionstatechange: ((event: Event) => void) | null = null;

  createDataChannel(label: string, options: RTCDataChannelInit): RTCDataChannel {
    const channel = new MockDataChannel(label, options);
    this.channels.set(label, channel);
    return channel as unknown as RTCDataChannel;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    this.operations.push('create-offer');
    return { type: 'offer', sdp: 'offer-sdp' };
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    this.operations.push('create-answer');
    return { type: 'answer', sdp: 'answer-sdp' };
  }

  async setLocalDescription(description: RTCLocalSessionDescriptionInit): Promise<void> {
    this.operations.push(`local-${description.type}`);
    this.localDescription = description as RTCSessionDescription;
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.operations.push(`remote-${description.type}`);
    this.remoteDescription = description as RTCSessionDescription;
  }

  async addIceCandidate(): Promise<void> {
    this.operations.push('add-ice');
  }

  async getStats(): Promise<RTCStatsReport> {
    const report = new Map<string, RTCStats>();
    report.set('transport', {
      id: 'transport',
      timestamp: 0,
      type: 'transport',
      selectedCandidatePairId: 'pair',
    } as RTCStats);
    report.set('pair', {
      id: 'pair',
      timestamp: 0,
      type: 'candidate-pair',
      currentRoundTripTime: 0.025,
    } as RTCStats);
    return report as unknown as RTCStatsReport;
  }

  close(): void {
    this.connectionState = 'closed';
  }
}

function fixture(role: CoopRole = 'host') {
  const signaling = new MockSignaling(role);
  const peer = new MockPeerConnection();
  const session = WebRtcSession.create(signaling, {
    peerConnectionFactory: () => peer as unknown as RTCPeerConnection,
  });
  if (!session) throw new Error('fixture failed');
  return { signaling, peer, session };
}

function openAll(peer: MockPeerConnection): void {
  peer.channels.get('maintenance')?.open();
  peer.channels.get('reliable')?.open();
  peer.channels.get('unreliable')?.open();
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.useRealTimers();
});

describe('WebRtcSession', () => {
  it('creates all negotiated channels with fixed ids and the host alone offers', async () => {
    const { signaling, peer, session } = fixture('host');
    await flushMicrotasks();

    expect(peer.channels.get('reliable')?.options).toMatchObject({ ordered: true, negotiated: true, id: 0 });
    expect(peer.channels.get('unreliable')?.options)
      .toMatchObject({ ordered: false, maxRetransmits: 0, negotiated: true, id: 1 });
    expect(peer.channels.get('maintenance')?.options)
      .toMatchObject({ ordered: false, maxRetransmits: 2, negotiated: true, id: 2 });
    expect(signaling.signals).toContainEqual({ kind: 'sdp', sdpType: 'offer', sdp: 'offer-sdp' });
    session.close('local');
  });

  it('connects on the two data channels, keeps maintenance private, and reuses stats', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(50_000);
    const { peer, session } = fixture();
    const messages: number[][] = [];
    session.onMessage((data) => messages.push([...data]));
    openAll(peer);

    expect(session.status()).toBe('connected');
    expect(session.stats()).toBe(session.stats());
    expect(session.stats().maintenanceOpen).toBe(true);
    peer.channels.get('maintenance')?.receive(Uint8Array.of(99).buffer);
    expect(messages).toEqual([]);
    peer.channels.get('unreliable')?.receive(Uint8Array.of(1, 2, 3).buffer);
    expect(messages).toEqual([[1, 2, 3]]);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(peer.channels.get('maintenance')?.sent[0]).toBeDefined();
    expect(session.rttMs()).toBe(25);
    expect(session.stats().bytesReceived).toBe(3);
    expect(session.stats().messagesReceived).toBe(1);
    expect(session.stats().lastReceivedAtMs).toBe(50_000);
    session.close('local');
  });

  it('drops blocked unreliable data and closes on reliable backpressure', () => {
    const { signaling, peer, session } = fixture();
    openAll(peer);
    const unreliable = peer.channels.get('unreliable');
    const reliable = peer.channels.get('reliable');
    if (!unreliable || !reliable) throw new Error('channels missing');

    unreliable.bufferedAmount = 64 * 1024 + 1;
    for (let index = 0; index < 10_000; index += 1) session.sendUnreliable(Uint8Array.of(1));
    expect(unreliable.sent).toHaveLength(0);

    reliable.bufferedAmount = 1024 * 1024 + 1;
    const reasons: CoopCloseReason[] = [];
    session.onClosed((reason) => reasons.push(reason));
    session.sendReliable(Uint8Array.of(2));
    expect(signaling.status()).toBe('closed');
    expect(reasons).toEqual(['error']);
  });

  it('silently drops messages over 16KB', () => {
    const { peer, session } = fixture();
    openAll(peer);
    const reliable = peer.channels.get('reliable');
    const unreliable = peer.channels.get('unreliable');
    session.sendReliable(new Uint8Array(16 * 1024 + 1));
    session.sendUnreliable(new Uint8Array(16 * 1024 + 1));
    expect(reliable?.sent).toHaveLength(0);
    expect(unreliable?.sent).toHaveLength(0);
    expect(session.status()).toBe('connected');
    session.close('local');
  });

  it('releases a partially initialized peer connection without throwing', () => {
    const signaling = new MockSignaling('host');
    const peer = new MockPeerConnection();
    const first = new MockDataChannel('reliable', {});
    let calls = 0;
    peer.createDataChannel = () => {
      calls += 1;
      if (calls === 1) return first as unknown as RTCDataChannel;
      throw new Error('channel unavailable');
    };

    expect(WebRtcSession.create(signaling, {
      peerConnectionFactory: () => peer as unknown as RTCPeerConnection,
    })).toBeNull();
    expect(first.readyState).toBe('closed');
    expect(peer.connectionState).toBe('closed');
    expect(signaling.status()).toBe('closed');
  });

  it('updates data counters even while getStats is still pending', async () => {
    vi.useFakeTimers();
    const { peer, session } = fixture();
    peer.getStats = () => new Promise<RTCStatsReport>(() => {});
    openAll(peer);
    session.sendReliable(Uint8Array.of(1, 2));
    peer.channels.get('unreliable')?.receive(Uint8Array.of(3, 4, 5).buffer);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(session.stats()).toMatchObject({
      bytesSent: 2,
      bytesReceived: 3,
      messagesSent: 1,
      messagesReceived: 1,
    });
    session.close('local');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stays connected when maintenance alone closes', () => {
    const { peer, session } = fixture();
    openAll(peer);
    peer.channels.get('maintenance')?.remoteClose();
    expect(session.status()).toBe('connected');
    expect(session.stats().maintenanceOpen).toBe(false);
    session.close('local');
  });

  it('closes peer-left after three seconds without any incoming channel data', async () => {
    vi.useFakeTimers();
    const { peer, session } = fixture();
    const reasons: CoopCloseReason[] = [];
    session.onClosed((reason) => reasons.push(reason));
    openAll(peer);

    await vi.advanceTimersByTimeAsync(3_000);
    expect(session.status()).toBe('closed');
    expect(reasons).toEqual(['peer-left']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('normalizes a data-channel departure to peer-left once', () => {
    const { peer, session } = fixture();
    openAll(peer);
    const reasons: CoopCloseReason[] = [];
    session.onClosed((reason) => reasons.push(reason));
    peer.channels.get('reliable')?.remoteClose();
    peer.channels.get('unreliable')?.remoteClose();
    expect(reasons).toEqual(['peer-left']);
  });

  it('queues ICE until the guest has applied the remote offer', async () => {
    const { signaling, peer, session } = fixture('guest');
    signaling.emitSignal({ kind: 'ice', candidate: 'candidate', sdpMid: '0', sdpMLineIndex: 0 });
    signaling.emitSignal({ kind: 'sdp', sdpType: 'offer', sdp: 'offer-sdp' });
    await flushMicrotasks();
    await flushMicrotasks();

    expect(peer.operations.indexOf('remote-offer')).toBeGreaterThanOrEqual(0);
    expect(peer.operations.indexOf('add-ice')).toBeGreaterThan(peer.operations.indexOf('remote-offer'));
    await vi.waitFor(() => {
      expect(signaling.signals).toContainEqual({ kind: 'sdp', sdpType: 'answer', sdp: 'answer-sdp' });
    });
    session.close('local');
  });
});
