import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Repository paths are relative. Fixtures use the made-up user "maker";
// RUNNER~1 is GitHub's Windows runner, and <...> denotes a placeholder.
const ALLOWED_USERS = new Set(['maker', 'RUNNER~1']);
const PROFILE_PATH =
  /(?:(?:[A-Za-z]:(?:\/|\\{1,2})|\/[a-z]\/)Users(?:\/|\\{1,2})|\/(?:Users|home)\/)([^/\\\s"'`)]+)/g;
const BINARY = /\.(?:glb|png|jpe?g|webp|ico|mp3|task)$/i;

function trackedFiles() {
  try {
    return execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      encoding: 'utf8',
      maxBuffer: 64 << 20,
    })
      .split('\0')
      .filter((file) => file && !BINARY.test(file));
  } catch {
    return null;
  }
}

const files = trackedFiles();
test(
  'tracked files name no path under a user profile',
  { skip: !files && 'needs a Git checkout' },
  () => {
    const found = [];
    for (const file of files) {
      let text;
      try {
        text = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      for (const [, user] of text.matchAll(PROFILE_PATH))
        if (!ALLOWED_USERS.has(user) && user !== '…' && !user.startsWith('<'))
          found.push(`${file}: profile path`);
    }
    assert.deepEqual(found, []);
  },
);
