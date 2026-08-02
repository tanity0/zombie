import { onlineAllowed } from './config';
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
type MessageCallback = (data: Uint8Array, channel: CoopChannel) => void;
type ClosedCallback = (reason: CoopCloseReason) => void;

export interface LoopbackOptions {
  /** 片道の固定遅延(ms)。負数や非有限値は0として扱う。 */
  latencyMs?: number;
  /** unreliable に注入するパケットロス率(0〜100%)。reliable には適用しない。 */
  packetLossPercent?: number;
}

export interface LoopbackPair {
  readonly host: CoopApi;
  readonly guest: CoopApi;
}

interface LoopbackRoom {
  readonly roomId: string;
  readonly ad: CoopAd;
  readonly createdAt: number;
  readonly hostSession: LoopbackSession;
}

const NOOP = () => {};

function finiteInRange(value: number | undefined, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function callSafely<T extends unknown[]>(callback: (...args: T) => void, ...args: T): void {
  try {
    callback(...args);
  } catch {
    // Consumer callbacks cannot break the transport.
  }
}

function callSoon(callback: () => void): void {
  try {
    queueMicrotask(() => callSafely(callback));
  } catch {
    callSafely(callback);
  }
}

class LoopbackSession implements CoopSession {
  readonly role: CoopRole;

  private currentStatus: CoopStatus;
  private closeReason: CoopCloseReason | null = null;
  private peer: LoopbackSession | null = null;
  private readonly messageCallbacks = new Set<MessageCallback>();
  private readonly peerJoinedCallbacks = new Set<() => void>();
  private readonly closedCallbacks = new Set<ClosedCallback>();
  private readonly cachedStats: CoopStats = {
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
    private readonly latencyMs: number,
    private readonly packetLossPercent: number,
    private readonly onFinished: () => void,
  ) {
    this.role = role;
    this.currentStatus = initialStatus;
  }

  status(): CoopStatus {
    return this.currentStatus;
  }

  rttMs(): number {
    return this.currentStatus === 'connected' ? this.latencyMs * 2 : -1;
  }

  stats(): CoopStats {
    this.cachedStats.rttMs = this.rttMs();
    return this.cachedStats;
  }

  link(peer: LoopbackSession): void {
    try {
      if (this.currentStatus === 'closed') return;
      this.peer = peer;
      this.currentStatus = 'connecting';
    } catch {
      this.finish('error');
    }
  }

  connected(): void {
    try {
      if (this.currentStatus === 'closed' || !this.peer) return;
      this.currentStatus = 'connected';
      for (const callback of [...this.peerJoinedCallbacks]) callSafely(callback);
    } catch {
      this.finish('error');
    }
  }

  sendUnreliable(data: Uint8Array): void {
    try {
      if (Math.random() * 100 < this.packetLossPercent) return;
      this.send(data, 'unreliable');
    } catch {
      // Unreliable data is silently discarded on any failure.
    }
  }

  sendReliable(data: Uint8Array): void {
    try {
      this.send(data, 'reliable');
    } catch {
      // A closed or unusable transport is silent by contract.
    }
  }

  private send(data: Uint8Array, channel: CoopChannel): void {
    if (this.currentStatus !== 'connected' || !this.peer) return;
    const receiver = this.peer;
    const payload = data.slice();
    this.cachedStats.bytesSent += data.byteLength;
    this.cachedStats.messagesSent += 1;
    setTimeout(() => receiver.receive(payload, channel), this.latencyMs);
  }

  private receive(data: Uint8Array, channel: CoopChannel): void {
    try {
      if (this.currentStatus !== 'connected') return;
      this.cachedStats.bytesReceived += data.byteLength;
      this.cachedStats.messagesReceived += 1;
      this.cachedStats.lastReceivedAtMs = Date.now();
      for (const callback of [...this.messageCallbacks]) callSafely(callback, data, channel);
    } catch {
      // Receiving must never escape into the game loop.
    }
  }

  onMessage(callback: MessageCallback): () => void {
    try {
      this.messageCallbacks.add(callback);
      return () => {
        try {
          this.messageCallbacks.delete(callback);
        } catch {
          // Unsubscribing is intentionally idempotent and silent.
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
          // Unsubscribing is intentionally idempotent and silent.
        }
      };
    } catch {
      return NOOP;
    }
  }

  onClosed(callback: ClosedCallback): () => void {
    try {
      this.closedCallbacks.add(callback);
      if (this.closeReason) {
        const reason = this.closeReason;
        callSoon(() => callSafely(callback, reason));
      }
      return () => {
        try {
          this.closedCallbacks.delete(callback);
        } catch {
          // Unsubscribing is intentionally idempotent and silent.
        }
      };
    } catch {
      return NOOP;
    }
  }

  close(reason: CoopCloseReason): void {
    try {
      if (this.currentStatus === 'closed') return;
      const peer = this.peer;
      this.peer = null;
      this.finish(reason);
      if (peer) {
        peer.peer = null;
        peer.finish('peer-left');
      }
    } catch {
      this.finish('error');
    }
  }

  private finish(reason: CoopCloseReason): void {
    if (this.currentStatus === 'closed') return;
    this.currentStatus = 'closed';
    this.closeReason = reason;
    callSafely(this.onFinished);
    for (const callback of [...this.closedCallbacks]) callSafely(callback, reason);
  }
}

/**
 * 同一プロセス内で advertise/listOpen/join を行う2者を作る。
 * 戻り値の口は本番実装と同じ CoopApi なので、ゲーム側は差し替えるだけで使える。
 */
export function createLoopbackPair(options: LoopbackOptions = {}): LoopbackPair | null {
  try {
    const latencyMs = finiteInRange(options.latencyMs, 0, 2_147_483_647);
    const packetLossPercent = finiteInRange(options.packetLossPercent, 0, 100);
    let room: LoopbackRoom | null = null;
    let hostActive: LoopbackSession | null = null;
    let guestActive: LoopbackSession | null = null;
    let nextRoomId = 1;

    const host: CoopApi = {
      enabled: onlineAllowed,
      async advertise(ad: CoopAd): Promise<CoopSession | null> {
        try {
          if (!onlineAllowed() || (hostActive && hostActive.status() !== 'closed')) return null;
          const session = new LoopbackSession(
            'host',
            'advertising',
            latencyMs,
            packetLossPercent,
            () => {
              if (hostActive === session) hostActive = null;
              if (room?.hostSession === session) room = null;
            },
          );
          room = {
            roomId: `loopback-${nextRoomId++}`,
            ad: { ...ad },
            createdAt: Date.now(),
            hostSession: session,
          };
          hostActive = session;
          return session;
        } catch {
          return null;
        }
      },
      async listOpen(): Promise<CoopOpenRoom[]> {
        return [];
      },
      async join(): Promise<CoopSession | null> {
        return null;
      },
    };

    const guest: CoopApi = {
      enabled: onlineAllowed,
      async advertise(): Promise<CoopSession | null> {
        return null;
      },
      async listOpen(matchKey: string, buildVersion: string): Promise<CoopOpenRoom[]> {
        try {
          if (!onlineAllowed() || !room || room.hostSession.status() !== 'advertising') return [];
          if (room.ad.matchKey !== matchKey || room.ad.buildVersion !== buildVersion) return [];
          return [{
            roomId: room.roomId,
            label: room.ad.label,
            matchKey: room.ad.matchKey,
            ageMs: Math.max(0, Date.now() - room.createdAt),
          }];
        } catch {
          return [];
        }
      },
      async join(roomId: string): Promise<CoopSession | null> {
        try {
          if (!onlineAllowed() || (guestActive && guestActive.status() !== 'closed')) return null;
          const selected = room;
          if (!selected || selected.roomId !== roomId || selected.hostSession.status() !== 'advertising') {
            return null;
          }

          const session = new LoopbackSession(
            'guest',
            'connecting',
            latencyMs,
            packetLossPercent,
            () => {
              if (guestActive === session) guestActive = null;
            },
          );
          guestActive = session;
          room = null;
          selected.hostSession.link(session);
          session.link(selected.hostSession);
          selected.hostSession.connected();
          session.connected();
          return session;
        } catch {
          return null;
        }
      },
    };

    return { host, guest };
  } catch {
    return null;
  }
}
