import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('every copied browser library carries the complete license text', async () => {
  for (const [original, served] of [
    ['node_modules/three/LICENSE', 'public/vendor/three-LICENSE.txt'],
    ['node_modules/meshoptimizer/LICENSE.md', 'public/vendor/meshoptimizer-LICENSE.txt'],
    ['public/motion/MEDIAPIPE-LICENSE.txt', 'public/vendor/mediapipe/LICENSE.txt'],
  ])
    assert.deepEqual(await readFile(served), await readFile(original), served);
});
