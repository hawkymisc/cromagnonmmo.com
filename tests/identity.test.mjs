import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import {
  IDENTITY_PREFIX,
  base64url,
  fromBase64url,
  identityFromPublicKey,
  isPublicKey,
  sha256,
} from '../dist/application/identity.mjs';

test('the synchronous SHA-256 matches the platform digest at every block boundary', () => {
  for (const length of [0, 1, 3, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000, 4099]) {
    const bytes = new Uint8Array(length).map((_, i) => (i * 131 + length) & 255);
    assert.equal(
      Buffer.from(sha256(bytes)).toString('hex'),
      createHash('sha256').update(bytes).digest('hex'),
      `length ${length}`,
    );
  }
});

test('base64url encodes without padding and refuses foreign text', () => {
  for (const length of [0, 1, 2, 3, 4, 31, 32, 91]) {
    const bytes = new Uint8Array(length).map((_, i) => (i * 37 + 11) & 255);
    const text = base64url(bytes);
    assert.equal(text, Buffer.from(bytes).toString('base64url'));
    assert.deepEqual(fromBase64url(text), bytes);
  }
  assert.equal(fromBase64url('ab+/'), null);
  assert.equal(fromBase64url('abcde'), null);
});

test("a browser's exported P-256 key names one stable, public player id", async () => {
  const keys = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
    'verify',
  ]);
  const spki = new Uint8Array(await webcrypto.subtle.exportKey('spki', keys.publicKey));
  const key = Buffer.from(spki).toString('base64url');
  const id = identityFromPublicKey(key);
  assert.ok(id.startsWith(IDENTITY_PREFIX));
  assert.equal(id.length, IDENTITY_PREFIX.length + 27);
  assert.equal(identityFromPublicKey(key), id, 'the same key is the same person');
  assert.equal(
    id.slice(IDENTITY_PREFIX.length),
    createHash('sha256').update(spki).digest('base64url').slice(0, 27),
  );
  // The id never reveals the key; anything that is not a key is no identity.
  assert.ok(!key.includes(id.slice(IDENTITY_PREFIX.length)));
  for (const bad of [undefined, '', 'short', 'A'.repeat(5000), 'not base64!', 42])
    assert.equal(identityFromPublicKey(bad), null);
  assert.equal(identityFromPublicKey(Buffer.alloc(31, 1).toString('base64url')), null);
  assert.ok(isPublicKey(spki));
});

test('a plain-http page without WebCrypto is named by its random 32-byte secret', () => {
  const secret = Buffer.alloc(32, 7);
  const id = identityFromPublicKey(secret.toString('base64url'));
  assert.equal(id, identityFromPublicKey(secret.toString('base64url')));
  assert.notEqual(id, identityFromPublicKey(Buffer.alloc(32, 8).toString('base64url')));
  assert.equal(isPublicKey(secret), false, 'a later public host can tell it from a key');
});
