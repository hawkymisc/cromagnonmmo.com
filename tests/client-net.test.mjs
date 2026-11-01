import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFrame, isWorldFrame } from '../dist/src/net/state-store.js';
import { GameSocket } from '../dist/src/net/game-socket.js';
import { secretIdentity } from '../dist/src/net/identity.js';
import {
  CARD_FORMAT,
  characterCard,
  parseCharacterCard,
  rememberSoloCharacter,
  rememberedSoloCharacter,
} from '../dist/src/net/character-card.js';
import { titlePlayModes } from '../dist/src/title-shell.js';
import { carriedProfile } from '../dist/application/carried-profile.mjs';
import { identityFromPublicKey } from '../dist/application/identity.mjs';
import { PROTOCOL_VERSION } from '../dist/shared/protocol-version.mjs';

test('a full frame replaces the bodies and keeps the world fields it leaves out', () => {
  const world = { players: [{ id: 'a', x: 1 }], resources: ['r'], camp: { level: 1 } };
  const next = applyFrame(world, { type: 'state', players: [{ id: 'a', x: 2 }], serverTime: 5 });
  assert.deepEqual(next.players, [{ id: 'a', x: 2 }]);
  assert.deepEqual(next.resources, ['r']);
  assert.equal(next.serverTime, 5);
  assert.equal(next.type, undefined);
  assert.deepEqual(world.players, [{ id: 'a', x: 1 }], 'the previous world is not modified');
});

test('a delta frame changes only the bodies it names and drops the ones that left', () => {
  const world = {
    players: [
      { id: 'a', x: 1 },
      { id: 'b', x: 2 },
    ],
    animals: [{ id: 'm', hp: 9 }],
  };
  const next = applyFrame(world, {
    type: 'delta',
    serverTime: 9,
    upsert: {
      players: [
        { id: 'b', x: 3 },
        { id: 'c', x: 4 },
      ],
      enemies: [{ id: 'e' }],
    },
    remove: { players: ['a'], animals: ['m'] },
  });
  assert.deepEqual(next.players, [
    { id: 'b', x: 3 },
    { id: 'c', x: 4 },
  ]);
  assert.deepEqual(next.animals, []);
  assert.deepEqual(next.enemies, [{ id: 'e' }]);
  assert.equal(next.serverTime, 9);
  assert.ok(isWorldFrame({ type: 'delta' }) && isWorldFrame({ type: 'state' }));
  assert.ok(!isWorldFrame({ type: 'chat' }));
});

class FakeWebSocket extends EventTarget {
  static last;
  readyState = 1;
  bufferedAmount = 0;
  sent = [];
  constructor(url) {
    super();
    this.url = url;
    FakeWebSocket.last = this;
  }
  send(data) {
    this.sent.push(JSON.parse(data));
  }
  close() {}
  receive(message) {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }));
  }
}

test('the socket answers the handshake itself and the game sees only later messages', () => {
  const seen = [];
  const socket = new GameSocket(
    'ws://192.168.1.2:3000/ws?room=HOME&session=leaked&name=A',
    { session: 'token-1', identity: 'key-1', carry: { inventory: {} } },
    FakeWebSocket,
  );
  socket.addEventListener('message', (event) => seen.push(JSON.parse(event.data).type));
  const ws = FakeWebSocket.last;
  const url = new URL(ws.url);
  assert.equal(url.searchParams.get('hello'), '1');
  assert.equal(url.searchParams.get('session'), null, 'the token never rides in the URL');
  ws.receive({ type: 'handshake', protocolVersion: PROTOCOL_VERSION, acceptsCarry: true });
  assert.deepEqual(ws.sent, [
    {
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      session: 'token-1',
      identity: 'key-1',
      carry: { inventory: {} },
    },
  ]);
  assert.equal(socket.carryOffered, true);
  ws.receive({ type: 'welcome' });
  ws.receive({ type: 'handshake' });
  assert.deepEqual(seen, ['welcome', 'handshake'], 'only the first handshake is answered');
  // A host that takes no characters is never sent one.
  new GameSocket(
    'ws://h/ws',
    { session: '', identity: null, carry: { inventory: {} } },
    FakeWebSocket,
  );
  FakeWebSocket.last.receive({ type: 'handshake', acceptsCarry: false });
  assert.deepEqual(FakeWebSocket.last.sent, [{ type: 'hello', protocolVersion: PROTOCOL_VERSION }]);
});

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    map,
  };
}

test('a plain-http page keeps one random secret, which the host accepts as an identity', () => {
  const storage = memoryStorage();
  const first = secretIdentity(storage, (bytes) => bytes.fill(9));
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(secretIdentity(storage), first, 'the same browser keeps it');
  assert.ok(identityFromPublicKey(first));
  const broken = {
    getItem: () => {
      throw new Error('denied');
    },
    setItem() {},
  };
  assert.equal(secretIdentity(broken), null);
});

test('a character card carries progress only and survives a file and the host’s checks', () => {
  const player = {
    id: 'p',
    name: 'Ash',
    character: 'cro-magnon-woman',
    x: 4,
    inventory: { wood: 5, stone: 1 },
    gathered: 3,
    tool: true,
    spearHead: 'obsidian',
    energy: 80,
    adventure: { regions: {} },
    gulf: { countryId: null, visited: [] },
  };
  const card = characterCard(player, 1234);
  assert.equal(card.format, CARD_FORMAT);
  assert.equal(card.name, 'Ash');
  assert.ok(!('x' in card.progress) && !('id' in card.progress));
  const read = parseCharacterCard(JSON.stringify(card));
  assert.deepEqual(read, card);
  const profile = carriedProfile(read.progress);
  assert.equal(profile.inventory.wood, 5);
  assert.equal(profile.tool, true);
  for (const bad of ['', '{}', '[]', 'not json', JSON.stringify({ ...card, format: 'x' })])
    assert.equal(parseCharacterCard(bad), null);
  assert.equal(parseCharacterCard('x'.repeat(20000)), null);
  const storage = memoryStorage();
  rememberSoloCharacter(card, () => storage);
  assert.deepEqual(
    rememberedSoloCharacter(() => storage),
    card,
  );
  assert.equal(
    rememberedSoloCharacter(() => memoryStorage()),
    null,
  );
});

test('a LAN host’s title offers the other play; plain-http phones are not offered solo', () => {
  const lan = { mode: 'online', serverUrl: '', allowOnline: true };
  const online = titlePlayModes(lan, '?room=HOME', true);
  assert.equal(online.start, 'みんなで遊ぶ');
  assert.equal(online.other.href, '/?room=HOME&play=solo&setup=1');
  const phone = titlePlayModes(lan, '', false);
  assert.equal(phone.other.href, null);
  assert.ok(phone.other.note);
  const solo = titlePlayModes({ ...lan, mode: 'solo' }, '?play=solo', true);
  assert.equal(solo.start, 'ソロプレイで始める');
  assert.equal(solo.other.href, '/?setup=1');
  // The public site and the exhibition keep their own title.
  assert.equal(titlePlayModes({ mode: 'solo', serverUrl: '' }, '', true), null);
});
