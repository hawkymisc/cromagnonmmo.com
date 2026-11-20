// One person in a shared room (`pnpm run start:lan`), measured without a browser or a network:
// the host's tick, what it sends, what a frame would cost as a delta or compressed, the autosave,
// and the page's own SHA-256 against SubtleCrypto. Run `pnpm run build` first.
//
//   node scripts/benchmark-shared-room.mjs [seconds]
//
// The clock is simulated, so 120 game seconds take a few real seconds. Rendering, the GPU and
// real network delay are not measured here (docs/performance-shared-room.md).
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { constants, deflateRawSync } from 'node:zlib';
import { createGameCore } from '../dist/application/game-core.mjs';
import { HOME_RULES } from '../dist/shared/room-rules.mjs';
import { sha256 } from '../dist/src/asset-hash.js';

const seconds = Number(process.argv[2] ?? 120);
if (!Number.isFinite(seconds) || seconds < 5) throw new Error('seconds must be 5 or more');

// The lists a Phase 1 delta frame carries by body (src/net/state-store.ts).
const BODY_LISTS = [
  'players',
  'enemies',
  'animals',
  'residents',
  'companions',
  'orbBots',
  'boats',
  'projectiles',
];
// A WireGuard tunnel carries about this much of a TCP stream per packet (MTU 1280).
const TUNNEL_PAYLOAD_BYTES = 1200;

function spread(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const at = (share) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))];
  const round = (value) => Number(value.toFixed(3));
  return {
    mean: round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
    p50: round(at(0.5)),
    p99: round(at(0.99)),
    max: round(sorted.at(-1)),
  };
}

// Sizes are UTF-8 bytes, as sent: names in a frame are not ASCII.
const bytesOf = (text) => Buffer.byteLength(text);

const sizes = (record, floor) =>
  Object.fromEntries(
    Object.entries(record)
      .map(([key, value]) => [key, bytesOf(JSON.stringify(value) ?? '')])
      .filter(([, size]) => size >= floor)
      .sort((a, b) => b[1] - a[1]),
  );

// Each message on its own, fastest level: permessage-deflate without context takeover.
const deflate = (text) => deflateRawSync(text, { level: constants.Z_BEST_SPEED }).length;
// With the stream's last 32 KiB as the dictionary, default level: what `perMessageDeflate: true`
// does in ws, whose compressor keeps its window from one message to the next.
const WINDOW_BYTES = 32768;
const deflateAfter = (history, text) =>
  deflateRawSync(text, history.length ? { dictionary: history } : {}).length;

/** Only the fields of each body that changed since the previous frame, and the changed scalars. */
function fieldDelta(previous, frame) {
  const delta = { type: 'delta', upsert: {} };
  for (const list of BODY_LISTS) {
    const before = new Map(previous[list].map((body) => [body.id, body]));
    const changed = [];
    for (const body of frame[list]) {
      const old = before.get(body.id);
      const fields = Object.entries(body).filter(
        ([key, value]) => !old || JSON.stringify(old[key]) !== JSON.stringify(value),
      );
      if (fields.length) changed.push({ id: body.id, ...Object.fromEntries(fields) });
    }
    if (changed.length) delta.upsert[list] = changed;
  }
  for (const [key, value] of Object.entries(frame))
    if (!BODY_LISTS.includes(key) && JSON.stringify(previous[key]) !== JSON.stringify(value))
      delta[key] = value;
  return delta;
}

/** Whole bodies that changed at all: what applyFrame() accepts today. */
function bodyDelta(previous, frame) {
  const delta = fieldDelta(previous, frame);
  for (const [list, changed] of Object.entries(delta.upsert)) {
    const ids = new Set(changed.map((body) => body.id));
    delta.upsert[list] = frame[list].filter((body) => ids.has(body.id));
  }
  return delta;
}

// Positions to the millimetre, angles and speeds to three decimals.
const rounded = (frame) =>
  JSON.stringify(frame, (key, value) =>
    typeof value === 'number' && !Number.isInteger(value) ? Number(value.toFixed(3)) : value,
  );

function room(moving) {
  let clock = 1_800_000_000_000,
    ids = 0;
  const core = createGameCore({
    persistentSessions: true,
    keepEmptyRooms: true,
    playerLimit: 8,
    rules: { ...HOME_RULES, playerLimit: 8 },
    runtime: {
      now: () => clock,
      id: () => `id-${++ids}`,
      token: () => `token-${++ids}`.padEnd(64, '0'),
    },
  });
  const handlers = {},
    sent = [];
  core.connect(
    {
      readyState: 1,
      bufferedAmount: 0,
      on: (type, handler) => (handlers[type] = handler),
      send: (data) => sent.push(data),
      close() {},
      ping() {},
      terminate() {},
    },
    new URLSearchParams({ room: 'HOME', resume: '1', name: 'bench', startAtCamp: '1' }),
  );
  sent.length = 0;
  const tickMs = [];
  const totals = { frames: 0, world: 0, full: 0, deflated: 0, stream: 0, rounded: 0 };
  const deltas = { frames: 0, body: 0, bodyDeflated: 0, field: 0, fieldDeflated: 0, enemies: 0 };
  let deflateMs = 0,
    streamMs = 0,
    history = Buffer.alloc(0),
    previous = null,
    light = '',
    angle = 0;
  for (let elapsed = 0; elapsed < seconds * 1000; elapsed += 50) {
    clock += 50;
    // The page sends its direction about every 70 ms while a key is held.
    if (moving && elapsed % 70 < 50) {
      if (elapsed % 4000 < 50) angle += 1.3;
      handlers.message(
        JSON.stringify({ type: 'move', dx: Math.sin(angle), dz: Math.cos(angle), running: true }),
        false,
      );
    }
    const before = performance.now();
    core.tick();
    tickMs.push(performance.now() - before);
    for (const data of sent.splice(0)) {
      const frame = JSON.parse(data);
      if (frame.type !== 'state') continue;
      totals.frames++;
      totals.full += bytesOf(data);
      if (frame.resources) totals.world++;
      else light = data;
      let started = performance.now();
      totals.deflated += deflate(data);
      deflateMs += performance.now() - started;
      started = performance.now();
      totals.stream += deflateAfter(history, data);
      streamMs += performance.now() - started;
      history = Buffer.concat([history, Buffer.from(data)]).subarray(-WINDOW_BYTES);
      totals.rounded += bytesOf(rounded(frame));
      if (previous) {
        const body = JSON.stringify(bodyDelta(previous, frame)),
          field = fieldDelta(previous, frame);
        const fieldText = JSON.stringify(field);
        deltas.frames++;
        deltas.body += bytesOf(body);
        deltas.bodyDeflated += deflate(body);
        deltas.field += bytesOf(fieldText);
        deltas.fieldDeflated += deflate(fieldText);
        deltas.enemies += field.upsert.enemies?.length ?? 0;
      }
      previous = frame;
    }
  }
  const frame = JSON.parse(light);
  const per = (total, count) => Math.round(total / count);
  const snapshotMs = [],
    parseMs = [],
    exportMs = [],
    saveMs = [];
  // What the page does first with each frame, in this V8.
  for (let i = 0; i < 200; i++) {
    const before = performance.now();
    JSON.parse(light);
    parseMs.push(performance.now() - before);
  }
  const self = frame.players[0];
  const enemiesWithin = (metres) =>
    frame.enemies.filter((enemy) => Math.hypot(enemy.x - self.x, enemy.z - self.z) <= metres)
      .length;
  const live = core.rooms.get('HOME');
  for (let i = 0; i < 200; i++) {
    const before = performance.now();
    JSON.stringify(core.snapshot(live, false));
    snapshotMs.push(performance.now() - before);
  }
  let saveBytes = 0;
  for (let i = 0; i < 30; i++) {
    let before = performance.now();
    const state = core.exportState();
    exportMs.push(performance.now() - before);
    // The synchronous part of infrastructure/node/local-save.mts's save().
    before = performance.now();
    const payload = JSON.parse(JSON.stringify(state));
    saveBytes = bytesOf(
      JSON.stringify({
        revision: 1,
        sha256: createHash('sha256')
          .update(JSON.stringify({ revision: 1, state: payload }))
          .digest('hex'),
        state: payload,
      }),
    );
    saveMs.push(performance.now() - before);
  }
  core.close();
  return {
    tickMs: spread(tickMs),
    stateFramesPerSecond: Number((totals.frames / seconds).toFixed(2)),
    framesWithWorld: totals.world,
    bodies: Object.fromEntries(BODY_LISTS.map((list) => [list, frame[list].length])),
    frameBytes: per(totals.full, totals.frames),
    bytesPerSecond: per(totals.full, seconds),
    tunnelPacketsPerFrame: Math.ceil(per(totals.full, totals.frames) / TUNNEL_PAYLOAD_BYTES),
    frameBytesByField: sizes(frame, 150),
    playerBytesByField: sizes(frame.players[0], 60),
    enemiesWithinMetres: { 118: enemiesWithin(118), 150: enemiesWithin(150), 200: enemiesWithin(200) },
    deflatedAloneFrameBytes: per(totals.deflated, totals.frames),
    deflateAloneMsPerFrame: Number((deflateMs / totals.frames).toFixed(3)),
    deflatedInStreamFrameBytes: per(totals.stream, totals.frames),
    deflateInStreamMsPerFrame: Number((streamMs / totals.frames).toFixed(3)),
    roundedFrameBytes: per(totals.rounded, totals.frames),
    bodyDeltaFrameBytes: per(deltas.body, deltas.frames),
    bodyDeltaDeflatedBytes: per(deltas.bodyDeflated, deltas.frames),
    fieldDeltaFrameBytes: per(deltas.field, deltas.frames),
    fieldDeltaDeflatedBytes: per(deltas.fieldDeflated, deltas.frames),
    enemiesChangedPerFrame: Number((deltas.enemies / deltas.frames).toFixed(2)),
    snapshotAndStringifyMs: spread(snapshotMs),
    frameParseMs: spread(parseMs),
    exportStateMs: spread(exportMs),
    saveSynchronousMs: spread(saveMs),
    saveBytes,
  };
}

/** The page hashes every model itself where SubtleCrypto is missing (plain-http LAN addresses). */
async function hashing() {
  const megabytes = 4;
  const bytes = new Uint8Array(megabytes * 1048576);
  for (let i = 0; i < bytes.length; i += 4096) bytes[i] = i & 255;
  // One slice between two of its yields to the event loop: 256 KiB, uninterrupted.
  const slice = bytes.subarray(0, 262144 - 64);
  await sha256(slice, null);
  const timed = async (input, subtle) => {
    const before = performance.now();
    const digest = await sha256(input, subtle);
    return { digest, ms: performance.now() - before };
  };
  const sliceMs = [];
  for (let i = 0; i < 32; i++) sliceMs.push((await timed(slice, null)).ms);
  const own = await timed(bytes, null),
    native = await timed(bytes, globalThis.crypto.subtle);
  if (own.digest !== native.digest) throw new Error('The two SHA-256 results differ');
  // The time spent hashing: the slices alone. The whole call also waits for a timer at each
  // yield, and how long that takes depends on the host (about 15 ms each in Node.js on Windows).
  const computeMs = (sliceMs.reduce((sum, ms) => sum + ms, 0) / sliceMs.length) * megabytes * 4;
  return {
    mebibytes: megabytes,
    javascriptComputeMs: Number(computeMs.toFixed(1)),
    javascriptSliceMs: spread(sliceMs),
    javascriptWithYieldsHereMs: Number(own.ms.toFixed(1)),
    subtleCryptoMs: Number(native.ms.toFixed(1)),
  };
}

console.log(
  JSON.stringify(
    {
      node: process.version,
      simulatedSeconds: seconds,
      idleAtCamp: room(false),
      running: room(true),
      hashing: await hashing(),
    },
    null,
    1,
  ),
);
