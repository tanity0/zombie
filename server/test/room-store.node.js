import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_ROOMS, OPEN_ROOM_TTL_MS, RoomStore } from '../src/room-store.js';

// `.node.js` keeps this server-owned suite out of the repository root Vitest scan.

const HOST_ID = '123e4567-e89b-42d3-a456-426614174000';
const GUEST_ID = '123e4567-e89b-42d3-b456-426614174001';
const AD = { buildVersion: 'v1', matchKey: 'opaque', label: ' Test room ' };

function storeFixture() {
  let now = 10_000;
  let nextId = 1;
  const store = new RoomStore({
    now: () => now,
    createId: () => `room-${nextId++}`,
  });
  return { store, setNow: (value) => { now = value; } };
}

test('advertise, version-filtered list, and first join are atomic', () => {
  const { store } = storeFixture();
  const room = store.create('host-socket', HOST_ID, AD);
  assert.equal(room?.label, 'Test room');
  assert.deepEqual(store.list('opaque', 'other'), []);
  assert.equal(store.list('opaque', 'v1').length, 1);

  assert.equal(store.join('guest-a', GUEST_ID, room.roomId)?.state, 'taken');
  assert.equal(store.join('guest-b', GUEST_ID, room.roomId), null);
  assert.deepEqual(store.list('opaque', 'v1'), []);
});

test('open rooms expire at 90 seconds and are removed', () => {
  const { store, setNow } = storeFixture();
  const room = store.create('host-socket', HOST_ID, AD);
  setNow(10_000 + OPEN_ROOM_TTL_MS - 1);
  assert.equal(store.list('opaque', 'v1').length, 1);
  setNow(10_000 + OPEN_ROOM_TTL_MS);
  assert.deepEqual(store.list('opaque', 'v1'), []);
  assert.equal(store.rooms.has(room.roomId), false);
});

test('only the creating host socket can update or delete a room', () => {
  const { store } = storeFixture();
  const room = store.create('host-socket', HOST_ID, AD);
  const changed = { ...AD, label: 'Changed' };

  assert.equal(store.update('other-socket', room.roomId, changed), null);
  assert.equal(store.close('other-socket', room.roomId), null);
  assert.equal(store.list('opaque', 'v1')[0].label, 'Test room');
  assert.equal(store.update('host-socket', room.roomId, changed)?.label, 'Changed');
  assert.equal(store.close('host-socket', room.roomId)?.roomId, room.roomId);
  assert.equal(store.rooms.size, 0);
});

test('one socket owns at most one session and room count is bounded', () => {
  const { store } = storeFixture();
  assert.ok(store.create('host-0', HOST_ID, AD));
  assert.equal(store.create('host-0', HOST_ID, AD), null);

  for (let index = 1; index < MAX_ROOMS; index += 1) {
    assert.ok(store.create(`host-${index}`, HOST_ID, AD));
  }
  assert.equal(store.rooms.size, MAX_ROOMS);
  assert.equal(store.create('overflow', HOST_ID, AD), null);
});

test('disconnect removes the room and identifies the remaining peer', () => {
  const { store } = storeFixture();
  const room = store.create('host-socket', HOST_ID, AD);
  store.join('guest-socket', GUEST_ID, room.roomId);

  const removed = store.disconnect('guest-socket');
  assert.equal(removed[0].hostConnectionId, 'host-socket');
  assert.equal(store.rooms.size, 0);
});

test('SDP/ICE relay target is only available to the two sockets in a taken room', () => {
  const { store } = storeFixture();
  const room = store.create('host-socket', HOST_ID, AD);
  store.join('guest-socket', GUEST_ID, room.roomId);

  assert.equal(store.relayTarget('host-socket', room.roomId), 'guest-socket');
  assert.equal(store.relayTarget('guest-socket', room.roomId), 'host-socket');
  assert.equal(store.relayTarget('other-socket', room.roomId), null);
});
