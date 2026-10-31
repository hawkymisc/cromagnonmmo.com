// A local, redacted guard for tracked files and new, non-ignored files. No network requests.
import { execFileSync } from 'node:child_process';
import { readFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const rules = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY(?: BLOCK)?-----/],
  [
    'provider-token',
    /\b(?:gh[pousr]_[A-Za-z0-9]{30,255}|github_pat_[A-Za-z0-9_]{40,255}|sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,255}|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{20,255}|AIza[0-9A-Za-z_-]{30,255}|hf_[A-Za-z0-9]{30,255}|glpat-[A-Za-z0-9_-]{20,255})\b/,
  ],
  [
    'credential-url',
    /\b(?:https?|postgres(?:ql)?|mongodb(?:\+srv)?|redis|amqps?):\/\/[^\s/@:]{1,100}:[^\s/@]{3,100}@/,
  ],
  [
    'secret-assignment',
    /(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd)\s{0,8}[=:]\s{0,8}["'][^"'\r\n]{8,255}["']/i,
  ],
];
const privateFile =
  /(?:^|\/)(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?|\.netrc|_netrc|\.npmrc|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?|credentials(?:\.json)?|[^/]+\.(?:key|pem|p12|pfx))$/i;
const privateDirectory =
  /^(?:\.git|\.vscode|\.idea|\.claude|\.codex|\.agents|\.aws|\.cro-magnon-save|node_modules|dist(?:-cloudflare(?:-worker)?)?|output|scripts\/archive)(?:\/|$)/;
const publicDocumentation = new Set([
  'ARCHITECTURE.md',
  'CLOUDFLARE_DEPLOYMENT.md',
  'DEVELOPMENT.md',
  'game-guide.md',
  'game-spec.md',
  'meshmell-upload.md',
  'performance.md',
  'README.md',
  'releases.md',
]);
const publicationMetadata = [
  /(?:public|公開)[^\r\n]{0,35}(?:repo(?:sitory)?|リポジトリ)[^\r\n]{0,80}(?:one[ -]commit|1コミット|親のない|作り直(?:し|す)|recreat(?:e|ion))/i,
  /github\.com\/[\w.-]+\/[\w.-]*(?:-archive\b|-old-\d{6,})/i,
  /\bprivate(?:[- ]only)?\s+(?:archive|backup)(?:\s+repo(?:sitory)?)?\b/i,
  /(?:非公開(?:の|側の)?|私用の)(?:保管先|保管用(?:リポジトリ)?|アーカイブ)/,
  /\b(?:untracked|one-off)\b[^\r\n]{0,40}\b(?:rollout|deployment)\s+script\b/i,
  /\buser(?:'s)?\s+(?:request|instruction)\b|ユーザー(?:の[「『]|指定|指示)/i,
  /\buser[- ]provided\b/i,
  /docs\/(?:records|changelog|history|asset-remake|motion-controls)\//i,
];
const workflowMetadata = [
  /\b(?:Codex|Claude|ChatGPT)(?:'s)?[^\r\n]{0,100}\b(?:reviews?|reviewed|coordinated|decision|measures|applies)\b/i,
  /\b(?:later|future)\s+(?:package\/runtime|implementation|integration|deployment)\s+task\b/i,
  /(?:features planned for the game|今後入れたい機能は)/i,
  /(?:earlier approved reference attached|\d{4}-\d{2}-\d{2} follow-up by|confirmed upcoming characters)/i,
  /first attempt[^\r\n]{0,60}(?:error|rerun)/i,
  /(?:request and prompt saved beside|no local image generator on this host|unelevated sandbox)/i,
  /\bthe user\s+(?:asked|corrected|deleted)\b|\bper the \d{4}-\d{2}-\d{2} request\b|\bthe author's PC\b/i,
  /(?:previous candidate \d+ files|original candidate revisions|source cave GLB and earlier pigment files) are retained/i,
];
const proseFile = /\.(?:md|txt|json|jsonc|yml|yaml)$|(?:^|\/)\.gitignore$/;
const codeFile = /\.(?:[cm]?[jt]s|py|sh|ps1|css|html)$/;

export function auditFile(name, bytes) {
  const findings = [];
  if (
    (privateFile.test(name) && !/^\.env(?:\..*)?\.example$/.test(name)) ||
    privateDirectory.test(name) ||
    name === 'AGENTS.md' ||
    (name.startsWith('docs/') && !publicDocumentation.has(name.slice(5)))
  )
    findings.push({ file: name, rule: 'private-file' });
  const text = bytes.toString('utf8');
  for (const [rule, expression] of rules) {
    const match = expression.exec(text);
    if (match)
      findings.push({ file: name, rule, line: text.slice(0, match.index).split('\n').length });
  }
  if (proseFile.test(name)) {
    const match = publicationMetadata.map((expression) => expression.exec(text)).find(Boolean);
    if (match)
      findings.push({
        file: name,
        rule: 'internal-publication-metadata',
        line: text.slice(0, match.index).split('\n').length,
      });
  }
  if (proseFile.test(name) || codeFile.test(name)) {
    const lines = text.split('\n');
    const line = lines.findIndex(
      (value) =>
        (proseFile.test(name) || /^\s*(?:\/\/|\/\*|\*|#|<!--)/.test(value)) &&
        workflowMetadata.some((expression) => expression.test(value)),
    );
    if (line !== -1) findings.push({ file: name, rule: 'internal-workflow-note', line: line + 1 });
  }
  if (name.endsWith('.json')) {
    const match = /"(?:referencePrompt|prompt|prompts|request|instructions)"\s*:/.exec(text);
    if (match)
      findings.push({
        file: name,
        rule: 'production-instructions',
        line: text.slice(0, match.index).split('\n').length,
      });
    if (name.startsWith('public/models/')) {
      const containsNotes = (value) =>
        value &&
        typeof value === 'object' &&
        (Object.hasOwn(value, 'notes') || Object.values(value).some(containsNotes));
      if (containsNotes(JSON.parse(text))) findings.push({ file: name, rule: 'production-notes' });
    }
  }
  return findings;
}

export async function auditRepository(directory = root) {
  const actualRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: directory,
    encoding: 'utf8',
  }).trim();
  if (path.resolve(actualRoot) !== path.resolve(directory))
    throw new Error('Run the audit in a Git checkout, not an exported subfolder.');
  const files = [
    ...new Set(
      execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
        cwd: directory,
        encoding: 'utf8',
        maxBuffer: 64 << 20,
      })
        .split('\0')
        .filter(Boolean),
    ),
  ];
  const findings = [];
  for (const file of files) {
    const filename = path.join(directory, file);
    const info = await lstat(filename);
    if (info.isSymbolicLink()) {
      findings.push({ file, rule: 'symlink-needs-review' });
      continue;
    }
    findings.push(...auditFile(file, await readFile(filename)));
  }
  return { files: files.length, findings };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await auditRepository();
  console.log(JSON.stringify(result, null, 2));
  if (result.findings.length) process.exitCode = 1;
}
