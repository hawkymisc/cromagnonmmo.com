import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { WebSocket } from 'ws';
import { createGameServer } from '../dist/server.mjs';
import { createExhibitionClient } from '../dist/infrastructure/node/exhibition-client.mjs';
import { loopbackRequestHost } from '../dist/infrastructure/node/request-host.mjs';

// fetch normalizes the Host header in some Node versions; send the real wire header here.
function statusWithHost(url, host) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { headers: { Host: host } }, (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    request.on('error', reject);
  });
}

test('loopback Host validation rejects foreign and malformed authorities', () => {
  for (const host of ['localhost:3000', '127.0.0.1:3000', '[::1]:3000'])
    assert.equal(loopbackRequestHost(host), true, host);
  for (const host of [
    undefined,
    '',
    'attacker.example:3000',
    'localhost.attacker.example',
    'attacker@localhost',
    'localhost/private',
    'localhost?x',
    'localhost#x',
  ])
    assert.equal(loopbackRequestHost(host), false, host);
});

test('loopback HTTP and WebSocket reject a foreign Host even with a matching Origin', async (t) => {
  const game = createGameServer({ port: 0, host: '127.0.0.1' });
  await game.listen();
  t.after(() => game.close());
  const base = `http://127.0.0.1:${game.address().port}`;
  const foreign = `attacker.example:${game.address().port}`;
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
  assert.equal(await statusWithHost(`${base}/api/health`, foreign), 403);
  const denied = new WebSocket(`${base.replace('http:', 'ws:')}/ws`, {
    headers: { Host: foreign },
    origin: `http://${foreign}`,
  });
  denied.on('error', () => {});
  await new Promise((resolve, reject) => {
    denied.on('open', () => {
      denied.terminate();
      reject(new Error('Foreign Host accepted'));
    });
    denied.on('unexpected-response', (_request, response) => {
      const status = response.statusCode;
      response.resume();
      denied.terminate();
      try {
        assert.equal(status, 403);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
  const valid = new WebSocket(`${base.replace('http:', 'ws:')}/ws`, { origin: base });
  await once(valid, 'open');
  valid.close();
  await once(valid, 'close');
});

test('the other loopback asset handler also rejects foreign Host headers', async (t) => {
  const client = createExhibitionClient({
    root: path.resolve('.'),
    port: 0,
    config: { mode: 'lan', serverUrl: 'ws://127.0.0.1:9/ws' },
  });
  const { port } = await client.listen();
  t.after(() => client.close());
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/status`)).status, 200);
  assert.equal(
    await statusWithHost(`http://127.0.0.1:${port}/api/status`, 'attacker.example'),
    403,
  );
});

test('explicit LAN binding still permits the chosen network hostname', async (t) => {
  const game = createGameServer({ port: 0, host: '0.0.0.0', serveAssets: false });
  await game.listen();
  t.after(() => game.close());
  assert.equal(
    await statusWithHost(`http://127.0.0.1:${game.address().port}/api/health`, 'game.example'),
    200,
  );
});

test('static delivery rejects symlink escapes, including compiled modules and the delivery cache', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cro-boundaries-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const dir of [
    'public/inside',
    'public/.private',
    'private',
    'dist/src',
    'dist/shared',
    'dist/delivery/cache',
  ])
    await mkdir(path.join(root, dir), { recursive: true });
  await writeFile(path.join(root, 'private/fixture.txt'), 'outside public');
  await writeFile(path.join(root, 'public/inside/fixture.txt'), 'inside public');
  await writeFile(path.join(root, 'public/.private/fixture.txt'), 'hidden');
  try {
    for (const [target, link] of [
      ['private', 'public/escape'],
      ['private', 'dist/src/escape'],
      ['public/inside', 'public/alias'],
      ['public/.private', 'public/hidden-alias'],
      ['private', 'dist/delivery/cache/escape'],
    ])
      await symlink(
        path.join(root, target),
        path.join(root, link),
        process.platform === 'win32' ? 'junction' : 'dir',
      );
  } catch (error) {
    if (['EPERM', 'EACCES'].includes(error.code)) {
      t.skip('filesystem does not permit test links');
      return;
    }
    throw error;
  }
  const delivery = {
    models: new Map(),
    textures: new Map(),
    files: new Map([
      [
        'models/fixture/fixture.cook-0123456789abcdef.glb',
        path.join(root, 'dist/delivery/cache/escape/fixture.txt'),
      ],
    ]),
  };
  const game = createGameServer({ port: 0, host: '127.0.0.1', assetRoot: root, delivery });
  await game.listen();
  t.after(() => game.close());
  const base = `http://127.0.0.1:${game.address().port}`;
  for (const route of [
    '/escape/fixture.txt',
    '/src/escape/fixture.txt',
    '/hidden-alias/fixture.txt',
    '/models/fixture/fixture.cook-0123456789abcdef.glb',
  ])
    assert.equal((await fetch(base + route)).status, 403, route);
  assert.equal(await (await fetch(`${base}/alias/fixture.txt`)).text(), 'inside public');
  assert.equal((await fetch(`${base}/missing.txt`)).status, 404);
});
