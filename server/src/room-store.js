export const OPEN_ROOM_TTL_MS = 90_000;
export const MAX_ROOMS = 128;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

function boundedString(value, maxLength, { filter = false } = {}) {
  if (typeof value !== 'string') return null;
  const candidate = filter ? value.normalize('NFKC').replace(CONTROL_CHARACTERS, '').trim() : value;
  if (candidate.length === 0 || candidate.length > maxLength) return null;
  if (!filter && CONTROL_CHARACTERS.test(candidate)) return null;
  CONTROL_CHARACTERS.lastIndex = 0;
  return candidate;
}

export function normalizeAd(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const buildVersion = boundedString(value.buildVersion, 64);
  const matchKey = boundedString(value.matchKey, 128);
  const label = boundedString(value.label, 64, { filter: true });
  if (!buildVersion || !matchKey || !label) return null;
  return { buildVersion, matchKey, label };
}

export function validAnonymousId(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export class RoomStore {
  constructor({ now = () => Date.now(), createId = () => crypto.randomUUID() } = {}) {
    this.now = now;
    this.createId = createId;
    this.rooms = new Map();
  }

  pruneExpired() {
    const now = this.now();
    const expired = [];
    for (const [roomId, room] of this.rooms) {
      if (room.state === 'open' && now - room.lastSeenAt >= OPEN_ROOM_TTL_MS) {
        this.rooms.delete(roomId);
        expired.push(room);
      }
    }
    return expired;
  }

  hasSession(connectionId) {
    for (const room of this.rooms.values()) {
      if (room.hostConnectionId === connectionId || room.guestConnectionId === connectionId) return true;
    }
    return false;
  }

  create(connectionId, hostId, adValue) {
    this.pruneExpired();
    const ad = normalizeAd(adValue);
    if (!connectionId || !validAnonymousId(hostId) || !ad) return null;
    if (this.rooms.size >= MAX_ROOMS || this.hasSession(connectionId)) return null;

    const createdAt = this.now();
    const room = {
      roomId: this.createId(),
      hostId,
      buildVersion: ad.buildVersion,
      matchKey: ad.matchKey,
      label: ad.label,
      createdAt,
      lastSeenAt: createdAt,
      state: 'open',
      hostConnectionId: connectionId,
      guestConnectionId: null,
    };
    this.rooms.set(room.roomId, room);
    return room;
  }

  list(matchKey, buildVersion) {
    this.pruneExpired();
    const safeMatchKey = boundedString(matchKey, 128);
    const safeBuildVersion = boundedString(buildVersion, 64);
    if (!safeMatchKey || !safeBuildVersion) return [];

    const now = this.now();
    const rooms = [];
    for (const room of this.rooms.values()) {
      if (room.state !== 'open') continue;
      if (room.matchKey !== safeMatchKey || room.buildVersion !== safeBuildVersion) continue;
      rooms.push({
        roomId: room.roomId,
        label: room.label,
        matchKey: room.matchKey,
        ageMs: Math.max(0, now - room.createdAt),
      });
    }
    return rooms;
  }

  join(connectionId, guestId, roomId) {
    this.pruneExpired();
    if (!connectionId || !validAnonymousId(guestId) || typeof roomId !== 'string') return null;
    if (this.hasSession(connectionId)) return null;
    const room = this.rooms.get(roomId);
    if (!room || room.state !== 'open') return null;
    if (room.hostId === guestId) return null;

    room.state = 'taken';
    room.guestConnectionId = connectionId;
    return room;
  }

  update(connectionId, roomId, adValue) {
    this.pruneExpired();
    const room = this.rooms.get(roomId);
    const ad = normalizeAd(adValue);
    if (!room || !ad || room.state !== 'open' || room.hostConnectionId !== connectionId) return null;
    room.buildVersion = ad.buildVersion;
    room.matchKey = ad.matchKey;
    room.label = ad.label;
    room.lastSeenAt = this.now();
    return room;
  }

  heartbeat(connectionId, roomId) {
    this.pruneExpired();
    const room = this.rooms.get(roomId);
    if (!room || room.state !== 'open' || room.hostConnectionId !== connectionId) return null;
    room.lastSeenAt = this.now();
    return room;
  }

  close(connectionId, roomId) {
    const room = this.rooms.get(roomId);
    if (!room || room.hostConnectionId !== connectionId) return null;
    this.rooms.delete(roomId);
    return room;
  }

  leave(connectionId, roomId) {
    const room = this.rooms.get(roomId);
    if (!room || room.guestConnectionId !== connectionId) return null;
    this.rooms.delete(roomId);
    return room;
  }

  relayTarget(connectionId, roomId) {
    const room = this.rooms.get(roomId);
    if (!room || room.state !== 'taken') return null;
    if (room.hostConnectionId === connectionId) return room.guestConnectionId;
    if (room.guestConnectionId === connectionId) return room.hostConnectionId;
    return null;
  }

  disconnect(connectionId) {
    const removed = [];
    for (const [roomId, room] of this.rooms) {
      if (room.hostConnectionId !== connectionId && room.guestConnectionId !== connectionId) continue;
      this.rooms.delete(roomId);
      removed.push(room);
    }
    return removed;
  }
}
