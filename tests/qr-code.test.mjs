import test from 'node:test';
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import { QR_MAX_VERSION, qrModules, qrSvg } from '../dist/src/qr-code.js';

/** Draw the symbol as an RGBA image (quiet zone included) and read it back. */
function decode(modules, scale = 4) {
  const size = (modules.length + 8) * scale;
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
  modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (!dark) return;
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) {
          const i = (((y + 4) * scale + dy) * size + (x + 4) * scale + dx) * 4;
          pixels.fill(0, i, i + 3);
        }
    }),
  );
  return jsQR(pixels, size, size, { inversionAttempts: 'dontInvert' });
}

test('invitation links of every supported length decode to exactly the same text', () => {
  const versions = new Set();
  for (let length = 1; length <= 213; length += 7) {
    const text = `http://192.168.1.${length % 255}:3000/?room=HOME&x=${'a'.repeat(length)}`.slice(
      0,
      length,
    );
    const modules = qrModules(text);
    assert.ok(modules, `length ${length}`);
    versions.add((modules.length - 17) / 4);
    const result = decode(modules);
    assert.ok(result, `unreadable at length ${length}`);
    assert.equal(result.data, text);
  }
  // Every version from 1 to 10 was exercised, including the version information blocks.
  assert.deepEqual(
    [...versions].sort((a, b) => a - b),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  );
  assert.equal(QR_MAX_VERSION, 10);
});

test('non-ASCII text survives as UTF-8, and text beyond version 10 is refused', () => {
  const text = 'http://192.168.0.5:3000/?room=いえ';
  assert.equal(decode(qrModules(text)).data, text);
  assert.equal(qrModules('x'.repeat(214)), null);
  assert.equal(qrSvg('x'.repeat(214)), '');
  const svg = qrSvg('http://10.0.0.2:3000/', 'invite <link>');
  // 21 bytes need version 2 at level M: 25 modules and a four-module quiet zone each side.
  assert.match(svg, /^<svg [^>]*viewBox="0 0 33 33"/);
  assert.match(svg, /aria-label="invite link"/);
});
