import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { createPersistentGameServer } from '../server.mjs';
import { lanSettings, LAN_DEFAULT_ROOM } from '../dist/infrastructure/node/lan-settings.mjs';
import { PROTOCOL_VERSION } from '../dist/application/protocol.mjs';
import {
  effectiveMultiplayerConfig,
  offersSharedPlay,
  parseMultiplayerConfig,
} from '../dist/src/multiplayer-config.js';

test('LAN settings come only from an explicit start and keep their limits in range', () => {
  assert.equal(lanSettings({}), null);
  assert.equal(lanSettings({ HOST: '0.0.0.0' }), null, 'listening on the network is not sharing');
  const lan = lanSettings({ CRO_MULTIPLAYER: 'lan' });
  assert.equal(lan.host, '0.0.0.0');
  assert.equal(lan.playerLimit, 8);
  assert.equal(lan.rules.idleTimeoutMs, null);
  assert.equal(lan.rules.acceptCarriedProfiles, true);
  assert.deepEqual(lan.runtimeConfig, {
    mode: 'online',
    allowOnline: true,
    lan: true,
    serverUrl: '',
    room: LAN_DEFAULT_ROOM,
  });
  const custom = lanSettings({
    CRO_MULTIPLAYER: 'lan',
    HOST: '192.168.1.20',
    CRO_PLAYER_LIMIT: '3',
    CRO_ROOM: 'our house!',
  });
  assert.equal(custom.host, '192.168.1.20');
  assert.equal(custom.rules.playerLimit, 3);
  assert.equal(custom.runtimeConfig.room, 'OURHOUSE');
  for (const bad of ['0', '65', 'x', '2.5'])
    assert.throws(() => lanSettings({ CRO_MULTIPLAYER: 'lan', CRO_PLAYER_LIMIT: bad }));
});

test('a page plays online only where the host says so, and ?play=solo still offers solo', () => {
  const lan = parseMultiplayerConfig({
    mode: 'online',
    serverUrl: '',
    allowOnline: true,
    lan: true,
  });
  assert.equal(effectiveMultiplayerConfig(lan, '').mode, 'online');
  assert.equal(effectiveMultiplayerConfig(lan, '?play=solo').mode, 'solo');
  assert.equal(offersSharedPlay(lan), true);
  // The public site's file, and any older deployment, keep playing solo.
  const site = parseMultiplayerConfig({ mode: 'online', serverUrl: '' });
  assert.equal(effectiveMultiplayerConfig(site, '').mode, 'solo');
  assert.equal(offersSharedPlay(site), false);
  assert.equal(effectiveMultiplayerConfig(parseMultiplayerConfig({ mode: 'solo' })).room, 'SOLO');
  // The exhibition's fixed LAN client is unchanged.
  const exhibition = parseMultiplayerConfig({ mode: 'lan', serverUrl: 'ws://10.0.0.1:8080' });
  assert.equal(effectiveMultiplayerConfig(exhibition, '?play=solo').mode, 'lan');
});

let opened = null;
function client(url, origin) {
  const socket = new WebSocket(url, { origin });
  opened?.push(socket);
  const messages = [];
  socket.on('message', (data) => messages.push(JSON.parse(data.toString())));
  socket.on('error', () => {});
  return {
    socket,
    messages,
    send: (message) => socket.send(JSON.stringify(message)),
    async wait(predicate, timeout = 5000) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const found = messages.find(predicate);
        if (found) return found;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(`Timed out; received ${messages.map((m) => m.type).join(', ')}`);
    },
  };
}

test('a LAN host serves the shared room to other devices and keeps everyone across a restart', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cro-lan-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const lan = lanSettings({ CRO_MULTIPLAYER: 'lan', HOST: '127.0.0.1', CRO_PLAYER_LIMIT: '6' });
  const start = () =>
    createPersistentGameServer({ ...lan, port: 0, saveDirectory: dir, enableRoomReset: false });
  let game = await start();
  const sockets = (opened = []);
  t.after(async () => {
    for (const socket of sockets) socket.terminate();
    await game.close();
  });
  const { port } = await game.listen();
  const origin = `http://127.0.0.1:${port}`;
  const config = await fetch(`${origin}/multiplayer-config.json`).then((r) => r.json());
  assert.deepEqual(config, lan.runtimeConfig);
  const health = await fetch(`${origin}/api/health`).then((r) => r.json());
  assert.equal(health.maxPlayers, 6);
  const url = `ws://127.0.0.1:${port}/ws?${new URLSearchParams({
    room: config.room,
    name: 'Phone',
    resume: '1',
    hello: '1',
  })}`;
  const phone = client(url, origin);
  const handshake = await phone.wait((m) => m.type === 'handshake');
  assert.equal(handshake.acceptsCarry, true);
  phone.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION });
  const welcome = await phone.wait((m) => m.type === 'welcome');
  assert.equal(welcome.room, 'HOME');
  assert.equal(welcome.rules.idleTimeoutMs, null);
  assert.ok(!url.includes(welcome.session), 'the resume token never appears in the URL');
  // A hello carrying a character fits; ordinary commands are still held to 2 KiB.
  const tablet = client(url, origin);
  await tablet.wait((m) => m.type === 'handshake');
  tablet.send({
    type: 'hello',
    protocolVersion: PROTOCOL_VERSION,
    carry: { inventory: { wood: 4 }, note: 'x'.repeat(6000) },
  });
  const carried = await tablet.wait((m) => m.type === 'welcome');
  assert.equal(carried.carried, true);
  const state = await phone.wait((m) => m.type === 'state' && m.players.length === 2);
  assert.equal(state.players.find((p) => p.id === carried.id).inventory.wood, 4);
  phone.socket.close();
  tablet.socket.close();
  await game.close();
  // The same save directory brings the tablet's carried things back after a restart.
  game = await start();
  await game.listen();
  const again = client(
    `ws://127.0.0.1:${game.address().port}/ws?${new URLSearchParams({ room: 'HOME', resume: '1', hello: '1' })}`,
    `http://127.0.0.1:${game.address().port}`,
  );
  await again.wait((m) => m.type === 'handshake');
  again.send({ type: 'hello', protocolVersion: PROTOCOL_VERSION, session: carried.session });
  const back = await again.wait((m) => m.type === 'welcome');
  assert.equal(back.id, carried.id);
  const restored = await again.wait(
    (m) => m.type === 'state' && m.players.some((p) => p.id === back.id),
  );
  assert.equal(restored.players.find((p) => p.id === back.id).inventory.wood, 4);
  again.socket.close();
  await game.close();
});
