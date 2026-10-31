import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { auditFile } from '../scripts/audit-public-repository.mjs';

test('public audit reports locations without including credential values', () => {
  const secret = ['ghp_', 'Q7vJ8kL3mN5pR2sT4uV6wX9yZ1aB0cD2eF3gH4iJ'].join('');
  const findings = auditFile('fixture.txt', Buffer.from(`first line\n${secret}`));
  assert.deepEqual(findings, [{ file: 'fixture.txt', rule: 'provider-token', line: 2 }]);
  assert.ok(!JSON.stringify(findings).includes(secret));
  assert.equal(auditFile('.env.production', Buffer.from('HOST=127.0.0.1'))[0].rule, 'private-file');
  assert.deepEqual(auditFile('.env.example', Buffer.from('HOST=127.0.0.1')), []);
  assert.deepEqual(
    auditFile('example.js', Buffer.from('const token = process.env.API_TOKEN;')),
    [],
  );
});

test('local settings and private keys are ignored while the environment example stays public', () => {
  const names = [
    '.env.local',
    '.env.production',
    '.env.test.local',
    '.vscode/settings.json',
    '.idea/workspace.xml',
    '.codex/config.toml',
    '.agents/notes.md',
    '.aws/config',
    'private.key',
    'private.pem',
    'private.p12',
    '.npmrc',
    '.env.example',
  ];
  const result = execFileSync('git', ['check-ignore', '--no-index', '--stdin'], {
    input: names.join('\n') + '\n',
    encoding: 'utf8',
  })
    .trim()
    .split('\n');
  assert.deepEqual(result, names.slice(0, -1));
});

test('internal records and embedded publication notes cannot enter public documentation', () => {
  assert.equal(auditFile('docs/records/example.md', Buffer.from('notes'))[0].rule, 'private-file');
  assert.deepEqual(auditFile('docs/game-spec.md', Buffer.from('# Game specification')), []);
  const note = ['Public repository', 'recreation policy'].join(': ');
  const findings = auditFile('docs/README.md', Buffer.from(`heading\n${note}`));
  assert.deepEqual(findings, [
    { file: 'docs/README.md', rule: 'internal-publication-metadata', line: 2 },
  ]);
  assert.ok(!JSON.stringify(findings).includes(note));
  const prompt = JSON.stringify({ prompt: 'private production instructions' });
  assert.equal(
    auditFile('public/model.json', Buffer.from(prompt))[0].rule,
    'production-instructions',
  );
});

test('descriptions of non-public storage are detected without mistaking runtime privacy terms', () => {
  const examples = [
    ['private', 'archive', 'repository'].join(' '),
    ['private', 'backup'].join(' '),
    ['非公開の', '保管先'].join(''),
    ['untracked one-off', 'rollout script'].join(' '),
  ];
  for (const example of examples) {
    const findings = auditFile('docs/ARCHITECTURE.md', Buffer.from(`Heading\n${example}`));
    assert.deepEqual(findings, [
      { file: 'docs/ARCHITECTURE.md', rule: 'internal-publication-metadata', line: 2 },
    ]);
    assert.ok(!JSON.stringify(findings).includes(example));
  }
  assert.deepEqual(
    auditFile(
      'docs/ARCHITECTURE.md',
      Buffer.from('Public snapshots exclude private session data.'),
    ),
    [],
  );
  assert.deepEqual(
    auditFile('docs/DEVELOPMENT.md', Buffer.from('Local play needs no private services.')),
    [],
  );
});

test('workflow notes are detected in tool documentation, forms, metadata and source comments', () => {
  const cases = [
    ['scripts/tool/README.md', ['A later package/runtime', 'task must pin it.'].join(' ')],
    [
      '.github/ISSUE_TEMPLATE/feature.yml',
      ['The features planned', 'for the game are in README.'].join(' '),
    ],
    [
      'public/model.json',
      JSON.stringify({ notes: [['earlier approved', 'reference attached'].join(' ')] }),
    ],
    ['scripts/tool.mjs', ['// Codex', 'reviews a plan before applying it.'].join(' ')],
    ['tests/tool.test.mjs', ['// The user', 'deleted local originals.'].join(' ')],
  ];
  for (const [file, text] of cases) {
    const findings = auditFile(file, Buffer.from(text));
    assert.deepEqual(findings, [{ file, rule: 'internal-workflow-note', line: 1 }]);
    assert.ok(!JSON.stringify(findings).includes(text));
  }
});

test('source attribution and current contributor procedures remain valid public documentation', () => {
  assert.deepEqual(
    auditFile(
      'public/model.json',
      Buffer.from(JSON.stringify({ provider: 'Codex CLI image_gen' })),
    ),
    [],
  );
  assert.deepEqual(
    auditFile(
      'scripts/tool/README.md',
      Buffer.from('Review the candidate plan before applying it.'),
    ),
    [],
  );
  assert.deepEqual(
    auditFile('scripts/tool.mjs', Buffer.from('const nextTask = queue.shift();')),
    [],
  );
  assert.equal(
    auditFile('.codex/config.toml', Buffer.from('name = "example"'))[0].rule,
    'private-file',
  );
});

test('model manifests keep source attribution without embedded production diaries', () => {
  const file = 'public/models/example/asset.json';
  const source = {
    provenance: { provider: 'Codex', reconstruction: 'TRELLIS-2' },
    sha256: '0'.repeat(64),
  };
  assert.deepEqual(auditFile(file, Buffer.from(JSON.stringify(source))), []);
  for (const value of [
    { ...source, notes: ['Production diary'] },
    { assets: [{ ...source, notes: 'Production diary' }] },
  ]) {
    assert.deepEqual(auditFile(file, Buffer.from(JSON.stringify(value))), [
      { file, rule: 'production-notes' },
    ]);
  }
  const generator = ['request and prompt', 'saved beside the reference'].join(' ');
  const findings = auditFile(
    file,
    Buffer.from(JSON.stringify({ provenance: { referenceGenerator: generator } })),
  );
  assert.deepEqual(findings, [{ file, rule: 'internal-workflow-note', line: 1 }]);
  assert.ok(!JSON.stringify(findings).includes(generator));
});
