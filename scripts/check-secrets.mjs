// Fails when a file in the repository holds a credential (R25.3, design §3.12). It matches token
// shapes, not words, so documents that mention "service_role" or a key header pass. Findings name
// the file, line and kind of secret, never the value (R25.2).
//
// Usage: npm run check:secrets

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// One or more line breaks or spaces, raw or escaped inside a string literal ("\n").
const BREAK = String.raw`(?:\s|\\[rn])+`;

const RULES = [
  { rule: 'Supabase secret key', pattern: /sb_secret_[\w-]{20,}/g },
  { rule: 'Supabase access token', pattern: /sbp_[0-9a-f]{40}/g },
  { rule: 'Sentry token', pattern: /sntrys_[\w+/=-]{20,}/g },
  { rule: 'GitHub token', pattern: /gh[pousr]_[A-Za-z0-9]{36}/g },
  {
    // A header followed by key material, allowing for the Proc-Type and DEK-Info fields of an
    // encrypted key. A header on its own, as in the specs, isn't a key.
    rule: 'Private key',
    pattern: new RegExp(
      `-----BEGIN [A-Z ]*PRIVATE KEY-----(?:${BREAK}[\\w-]+:[^\\r\\n\\\\]*)*${BREAK}[A-Za-z0-9+/]{16}`,
      'g',
    ),
  },
  {
    // Decoded below: only a token whose role bypasses Row Level Security fails. The publishable
    // anon key is public by design.
    rule: 'Privileged Supabase JWT',
    pattern: /eyJ[\w-]*\.(eyJ[\w-]*)/g,
    accept: (match) => PRIVILEGED_ROLES.has(roleOf(match[1])),
  },
];

const PRIVILEGED_ROLES = new Set(['service_role', 'supabase_admin']);

function roleOf(payload) {
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).role;
  } catch {
    return undefined;
  }
}

/** Every secret in `text`, as its 1-based line and the rule it broke. */
export function scanText(text) {
  const findings = [];
  for (const { rule, pattern, accept } of RULES) {
    for (const match of text.matchAll(pattern)) {
      if (accept && !accept(match)) continue;
      findings.push({ line: text.slice(0, match.index).split('\n').length, rule });
    }
  }
  return findings.sort((a, b) => a.line - b.line);
}

// Git's own test: a NUL byte near the start means the file is binary.
function isBinary(buffer) {
  return buffer.subarray(0, 8000).includes(0);
}

// A tracked file deleted from the working tree, or a submodule's directory.
const SKIPPED_READ_ERRORS = new Set(['ENOENT', 'EISDIR']);

/** Scans each text file, skipping binaries and paths that can't be read as files. */
export function scanFiles(files, read) {
  const findings = [];
  for (const file of files) {
    let buffer;
    try {
      buffer = read(file);
    } catch (error) {
      if (SKIPPED_READ_ERRORS.has(error.code)) continue;
      throw error;
    }
    if (isBinary(buffer)) continue;
    for (const finding of scanText(buffer.toString('utf8'))) findings.push({ file, ...finding });
  }
  return findings;
}

/** Tracked files, plus untracked ones that aren't ignored, so a secret is caught before `git add`. */
function repositoryFiles() {
  const args = ['ls-files', '-z', '--cached', '--others', '--exclude-standard'];
  const output = execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return [...new Set(output.split('\0').filter(Boolean))];
}

/** Returns the exit code: 1 when anything is found. */
export function main({
  files = repositoryFiles(),
  read = readFileSync,
  log = console.log,
  github = process.env.GITHUB_ACTIONS === 'true',
}) {
  const findings = scanFiles(files, read);
  if (findings.length === 0) {
    log(`No secrets found in ${files.length} file${files.length === 1 ? '' : 's'}.`);
    return 0;
  }

  for (const { file, line, rule } of findings) {
    log(github ? `::error file=${file},line=${line}::${rule}` : `${file}:${line}: ${rule}`);
  }
  log(
    `\n${findings.length} possible secret(s). Remove each one, and rotate it if it was ever pushed.`,
  );
  return 1;
}

// Run from the command line rather than imported by the tests.
if (process.argv[1].endsWith('check-secrets.mjs')) process.exitCode = main({});
