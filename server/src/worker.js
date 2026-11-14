import { DurableObject } from 'cloudflare:workers';
import { RoomStore } from './room-store.js';
import { handleGhostRequest, purgeExpiredGhosts } from './ghost-api.js';
import { allowedGhostOriginValue } from './ghost-origin.js';

const MAX_CONNECTIONS = 256;
const MAX_MESSAGE_BYTES = 16_384;
const MAX_REQUEST_ID_LENGTH = 64;
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const GHOST_PATH_PREFIX = '/ghost';

function allowedOrigin(request) {
  try {
    const origin = request.headers.get('Origin');
    if (!origin) return false;
    const url = new URL(origin);
    return (url.protocol === 'http:' || url.protocol === 'https:') && ALLOWED_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function allowedGhostOrigin(request) {
  return allowedGhostOriginValue(request.headers.get('Origin'));
}

function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Ghost-Anon',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function withCors(response, request) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request))) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function consumeRateLimit(env, key, limit) {
  if (!key) return true;
  const id = env.GHOST_RATE_LIMITER.idFromName(key);
  const response = await env.GHOST_RATE_LIMITER.get(id).fetch('https://rate.local/', {
    method: 'POST', body: JSON.stringify({ limit }),
  });
  return response.ok;
}

async function ghostRateAllowed(request, env) {
  const anon = request.headers.get('X-Ghost-Anon') ?? new URL(request.url).searchParams.get('anon');
  const ip = request.headers.get('CF-Connecting-IP');
  const [anonOk, ipOk] = await Promise.all([
    consumeRateLimit(env, anon ? `anon:${anon}` : '', 60),
    consumeRateLimit(env, ip ? `ip:${ip}` : '', 300),
  ]);
  return anonOk && ipOk;
}

function requestIdOf(message) {
  const requestId = message?.requestId;
  return typeof requestId === 'string' && requestId.length > 0 && requestId.length <= MAX_REQUEST_ID_LENGTH
    ? requestId
    : null;
}

function validRelay(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.kind === 'sdp') {
    return (value.sdpType === 'offer' || value.sdpType === 'answer')
      && typeof value.sdp === 'string'
      && value.sdp.length > 0
      && value.sdp.length <= 12_000;
  }
  if (value.kind === 'ice') {
    return typeof value.candidate === 'string'
      && value.candidate.length <= 4_096
      && (value.sdpMid === null || (typeof value.sdpMid === 'string' && value.sdpMid.length <= 128))
      && (value.sdpMLineIndex === null
        || (Number.isInteger(value.sdpMLineIndex) && value.sdpMLineIndex >= 0 && value.sdpMLineIndex <= 65_535));
  }
  return false;
}

function encode(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export class SignalingLobby extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.rooms = new RoomStore();
    this.socketsById = new Map();
    this.idsBySocket = new Map();
  }

  async fetch(request) {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('WebSocket upgrade required', { status: 426 });
    }
    if (!allowedOrigin(request)) return new Response('Origin not allowed', { status: 403 });
    if (this.socketsById.size >= MAX_CONNECTIONS) return new Response('Busy', { status: 503 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const connectionId = crypto.randomUUID();
    server.accept();
    this.socketsById.set(connectionId, server);
    this.idsBySocket.set(server, connectionId);

    server.addEventListener('message', (event) => this.handleMessage(server, event.data));
    server.addEventListener('close', () => this.handleDisconnect(server));
    server.addEventListener('error', () => this.handleDisconnect(server));
    return new Response(null, { status: 101, webSocket: client });
  }

  send(socket, value) {
    try {
      const payload = encode(value);
      if (payload && socket.readyState === WebSocket.OPEN) socket.send(payload);
    } catch {
      // A failed signaling response must not escape the Worker.
    }
  }

  reply(socket, requestId, ok, payload = {}) {
    if (!requestId) return;
    this.send(socket, { type: 'response', requestId, ok, ...payload });
  }

  notify(connectionId, value) {
    if (!connectionId) return;
    const socket = this.socketsById.get(connectionId);
    if (socket) this.send(socket, value);
  }

  pruneExpired() {
    for (const room of this.rooms.pruneExpired()) {
      this.notify(room.hostConnectionId, { type: 'room-expired', roomId: room.roomId });
    }
  }

  handleMessage(socket, data) {
    try {
      if (typeof data !== 'string' || new TextEncoder().encode(data).byteLength > MAX_MESSAGE_BYTES) return;
      const message = JSON.parse(data);
      if (!message || typeof message !== 'object' || Array.isArray(message)) return;
      const requestId = requestIdOf(message);
      const connectionId = this.idsBySocket.get(socket);
      if (!connectionId) return;
      this.pruneExpired();

      if (message.type === 'advertise') {
        const room = this.rooms.create(connectionId, message.hostId, message.ad);
        this.reply(socket, requestId, Boolean(room), room ? { roomId: room.roomId } : {});
        return;
      }

      if (message.type === 'list') {
        const rooms = this.rooms.list(message.matchKey, message.buildVersion);
        this.reply(socket, requestId, true, { rooms });
        return;
      }

      if (message.type === 'join') {
        const room = this.rooms.join(connectionId, message.guestId, message.roomId);
        this.reply(socket, requestId, Boolean(room), room ? { roomId: room.roomId } : {});
        if (room) {
          this.notify(room.hostConnectionId, { type: 'peer-joined', roomId: room.roomId });
        }
        return;
      }

      if (message.type === 'update-room') {
        const room = this.rooms.update(connectionId, message.roomId, message.ad);
        this.reply(socket, requestId, Boolean(room));
        return;
      }

      if (message.type === 'close-room') {
        const room = this.rooms.close(connectionId, message.roomId);
        this.reply(socket, requestId, Boolean(room));
        if (room?.guestConnectionId) {
          this.notify(room.guestConnectionId, { type: 'peer-left', roomId: room.roomId });
        }
        return;
      }

      if (message.type === 'leave-room') {
        const room = this.rooms.leave(connectionId, message.roomId);
        this.reply(socket, requestId, Boolean(room));
        if (room) this.notify(room.hostConnectionId, { type: 'peer-left', roomId: room.roomId });
        return;
      }

      if (message.type === 'relay' && validRelay(message.signal) && typeof message.roomId === 'string') {
        const target = this.rooms.relayTarget(connectionId, message.roomId);
        this.reply(socket, requestId, Boolean(target));
        if (target) this.notify(target, { type: 'signal', roomId: message.roomId, signal: message.signal });
        return;
      }

      this.reply(socket, requestId, false);
    } catch {
      // Malformed or hostile input is ignored without affecting other rooms.
    }
  }

  handleDisconnect(socket) {
    try {
      const connectionId = this.idsBySocket.get(socket);
      if (!connectionId) return;
      this.idsBySocket.delete(socket);
      this.socketsById.delete(connectionId);
      for (const room of this.rooms.disconnect(connectionId)) {
        const peer = room.hostConnectionId === connectionId
          ? room.guestConnectionId
          : room.hostConnectionId;
        this.notify(peer, { type: 'peer-left', roomId: room.roomId });
      }
    } catch {
      // Disconnect cleanup is best effort and never escapes the Durable Object.
    }
  }
}

export class GhostRateLimiter extends DurableObject {
  async fetch(request) {
    try {
      const { limit } = await request.json();
      const safeLimit = Math.max(1, Math.min(10_000, Math.floor(Number(limit) || 1)));
      const hour = Math.floor(Date.now() / 3_600_000);
      const key = `hour:${hour}`;
      const count = Number(await this.ctx.storage.get(key) ?? 0);
      if (count >= safeLimit) return new Response('Too many requests', { status: 429 });
      await Promise.all([
        this.ctx.storage.put(key, count + 1),
        this.ctx.storage.delete(`hour:${hour - 2}`),
      ]);
      return new Response('ok');
    } catch {
      return new Response('Unavailable', { status: 503 });
    }
  }
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (request.method === 'GET' && url.pathname === '/health') {
        return Response.json({ status: 'ok' });
      }
      if (url.pathname.startsWith(GHOST_PATH_PREFIX)) {
        if (!allowedGhostOrigin(request)) return withCors(new Response('Origin not allowed', { status: 403 }), request);
        if (request.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }), request);
        if (!await ghostRateAllowed(request, env)) {
          return withCors(Response.json({ error: 'Too many requests' }, { status: 429 }), request);
        }
        return withCors(await handleGhostRequest(request, env), request);
      }
      if (request.method !== 'GET' || url.pathname !== '/') return new Response('Not found', { status: 404 });
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('WebSocket upgrade required', { status: 426 });
      }
      if (!allowedOrigin(request)) return new Response('Origin not allowed', { status: 403 });
      const id = env.SIGNALING_LOBBY.idFromName('global');
      return env.SIGNALING_LOBBY.get(id).fetch(request);
    } catch {
      return new Response('Unavailable', { status: 503 });
    }
  },
  async scheduled(_controller, env) {
    await purgeExpiredGhosts(env);
  },
};
