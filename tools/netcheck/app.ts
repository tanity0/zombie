import { createSignalingApi } from '../../src/online/signaling';
import type { CoopApi, CoopCloseReason, CoopOpenRoom, CoopSession } from '../../src/online/types';

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`missing element: ${id}`);
  return element as T;
};

const signalInput = byId<HTMLInputElement>('signal');
const matchInput = byId<HTMLInputElement>('match');
const buildInput = byId<HTMLInputElement>('build');
const labelInput = byId<HTMLInputElement>('label');
const roomBox = byId<HTMLDivElement>('rooms');
const notice = byId<HTMLParagraphElement>('notice');

let api: CoopApi | null = null;
let session: CoopSession | null = null;
let trafficTimer: ReturnType<typeof setInterval> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let sequence = 0;
let receivedSequence = -1;
let expectedPackets = 0;
let missingPackets = 0;
let previousAt = performance.now();
let previousSent = 0;
let previousReceived = 0;
const receivedPayloads: number[][] = [];
const closeReasons: CoopCloseReason[] = [];
const MAX_DEBUG_PAYLOADS = 64;

function text(id: string, value: string): void {
  byId<HTMLOutputElement>(id).textContent = value;
}

function currentApi(): CoopApi | null {
  try {
    if (!api) api = createSignalingApi({ signalUrl: signalInput.value.trim() });
    return api.enabled() ? api : null;
  } catch {
    return null;
  }
}

function attach(next: CoopSession | null): CoopSession | null {
  if (!next) {
    notice.textContent = '接続処理に失敗しました';
    return null;
  }
  session = next;
  receivedPayloads.length = 0;
  closeReasons.length = 0;
  receivedSequence = -1;
  expectedPackets = 0;
  missingPackets = 0;
  next.onMessage((data, channel) => {
    receivedPayloads.push([...data.subarray(0, Math.min(16, data.byteLength))]);
    if (receivedPayloads.length > MAX_DEBUG_PAYLOADS) receivedPayloads.shift();
    if (channel !== 'unreliable' || data.byteLength < 4) return;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const nextSequence = view.getUint32(0);
    if (nextSequence > receivedSequence) {
      if (receivedSequence >= 0) missingPackets += Math.max(0, nextSequence - receivedSequence - 1);
      expectedPackets += nextSequence - receivedSequence;
      receivedSequence = nextSequence;
    }
  });
  next.onClosed((reason) => {
    closeReasons.push(reason);
    stopTraffic();
    text('closed', `${reason} (${closeReasons.length})`);
  });
  notice.textContent = `${next.role}: ${next.status()}`;
  return next;
}

async function advertise(): Promise<boolean> {
  try {
    const transport = currentApi();
    if (!transport) return false;
    return Boolean(attach(await transport.advertise({
      buildVersion: buildInput.value,
      matchKey: matchInput.value,
      label: labelInput.value,
    })));
  } catch {
    return false;
  }
}

async function listOpen(): Promise<CoopOpenRoom[]> {
  try {
    const rooms = await currentApi()?.listOpen(matchInput.value, buildInput.value) ?? [];
    roomBox.replaceChildren();
    if (rooms.length === 0) roomBox.textContent = 'なし';
    for (const room of rooms) {
      const button = document.createElement('button');
      button.textContent = `${room.label} (${Math.round(room.ageMs / 1000)}s)`;
      button.dataset.roomId = room.roomId;
      button.addEventListener('click', () => { void join(room.roomId); });
      roomBox.append(button);
    }
    return rooms;
  } catch {
    roomBox.textContent = 'なし';
    return [];
  }
}

async function join(roomId: string): Promise<boolean> {
  try {
    return Boolean(attach(await currentApi()?.join(roomId) ?? null));
  } catch {
    return false;
  }
}

function sendReliable(values: number[]): void {
  try { session?.sendReliable(Uint8Array.from(values)); } catch { /* silent transport contract */ }
}

function sendUnreliable(values: number[]): void {
  try { session?.sendUnreliable(Uint8Array.from(values)); } catch { /* silent transport contract */ }
}

function startTraffic(): void {
  if (trafficTimer) return;
  trafficTimer = setInterval(() => {
    try {
      const payload = new Uint8Array(8 * 1024);
      new DataView(payload.buffer).setUint32(0, sequence);
      payload[4] = session?.role === 'host' ? 1 : 2;
      sequence += 1;
      session?.sendUnreliable(payload);
    } catch {
      // The UI remains usable if a browser rejects one send.
    }
  }, 50);
  byId<HTMLButtonElement>('traffic').textContent = '8KB × 20/s 停止';
}

function stopTraffic(): void {
  if (trafficTimer) clearInterval(trafficTimer);
  trafficTimer = null;
  byId<HTMLButtonElement>('traffic').textContent = '8KB × 20/s 開始';
}

function closeSession(): void {
  try { session?.close('local'); } catch { /* silent transport contract */ }
  stopTraffic();
  api = null;
  session = null;
}

function snapshot() {
  const stats = session?.stats();
  return {
    enabled: currentApi() !== null,
    implicitEnabled: createSignalingApi().enabled(),
    status: session?.status() ?? 'off',
    role: session?.role ?? null,
    maintenanceOpen: stats?.maintenanceOpen ?? false,
    bytesSent: stats?.bytesSent ?? 0,
    bytesReceived: stats?.bytesReceived ?? 0,
    messagesSent: stats?.messagesSent ?? 0,
    messagesReceived: stats?.messagesReceived ?? 0,
    receivedPayloads: receivedPayloads.map((value) => [...value]),
    closeReasons: [...closeReasons],
  };
}

function render(): void {
  try {
    const stats = session?.stats();
    const status = session?.status() ?? 'off';
    const now = performance.now();
    const elapsed = Math.max(0.001, (now - previousAt) / 1000);
    const sent = stats?.bytesSent ?? 0;
    const received = stats?.bytesReceived ?? 0;
    text('status', status);
    text('role', session?.role ?? '-');
    text('rtt', `${stats?.rttMs ?? -1} ms`);
    text('maintenance', stats?.maintenanceOpen ? 'open' : 'closed');
    text('sent', `${sent} B / ${stats?.messagesSent ?? 0} msg`);
    text('received', `${received} B / ${stats?.messagesReceived ?? 0} msg`);
    text('send-rate', `${Math.round((sent - previousSent) / elapsed)} B/s`);
    text('receive-rate', `${Math.round((received - previousReceived) / elapsed)} B/s`);
    const lossRate = expectedPackets === 0 ? 0 : (missingPackets / expectedPackets) * 100;
    text('loss', `${missingPackets} / ${expectedPackets} (${lossRate.toFixed(2)}%)`);
    previousAt = now;
    previousSent = sent;
    previousReceived = received;
  } catch {
    // Monitoring must never disturb the session.
  }
}

byId<HTMLButtonElement>('host').addEventListener('click', () => { void advertise(); });
byId<HTMLButtonElement>('refresh').addEventListener('click', () => { void listOpen(); });
byId<HTMLButtonElement>('traffic').addEventListener('click', () => {
  if (trafficTimer) stopTraffic(); else startTraffic();
});
byId<HTMLButtonElement>('close').addEventListener('click', closeSession);
for (const input of [signalInput, matchInput, buildInput]) {
  input.addEventListener('change', () => { if (!session) api = null; });
}

pollTimer = setInterval(() => { if (!session || session.status() === 'closed') void listOpen(); }, 3_000);
setInterval(render, 1_000);
render();

window.addEventListener('pagehide', () => {
  closeSession();
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
});

declare global {
  interface Window {
    netcheck: {
      advertise: typeof advertise;
      listOpen: typeof listOpen;
      join: typeof join;
      close: typeof closeSession;
      startTraffic: typeof startTraffic;
      stopTraffic: typeof stopTraffic;
      sendReliable: typeof sendReliable;
      sendUnreliable: typeof sendUnreliable;
      snapshot: typeof snapshot;
    };
  }
}

window.netcheck = {
  advertise,
  listOpen,
  join,
  close: closeSession,
  startTraffic,
  stopTraffic,
  sendReliable,
  sendUnreliable,
  snapshot,
};
