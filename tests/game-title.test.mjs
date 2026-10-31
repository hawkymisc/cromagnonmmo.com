import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { publicTitleImages } from '../scripts/site-metadata.mjs';

const root = new URL('../', import.meta.url);

test('the game title uses the MMO edition', async () => {
  // The title markup lives in the title shell; the game renders the same function.
  const [html, shell, review] = await Promise.all([
    readFile(new URL('public/index.html', root), 'utf8'),
    readFile(new URL('src/title-shell.ts', root), 'utf8'),
    readFile(new URL('public/model-review.html', root), 'utf8'),
  ]);

  assert.match(html, /<title>CRO-MAGNON MMO<\/title>/);
  assert.match(html, /name="application-name" content="CRO-MAGNON MMO"/);
  assert.match(html, /property="og:title" content="CRO-MAGNON MMO"/);
  assert.match(shell, /export const GAME_TITLE = 'CRO-MAGNON MMO';/);
  assert.match(shell, /titleArtPath = '\/title\/cro-magnon-mmo-transparent\.webp'/);
  assert.match(shell, /<h1>\$\{GAME_TITLE\}<\/h1>/);
  assert.match(review, /<title>CRO-MAGNON \| ASSET REVIEW<\/title>/);
});

test('title packaging contains exactly the artwork current screens and share metadata use', async () => {
  const sources = await Promise.all(
    [
      'src/title-shell.ts',
      'src/loading-screen.ts',
      'public/index.html',
      'public/en/index.html',
    ].map((file) => readFile(new URL(file, root), 'utf8')),
  );
  const used = new Set(
    sources.flatMap((source) => source.match(/\/title\/[a-z0-9.-]+\.(?:png|webp|jpe?g)/g) ?? []),
  );
  assert.deepEqual([...publicTitleImages].sort(), [...used].sort());
  for (const url of publicTitleImages)
    assert.ok((await readFile(new URL(`public${url}`, root))).length, url);
});
