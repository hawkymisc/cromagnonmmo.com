// Shared play on a LAN host (docs/lan-play.md), in a real browser: the host PC on localhost
// and a phone on this machine's network address join the same room. The host brings a
// solo character; the phone, on a plain-http page, is offered only the shared room.
// Run after `pnpm run build`. Writes screenshots and a report to output/qa-lan-play/.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { createPersistentGameServer } from '../dist/server.mjs';
import { lanSettings, lanUrls } from '../dist/infrastructure/node/lan-settings.mjs';
import { readDeliveryOverlay } from '../dist/infrastructure/node/delivery-overlay.mjs';
import { enterPreparedWorld } from './qa-game-entry.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'output/qa-lan-play');
await mkdir(output, { recursive: true });
const saveDirectory = await mkdtemp(path.join(os.tmpdir(), 'cro-lan-qa-'));
const lan = lanSettings({ CRO_MULTIPLAYER: 'lan', HOST: '0.0.0.0' });
const game = await createPersistentGameServer({
  ...lan,
  port: 0,
  saveDirectory,
  enableRoomReset: false,
  delivery: process.env.CRO_DELIVERY === 'masters' ? null : await readDeliveryOverlay(root),
});
const { port } = await game.listen();
const network = lanUrls(port)[0];
assert.ok(network, 'this machine needs a network address for the phone');
// Chrome is the release browser (channel: 'chrome'); QA_BROWSER_CHANNEL= (empty) uses
// Playwright's bundled Chromium, and QA_CHROMIUM names another executable.
const channel = process.env.QA_BROWSER_CHANNEL ?? 'chrome';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.QA_CHROMIUM
    ? { executablePath: process.env.QA_CHROMIUM }
    : channel
      ? { channel }
      : {}),
  // A LAN address is reached directly, never through a configured web proxy.
  args: [
    '--no-proxy-server',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});
const errors = [];
const sockets = [];
const report = [];
const pass = (line) => {
  report.push(line);
  console.log(`ok - ${line}`);
};

async function open(context, base) {
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.stack || error.message));
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await page.goto(`${base}/`);
  const decline = page.getByRole('button', { name: /^(許可しない|Do not allow)$/ });
  if (await decline.isVisible().catch(() => false)) await decline.click();
  await page.locator('#title-start').waitFor();
  await page.waitForFunction(
    () => document.querySelector('#title-start')?.textContent === 'みんなで遊ぶ',
    undefined,
    { polling: 250, timeout: 60000 },
  );
  // The title fades in; capture it once it is drawn.
  await page.waitForTimeout(4000);
  return page;
}

async function join(page, name, mobile, carry = false) {
  const press = (locator) => (mobile ? locator.tap() : locator.click());
  await press(page.locator('#title-start'));
  await page.locator('#setup-form input[name="name"]').fill(name);
  assert.equal(await page.locator('#setup-form input[name="room"]').inputValue(), 'HOME');
  if (carry) {
    await page.locator('#carry-remembered-choice').waitFor();
    await press(page.locator('#carry-remembered'));
    assert.match(await page.locator('#carry-status').innerText(), /連れていきます/);
  }
  await page.screenshot({ path: `${output}/${name}-setup.png` });
  await press(page.locator('#setup-flow-yes'));
  await press(page.locator('#mascot-start'));
  await enterPreparedWorld(page, mobile, 300000);
}

try {
  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  // A solo character this page played before, kept by src/net/character-card.ts.
  await hostContext.addInitScript(() => {
    localStorage.setItem(
      'cro-solo-character',
      JSON.stringify({
        format: 'cro-magnon-character',
        version: 1,
        savedAt: 1767225600000,
        name: 'たき火',
        character: 'cro-magnon-woman',
        progress: { inventory: { wood: 13, stone: 4, berry: 2 }, tool: true, gathered: 19 },
      }),
    );
  });
  const host = await open(hostContext, `http://localhost:${port}`);
  assert.equal(await host.locator('#title-online').innerText(), 'ひとりで遊ぶ');
  assert.equal(await host.locator('#title-online').isDisabled(), false);
  await host.screenshot({ path: `${output}/host-title.png` });
  pass('The host PC (localhost) is offered the shared room first, and solo play beside it');

  const phoneContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const phone = await open(phoneContext, network);
  assert.equal(await phone.evaluate(() => isSecureContext), false);
  assert.equal(await phone.locator('#title-online').isDisabled(), true);
  assert.match(await phone.locator('#title-online').innerText(), /使えません/);
  await phone.screenshot({ path: `${output}/phone-title.png` });
  pass(`A phone on ${network} (plain http) is offered only the shared room`);

  await join(host, 'Host', false, true);
  const room = () => game.rooms.get('HOME');
  const hostPlayer = [...room().players.values()][0];
  assert.equal(hostPlayer.inventory.wood, 13);
  assert.equal(hostPlayer.tool, true);
  assert.ok(hostPlayer.id.startsWith('p-'), 'the host is named by its browser key');
  await host.getByText(/持ち物と探索の記録を連れてきました/).waitFor({ timeout: 10000 });
  pass('The host joins with the solo character it remembered: possessions and tools carried');

  await join(phone, 'Phone', true);
  for (let waited = 0; room().players.size < 2 && waited < 60000; waited += 500)
    await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(
    room().players.size,
    2,
    JSON.stringify({
      present: [...room().players.values()].map((p) => p.name),
      waiting: [...room().sessions.values()].map((s) => s.player.name),
      host: await host.locator('#connection-label').innerText(),
      sockets,
    }),
  );
  const phonePlayer = [...room().players.values()].find((p) => p.name === 'Phone');
  assert.ok(phonePlayer.identity, 'the phone is named by its random secret');
  // Interval polling: a software-rendered page may draw only about one frame a second.
  for (const page of [host, phone])
    await page.waitForFunction(
      () => document.querySelector('#online-count')?.textContent === '2/8',
      undefined,
      { polling: 500, timeout: 120000 },
    );
  await host.screenshot({ path: `${output}/host-world.png` });
  await phone.screenshot({ path: `${output}/phone-world.png` });
  pass('Both stand in the same room HOME and each sees 2/8');

  for (const url of sockets) {
    const params = new URL(url).searchParams;
    assert.equal(params.get('hello'), '1');
    assert.equal(params.get('session'), null, url);
    assert.equal(params.get('identity'), null, url);
  }
  pass('No WebSocket URL carries a resume token or an identity key');

  // A software-rendered world draws slowly; press the buttons without waiting for frames.
  await host.evaluate(() => document.querySelector('#status-plate').click());
  await host.locator('#tribe-invite').waitFor({ timeout: 60000 });
  await host.evaluate(() => document.querySelector('#tribe-invite').click());
  const qr = host.locator('#invite-qr svg');
  await qr.waitFor({ timeout: 60000 });
  // The SVG the page inserted, drawn at a camera-like size and read independently.
  const svg = await host.locator('#invite-qr-image').innerHTML();
  const image = await sharp(Buffer.from(svg))
    .resize(400, 400, { kernel: 'nearest' })
    .flatten({ background: '#fff' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const decoded = jsQR(new Uint8ClampedArray(image.data), image.info.width, image.info.height);
  assert.equal(decoded?.data, `${network}/?room=HOME`);
  await host.screenshot({ path: `${output}/host-invite.png` });
  pass(`The invitation QR code reads ${decoded.data}`);

  assert.deepEqual(errors, []);
  pass('No page errors');
} finally {
  await writeFile(path.join(output, 'report.json'), JSON.stringify({ report, errors }, null, 2));
  await browser.close();
  await game.close();
  await rm(saveDirectory, { recursive: true, force: true });
}
