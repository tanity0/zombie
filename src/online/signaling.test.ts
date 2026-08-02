import { afterEach, describe, expect, it, vi } from 'vitest';
import { enabled, signalUrl } from './config';
import { getAnonymousId } from './id';
import { createSignalingApi } from './signaling';

type FakeEvent = { data?: string };
type FakeListener = (event: FakeEvent) => void;

class FakeDataChannel {
  binaryType = '';
  bufferedAmount = 0;
  readyState: RTCDataChannelState = 'connecting';
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  send(): void {}
  close(): void {
    this.readyState = 'closed';
  }
}

class FakePeerConnection {
  localDescription: RTCSessionDescription | null = null;
  remoteDescription: RTCSessionDescription | null = null;
  connectionState: RTCPeerConnectionState = 'new';
  iceConnectionState: RTCIceConnectionState = 'new';
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
  onconnectionstatechange: ((event: Event) => void) | null = null;
  oniceconnectionstatechange: ((event: Event) => void) | null = null;

  createDataChannel(): RTCDataChannel {
    return new FakeDataChannel() as unknown as RTCDataChannel;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'offer', sdp: 'offer' };
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'answer', sdp: 'answer' };
  }

  async setLocalDescription(description: RTCLocalSessionDescriptionInit): Promise<void> {
    this.localDescription = description as RTCSessionDescription;
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = description as RTCSessionDescription;
  }

  async addIceCandidate(): Promise<void> {}

  async getStats(): Promise<RTCStatsReport> {
    return new Map() as unknown as RTCStatsReport;
  }

  close(): void {
    this.connectionState = 'closed';
  }
}

class FakeSignalingSocket {
  static readonly OPEN = 1;

  readyState = 0;
  closeCount = 0;
  private readonly listeners = new Map<string, Set<FakeListener>>();

  constructor(private readonly hub: FakeSignalingHub) {
    queueMicrotask(() => {
      this.readyState = FakeSignalingSocket.OPEN;
      this.emit('open');
    });
  }

  addEventListener(type: string, listener: FakeListener): void {
    const listeners = this.listeners.get(type) ?? new Set<FakeListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  send(data: string): void {
    this.hub.receive(this, JSON.parse(data) as Record<string, unknown>);
  }

  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.closeCount += 1;
    this.emit('close');
  }

  message(value: Record<string, unknown>): void {
    this.emit('message', { data: JSON.stringify(value) });
  }

  private emit(type: string, event: FakeEvent = {}): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }
}

class FakeSignalingHub {
  readonly sockets: FakeSignalingSocket[] = [];
  hostSocket: FakeSignalingSocket | null = null;
  guestSocket: FakeSignalingSocket | null = null;
  private open = false;

  connect(): FakeSignalingSocket {
    const socket = new FakeSignalingSocket(this);
    this.sockets.push(socket);
    return socket;
  }

  receive(socket: FakeSignalingSocket, message: Record<string, unknown>): void {
    const requestId = typeof message.requestId === 'string' ? message.requestId : undefined;
    if (message.type === 'advertise') {
      this.hostSocket = socket;
      this.open = true;
      socket.message({ type: 'response', requestId, ok: true, roomId: 'room-1' });
      return;
    }
    if (message.type === 'list') {
      const rooms = this.open && message.buildVersion === 'v1'
        ? [{ roomId: 'room-1', label: 'room', matchKey: 'opaque', ageMs: 1 }]
        : [];
      socket.message({ type: 'response', requestId, ok: true, rooms });
      return;
    }
    if (message.type === 'join' && this.open) {
      this.open = false;
      this.guestSocket = socket;
      socket.message({ type: 'response', requestId, ok: true, roomId: 'room-1' });
      this.hostSocket?.message({ type: 'peer-joined', roomId: 'room-1' });
      return;
    }
    if (message.type === 'leave-room') {
      this.hostSocket?.message({ type: 'peer-left', roomId: 'room-1' });
    }
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('signaling configuration and fallbacks', () => {
  it('defaults to disabled and supports query and instance endpoint overrides', () => {
    vi.stubGlobal('window', { location: { search: '' } });
    expect(enabled()).toBe(false);
    expect(signalUrl()).toBeNull();

    vi.stubGlobal('window', { location: { search: '?signal=ws%3A%2F%2F127.0.0.1%3A9999' } });
    expect(signalUrl()).toBe('ws://127.0.0.1:9999/');

    vi.stubGlobal('window', { location: { search: '?signal=' } });
    expect(signalUrl()).toBeNull();
    expect(enabled()).toBe(false);

    expect(enabled('ws://localhost:8787')).toBe(true);
    expect(signalUrl('ws://localhost:8787')).toBe('ws://localhost:8787/');
    vi.stubGlobal('window', { location: { search: '?online=0' } });
    expect(enabled('ws://localhost:8787')).toBe(false);
  });

  it('creates a UUID when randomUUID is unavailable', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(17);
        return bytes;
      },
    });

    expect(getAnonymousId()).toMatch(/^[0-9a-f-]{36}$/);
    expect(getAnonymousId()).toBe(values.values().next().value);
  });

  it('silently returns null/empty when the signaling server cannot be opened', async () => {
    vi.stubGlobal('window', { location: { search: '' } });
    vi.stubGlobal('localStorage', {
      getItem: () => '123e4567-e89b-42d3-a456-426614174000',
      setItem: () => {},
    });
    const api = createSignalingApi({
      signalUrl: 'ws://localhost:8787',
      webSocketFactory: () => {
        throw new Error('offline');
      },
      requestTimeoutMs: 1,
    });

    await expect(api.advertise({ buildVersion: 'v1', matchKey: 'opaque', label: 'room' }))
      .resolves.toBeNull();
    await expect(api.listOpen('opaque', 'v1')).resolves.toEqual([]);
  });

  it('completes advertise/list/join and releases both sockets when a peer leaves', async () => {
    vi.stubGlobal('window', { location: { search: '' } });
    vi.stubGlobal('localStorage', {
      getItem: () => '123e4567-e89b-42d3-a456-426614174000',
      setItem: () => {},
    });
    vi.stubGlobal('WebSocket', FakeSignalingSocket);
    const hub = new FakeSignalingHub();
    const options = {
      signalUrl: 'ws://localhost:8787',
      webSocketFactory: () => hub.connect() as unknown as WebSocket,
      peerConnectionFactory: () => new FakePeerConnection() as unknown as RTCPeerConnection,
      requestTimeoutMs: 100,
      connectTimeoutMs: 1_000,
    };
    const hostApi = createSignalingApi(options);
    const guestApi = createSignalingApi(options);

    const host = await hostApi.advertise({ buildVersion: 'v1', matchKey: 'opaque', label: 'room' });
    expect(host?.status()).toBe('advertising');
    await expect(guestApi.listOpen('opaque', 'v2')).resolves.toEqual([]);
    const rooms = await guestApi.listOpen('opaque', 'v1');
    expect(rooms).toHaveLength(1);
    const guest = await guestApi.join(rooms[0].roomId);
    expect(host?.status()).toBe('connecting');
    expect(guest?.status()).toBe('connecting');

    const hostClosed: string[] = [];
    host?.onClosed((reason) => hostClosed.push(reason));
    guest?.close('local');
    expect(host?.status()).toBe('closed');
    expect(guest?.status()).toBe('closed');
    expect(hostClosed).toEqual(['peer-left']);
    expect(hub.hostSocket?.closeCount).toBe(1);
    expect(hub.guestSocket?.closeCount).toBe(1);
  });
});
