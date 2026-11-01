import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameCore } from '../dist/application/game-core.mjs';
import {
  SAVE_VERSION,
  collapseSavedRooms,
  expandSavedRooms,
  savedMembers,
} from '../dist/application/save-format.mjs';
import { join } from './helpers/fake-socket.mjs';
import { legacySave } from './helpers/save-format.mjs';

test('a save keeps each player once beside the rooms, and a room keeps only its members', () => {
  const core = createGameCore({ persistentSessions: true, keepEmptyRooms: true });
  const a = join(core, { room: 'ONE', name: 'A' });
  const b = join(core, { room: 'TWO', name: 'B' });
  a.player().inventory.wood = 7;
  const saved = core.exportState();
  assert.equal(saved.version, SAVE_VERSION);
  assert.equal(saved.players.length, 2);
  for (const room of saved.rooms)
    for (const entry of room.sessions) {
      assert.deepEqual(Object.keys(entry).sort(), ['expiresAt', 'playerId', 'token']);
      assert.ok(saved.players.some((player) => player.id === entry.playerId));
    }
  assert.equal(savedMembers(saved, 0)[0].player.inventory.wood, 7);
  assert.equal(savedMembers(saved, 0)[0].token, a.welcome().session);
  // Restored from the new layout, each returns to the same body in the same room.
  const restored = createGameCore({ persistentSessions: true, keepEmptyRooms: true });
  restored.importState(saved);
  const back = join(restored, { room: 'ONE', resume: '1', session: a.welcome().session });
  assert.equal(back.player().id, a.player().id);
  assert.equal(back.player().inventory.wood, 7);
  assert.equal(restored.rooms.get('TWO').sessions.size, 1);
  assert.equal(b.player().id, savedMembers(saved, 1)[0].player.id);
  core.close();
  restored.close();
});

test('version 1 saves still restore, and the next save is version 2 without losing anyone', () => {
  const core = createGameCore({ persistentSessions: true, keepEmptyRooms: true });
  const a = join(core, { room: 'OLD', name: 'A' });
  a.player().inventory.stone = 5;
  const old = legacySave(core.exportState());
  assert.equal(old.version, 1);
  assert.ok(!('players' in old));
  const restored = createGameCore({ persistentSessions: true, keepEmptyRooms: true });
  restored.importState(old);
  const upgraded = restored.exportState();
  assert.equal(upgraded.version, 2);
  assert.equal(savedMembers(upgraded)[0].player.inventory.stone, 5);
  const people = (state) =>
    expandSavedRooms(state)[0].sessions.map(({ token, player }) => [
      token,
      player.id,
      player.inventory,
    ]);
  assert.deepEqual(people(upgraded), people(old));
  core.close();
  restored.close();
});

test('a membership naming nobody, or one person twice, is refused instead of losing them', () => {
  const core = createGameCore({ persistentSessions: true, keepEmptyRooms: true });
  join(core, { room: 'X', name: 'A' });
  const saved = core.exportState();
  const missing = structuredClone(saved);
  missing.rooms[0].sessions[0].playerId = 'nobody';
  assert.throws(() => createGameCore().importState(missing), /membership/);
  const twice = structuredClone(saved);
  twice.rooms[0].sessions.push({ ...twice.rooms[0].sessions[0], token: 'other' });
  assert.throws(() => createGameCore().importState(twice), /membership/);
  const duplicate = structuredClone(saved);
  duplicate.players.push(structuredClone(duplicate.players[0]));
  assert.throws(() => createGameCore().importState(duplicate), /saved player/);
  // Collapsing keeps the first membership for one person and never duplicates records.
  const rooms = expandSavedRooms(saved);
  const collapsed = collapseSavedRooms([...rooms, { ...rooms[0], name: 'Y' }]);
  assert.equal(collapsed.players.length, 1);
  assert.equal(collapsed.rooms[1].sessions.length, 0);
  core.close();
});

test('restoring does not modify the caller’s save', () => {
  const core = createGameCore({ persistentSessions: true, keepEmptyRooms: true });
  join(core, { room: 'KEEP', name: 'A' });
  const saved = core.exportState(),
    copy = structuredClone(saved);
  const restored = createGameCore({ persistentSessions: true });
  restored.importState(saved);
  join(restored, { room: 'KEEP', resume: '1', session: savedMembers(saved)[0].token });
  assert.deepEqual(saved, copy);
  core.close();
  restored.close();
});
