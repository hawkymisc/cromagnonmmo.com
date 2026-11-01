import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createGameCore, HELLO_TIMEOUT_MS } from '../dist/application/game-core.mjs';
import { identityFromPublicKey } from '../dist/application/identity.mjs';
import { PROTOCOL_VERSION } from '../dist/application/protocol.mjs';
import { HOME_RULES, DEFAULT_RULES } from '../dist/shared/room-rules.mjs';
import { IDLE_TIMEOUT_MS } from '../dist/shared/player-inactivity.mjs';
import { FakeSocket, join } from './helpers/fake-socket.mjs';

async function browserKey() {
  const keys = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
  ]);
  return Buffer.from(await webcrypto.subtle.exportKey('spki', keys.publicKey)).toString(
    'base64url',
  );
}

/** A clock the test moves; the game reads time only through its runtime port. */
function clock(start = 1_000_000) {
  let now = start,
    next = 0;
  return {
    runtime: {
      now: () => now,
      id: () => `id-${++next}`,
      token: () => `token-${++next}`,
    },
    advance(ms) {
      now += ms;
    },
  };
}

/** Open a protocol 2 connection and answer its handshake with `hello`. */
function hello(core, params, message) {
  const socket = new FakeSocket();
  core.connect(socket, new URLSearchParams({ resume: '1', hello: '1', ...params }));
  const handshake = socket.last('handshake');
  if (message) socket.command({ type: 'hello', protocolVersion: PROTOCOL_VERSION, ...message });
  const welcome = () => socket.last('welcome');
  return {
    socket,
    handshake,
    welcome,
    player: () => core.rooms.get(welcome()?.room)?.players.get(welcome()?.id),
  };
}

test('protocol 2 sends the resume token and key after the handshake, never in the URL', async () => {
  const core = createGameCore({ rules: HOME_RULES });
  const key = await browserKey();
  const a = hello(core, { room: 'HOME', name: 'A' });
  assert.deepEqual(a.handshake, {
    type: 'handshake',
    protocolVersion: PROTOCOL_VERSION,
    acceptsCarry: true,
  });
  assert.equal(a.welcome(), undefined, 'nobody joins before saying hello');
  assert.equal(core.rooms.get('HOME'), undefined);
  a.socket.command({ type: 'hello', protocolVersion: PROTOCOL_VERSION, identity: key });
  const welcome = a.welcome();
  assert.equal(welcome.protocolVersion, PROTOCOL_VERSION);
  assert.equal(welcome.id, identityFromPublicKey(key), 'a new person is named by their key');
  assert.equal(a.player().identity, welcome.id);
  // In-game commands work as before; a second hello is ignored.
  a.socket.command({ type: 'hello', protocolVersion: PROTOCOL_VERSION, identity: 'x' });
  assert.equal(a.socket.messages('welcome').length, 1);
  a.socket.close();
  // The token from the welcome resumes from the hello, as a URL token did before.
  const back = hello(core, { room: 'HOME' }, { session: welcome.session });
  assert.equal(back.welcome().id, welcome.id);
  assert.equal(back.welcome().resumed, true);
  core.close();
});

test('a wrong protocol version or a silent connection is closed with an explanation', () => {
  const time = clock();
  const core = createGameCore({ runtime: time.runtime });
  const wrong = hello(core, { room: 'R' }, { protocolVersion: 99 });
  wrong.socket.command({ type: 'hello', protocolVersion: 99 });
  assert.equal(wrong.socket.last('error').code, 'PROTOCOL_MISMATCH');
  assert.equal(wrong.socket.closed.code, 4011);
  const silent = hello(core, { room: 'R' });
  time.advance(HELLO_TIMEOUT_MS - 1);
  core.tick();
  assert.equal(silent.socket.closed, null);
  time.advance(1);
  core.tick();
  assert.equal(silent.socket.last('error').code, 'HELLO_TIMEOUT');
  assert.equal(silent.socket.closed.code, 4010);
  // A connection that leaves before saying hello is simply forgotten.
  const gone = hello(core, { room: 'R' });
  gone.socket.close();
  time.advance(HELLO_TIMEOUT_MS);
  core.tick();
  assert.equal(gone.socket.messages('error').length, 0);
  core.close();
});

test('the same browser is one person on the host: it resumes without a token and changes rooms with its things', async () => {
  const core = createGameCore({
    rules: HOME_RULES,
    persistentSessions: true,
    keepEmptyRooms: true,
  });
  const key = await browserKey();
  const first = hello(core, { room: 'KITCHEN', name: 'A' }, { identity: key });
  first.player().inventory.wood = 9;
  const id = first.welcome().id;
  // Connected in one room, the same person cannot also stand in another.
  const twice = hello(core, { room: 'GARDEN' }, { identity: key });
  assert.equal(twice.socket.last('error').code, 'ACTIVE_ELSEWHERE');
  // A reload in the same room without its stored token replaces the old connection.
  const reload = hello(core, { room: 'KITCHEN' }, { identity: key });
  assert.equal(reload.welcome().id, id);
  assert.equal(first.socket.closed.code, 4004);
  reload.socket.close();
  // Joining another room brings the same body and belongings; the old room lets it go.
  const moved = hello(core, { room: 'GARDEN', name: 'A' }, { identity: key });
  assert.equal(moved.welcome().id, id);
  assert.equal(moved.welcome().resumed, true);
  assert.equal(moved.player().inventory.wood, 9);
  assert.equal(core.rooms.get('KITCHEN').sessions.size, 0);
  const saved = core.exportState();
  assert.equal(saved.players.filter((player) => player.id === id).length, 1);
  core.close();
});

test('an older player known by token alone is bound to the browser that resumes it', async () => {
  const core = createGameCore({ persistentSessions: true, keepEmptyRooms: true });
  const old = join(core, { room: 'OLD', name: 'A' });
  const { session, id } = old.welcome();
  old.socket.close();
  assert.equal(core.rooms.get('OLD').sessions.get(session).player.identity, undefined);
  const key = await browserKey();
  const back = hello(core, { room: 'OLD' }, { session, identity: key });
  assert.equal(back.welcome().id, id, 'the existing id is kept');
  assert.equal(back.player().identity, identityFromPublicKey(key));
  back.socket.close();
  // From now on the browser finds them without the token, in any room.
  const elsewhere = hello(core, { room: 'NEW' }, { identity: key });
  assert.equal(elsewhere.welcome().id, id);
  core.close();
});

const soloRecord = () => ({
  id: 'solo-id',
  identity: 'p-forged',
  name: 'ignored',
  x: 99999,
  z: -5,
  inventory: { wood: 12, stone: 3, cookedMeat: 250, obsidian: -4, gold: 50, boat: 1 },
  gathered: 41,
  tool: true,
  equippedItem: 'axe',
  spearHead: 'obsidian',
  energy: 77,
  adventure: {
    regions: {
      nowhere: { visited: ['a'] },
      ...Object.fromEntries([['steppe', { visited: ['p1', 7], gathered: 2, claimed: true }]]),
    },
  },
  gulf: { countryId: 'invented', visited: 'not a list', residentHelp: { a: 3, b: -1 } },
  socket: { evil: true },
  sessionToken: 'stolen',
});

test('a home room takes a newcomer’s solo character: progress only, checked field by field', async () => {
  const core = createGameCore({ rules: HOME_RULES, keepEmptyRooms: true });
  const key = await browserKey();
  const guest = hello(
    core,
    { room: 'HOME', name: 'Guest', startAtCamp: '1' },
    { identity: key, carry: soloRecord() },
  );
  const welcome = guest.welcome(),
    p = guest.player();
  assert.equal(welcome.carried, true);
  assert.equal(p.id, identityFromPublicKey(key), 'the host names them, not the file');
  assert.equal(p.identity, identityFromPublicKey(key));
  assert.equal(p.name, 'Guest');
  assert.equal(p.inventory.wood, 12);
  assert.equal(p.inventory.cookedMeat, 99, 'counts are capped');
  assert.equal(p.inventory.obsidian, 0);
  assert.equal(p.inventory.gold, undefined, 'unknown possessions are dropped');
  assert.equal(p.tool, true);
  assert.equal(p.spearHead, 'obsidian');
  assert.equal(p.energy, 77);
  assert.equal(p.gathered, 41);
  assert.ok(!('nowhere' in p.adventure.regions));
  assert.equal(p.gulf.countryId, null);
  assert.deepEqual(p.gulf.visited, []);
  assert.notEqual(p.sessionToken, 'stolen');
  assert.ok(Math.abs(p.x) < 200, 'they arrive in this world, not at the file’s position');
  core.close();
});

test('a public room, or someone the host already knows, never takes a carried character', async () => {
  const strict = createGameCore({ rules: DEFAULT_RULES });
  const visitor = hello(
    strict,
    { room: 'EMBER' },
    { identity: await browserKey(), carry: soloRecord() },
  );
  assert.equal(visitor.handshake.acceptsCarry, false);
  assert.equal(visitor.welcome().carried, false);
  assert.equal(visitor.player().inventory.wood, 0);
  strict.close();
  const home = createGameCore({
    rules: HOME_RULES,
    persistentSessions: true,
    keepEmptyRooms: true,
  });
  const key = await browserKey();
  const known = hello(home, { room: 'HOME' }, { identity: key });
  known.player().inventory.wood = 2;
  known.socket.close();
  const again = hello(home, { room: 'HOME' }, { identity: key, carry: soloRecord() });
  assert.equal(again.welcome().carried, false);
  assert.equal(again.player().inventory.wood, 2, 'the host keeps what they have here');
  // Junk instead of a record joins as a newcomer with nothing carried.
  const junk = hello(home, { room: 'HOME' }, { identity: await browserKey(), carry: [1, 2] });
  assert.equal(junk.welcome().carried, false);
  home.close();
});

test('home rules never send an idle person away; public rooms still do', () => {
  for (const [rules, expected] of [
    [HOME_RULES, null],
    [DEFAULT_RULES, 'IDLE_TIMEOUT'],
  ]) {
    const time = clock();
    const core = createGameCore({ runtime: time.runtime, rules });
    const a = join(core, { room: 'R', name: 'A' });
    assert.equal(a.welcome().rules.idleTimeoutMs, rules.idleTimeoutMs);
    time.advance(IDLE_TIMEOUT_MS + 1000);
    core.tick();
    assert.equal(a.socket.last('error')?.code ?? null, expected);
    core.close();
  }
});

test('a room limit from the rules lowers the host limit and never raises it', () => {
  const lowered = createGameCore({ playerLimit: 8, rules: { playerLimit: 2 } });
  const people = ['A', 'B', 'C'].map((name) => join(lowered, { room: 'R', name }));
  assert.equal(people[2].socket.last('error').code, 'ROOM_FULL');
  assert.match(people[2].socket.last('error').text, /2人/);
  lowered.close();
  const capped = createGameCore({ playerLimit: 2, rules: HOME_RULES });
  const more = ['A', 'B', 'C'].map((name) => join(capped, { room: 'R', name }));
  assert.equal(more[2].socket.last('error').code, 'ROOM_FULL');
  capped.close();
  const home = createGameCore({ playerLimit: 8, rules: HOME_RULES });
  const eight = Array.from({ length: 8 }, (_, i) => join(home, { room: 'R', name: `P${i}` }));
  assert.ok(eight.every((person) => person.welcome()));
  assert.equal(home.rooms.get('R').players.size, 8);
  home.close();
});

test('one command that changes several things sends one state frame, after its replies', () => {
  const core = createGameCore();
  const a = join(core, { room: 'R', name: 'A' });
  const p = a.player();
  p.inventory.wood = 3;
  p.inventory.stone = 2;
  a.socket.sent.length = 0;
  a.socket.command({ type: 'action', action: 'inventoryCraft', targetId: 'axe' });
  assert.equal(a.socket.last('inventoryCraftResult').ok, true);
  const types = a.socket.sent.map((message) => message.type);
  assert.equal(types.filter((type) => type === 'state').length, 1);
  assert.ok(types.indexOf('inventoryCraftResult') < types.indexOf('state'));
  // A command that changes nothing sends no frame of its own.
  a.socket.sent.length = 0;
  a.socket.command({ type: 'ping', at: 1 });
  assert.deepEqual(
    a.socket.sent.map((message) => message.type),
    ['pong'],
  );
  core.close();
});

test('a connection that drops while the host is stopping is still in the final save', () => {
  const core = createGameCore({ persistentSessions: true, keepEmptyRooms: true });
  const a = join(core, { room: 'R', name: 'A' });
  a.player().inventory.wood = 6;
  const { session, id } = a.welcome();
  // The host has begun to stop (server.mts close → core.pause) when the browser goes away.
  core.pause();
  a.socket.close();
  const saved = core.exportState();
  const entry = saved.rooms[0].sessions.find((member) => member.token === session);
  assert.equal(entry?.playerId, id);
  assert.equal(saved.players.find((player) => player.id === id).inventory.wood, 6);
  core.close();
});
