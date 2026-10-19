import { execFileSync } from 'node:child_process';

import { makeJwt } from '../src/test/jwt';
import { main, scanFiles, scanText } from './check-secrets.mjs';

// U-SEC-01 to U-SEC-09 in specs/mvp/4-test-plan.md §3.5. Every fixture is assembled at runtime, so
// this file never contains a real-looking secret and passes the scan itself.

const SUPABASE_SECRET = 'sb_secret_' + 'a1B2-c3D4_'.repeat(3);
const SUPABASE_PAT = 'sbp_' + '0123456789abcdef'.repeat(3).slice(0, 40);
const SENTRY_TOKEN = 'sntrys_' + 'eyJpYXQiOjE3MDAwMDAwMDB9_ab+/='.repeat(2);
const GITHUB_BODY = 'A1b2C3d4E5f6'.repeat(3);
const KEY_BODY = 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASC'.repeat(2);

function pem(label) {
  return [`-----BEGIN ${label}-----`, KEY_BODY, `-----END ${label}-----`].join('\n');
}

function rules(text) {
  return scanText(text).map((finding) => finding.rule);
}

describe('scanText', () => {
  it('flags a Supabase secret key with 20 or more key characters (U-SEC-01)', () => {
    expect(rules(`SUPABASE_KEY=${SUPABASE_SECRET}`)).toEqual(['Supabase secret key']);
    expect(rules('sb_secret_' + 'a'.repeat(19))).toEqual([]);
  });

  it('flags a Supabase personal access token (U-SEC-02)', () => {
    expect(rules(`token: ${SUPABASE_PAT}`)).toEqual(['Supabase access token']);
  });

  it('flags a Sentry token (U-SEC-03)', () => {
    expect(rules(`SENTRY_AUTH_TOKEN=${SENTRY_TOKEN}`)).toEqual(['Sentry token']);
  });

  it.each(['ghp', 'gho', 'ghu', 'ghs', 'ghr'])('flags a GitHub %s_ token (U-SEC-04)', (prefix) => {
    expect(rules(`${prefix}_${GITHUB_BODY}`)).toEqual(['GitHub token']);
  });

  it.each(['PRIVATE KEY', 'RSA PRIVATE KEY', 'OPENSSH PRIVATE KEY'])(
    'flags a %s block (U-SEC-05)',
    (label) => {
      expect(rules(pem(label))).toEqual(['Private key']);
    },
  );

  it('flags a private key escaped inside a JSON string (U-SEC-05)', () => {
    const json = JSON.stringify({ private_key: pem('PRIVATE KEY') + '\n' });

    expect(rules(json)).toEqual(['Private key']);
  });

  it('flags an encrypted PEM block with header fields (U-SEC-05)', () => {
    const block = [
      '-----BEGIN RSA PRIVATE KEY-----',
      'Proc-Type: 4,ENCRYPTED',
      'DEK-Info: AES-128-CBC,0123456789ABCDEF',
      '',
      KEY_BODY,
    ].join('\n');

    expect(rules(block)).toEqual(['Private key']);
  });

  it.each(['service_role', 'supabase_admin'])('flags a JWT whose role is %s (U-SEC-06)', (role) => {
    expect(rules(`key = "${makeJwt({ iss: 'supabase-demo', role })}"`)).toEqual([
      'Privileged Supabase JWT',
    ]);
  });

  it('passes prose that names the secrets without containing one (U-SEC-07)', () => {
    const prose = [
      'Never ship the service_role key or an sb_secret_… key in the app.',
      'The scanner fails on `-----BEGIN PRIVATE KEY-----` and `-----BEGIN RSA PRIVATE KEY-----`.',
      'Tokens look like ghp_… and sbp_… and sntrys_….',
    ].join('\n');

    expect(rules(prose)).toEqual([]);
  });

  it('passes the local anon and authenticated JWTs (U-SEC-08)', () => {
    const anon = makeJwt({ iss: 'supabase-demo', role: 'anon', exp: 1983812996 });
    const user = makeJwt({ sub: 'user-id', role: 'authenticated' });

    expect(rules(`${anon}\n${user}`)).toEqual([]);
  });

  it("passes a JWT-shaped string whose payload isn't JSON", () => {
    expect(rules('eyJhbGciOiJub25lIn0.eyJub3QganNvbg.sig')).toEqual([]);
  });

  it('reports the line of each finding', () => {
    const text = ['first', `second ${SUPABASE_SECRET}`, 'third', pem('PRIVATE KEY')].join('\n');

    expect(scanText(text)).toEqual([
      { line: 2, rule: 'Supabase secret key' },
      { line: 4, rule: 'Private key' },
    ]);
  });
});

describe('scanFiles', () => {
  const files = {
    'clean.ts': 'export const ok = true;\n',
    'config.env': `URL=http://127.0.0.1:54321\nKEY=${SUPABASE_SECRET}\n`,
    'icon.png': Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0]),
      Buffer.from(SUPABASE_PAT),
    ]),
  };

  function read(path) {
    if (!(path in files)) {
      throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
    }
    return Buffer.from(files[path]);
  }

  it('reports findings with their file and line', () => {
    expect(scanFiles(['clean.ts', 'config.env'], read)).toEqual([
      { file: 'config.env', line: 2, rule: 'Supabase secret key' },
    ]);
  });

  it('skips binary files', () => {
    expect(scanFiles(['icon.png'], read)).toEqual([]);
  });

  it('skips tracked files that were deleted from the working tree', () => {
    expect(scanFiles(['deleted.ts'], read)).toEqual([]);
  });

  it('rethrows other read errors', () => {
    const failing = () => {
      throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
    };

    expect(() => scanFiles(['locked.ts'], failing)).toThrow('EACCES');
  });
});

describe('main', () => {
  function run(options) {
    const lines = [];
    const code = main({ ...options, log: (line) => lines.push(line) });
    return { code, output: lines.join('\n') };
  }

  const files = ['src/a.ts', 'docs/b.md'];
  const contents = { 'src/a.ts': 'const x = 1;\n', 'docs/b.md': `one\ntwo\n${SUPABASE_SECRET}\n` };
  const read = (path) => Buffer.from(contents[path]);

  it('fails and names the file, line and rule, but never the value (U-SEC-09)', () => {
    const { code, output } = run({ files, read, github: false });

    expect(code).toBe(1);
    expect(output).toContain('docs/b.md:3: Supabase secret key');
    expect(output).not.toContain(SUPABASE_SECRET);
    expect(output).not.toContain(SUPABASE_SECRET.slice(10, 20));
  });

  it('writes GitHub annotations in Actions', () => {
    const { output } = run({ files, read, github: true });

    expect(output).toContain('::error file=docs/b.md,line=3::Supabase secret key');
    expect(output).not.toContain(SUPABASE_SECRET);
  });

  it('passes when nothing is found', () => {
    const { code, output } = run({ files: ['src/a.ts'], read, github: false });

    expect(code).toBe(0);
    expect(output).toBe('No secrets found in 1 file.');
  });

  it('passes on this repository, including this test file', () => {
    const { code, output } = run({});

    expect(output).toMatch(/^No secrets found in \d+ files\.$/);
    expect(code).toBe(0);
  });

  it('logs to the console, and detects GitHub Actions from the environment', () => {
    const saved = process.env.GITHUB_ACTIONS;
    process.env.GITHUB_ACTIONS = 'true';
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      expect(main({ files, read })).toBe(1);
      expect(log).toHaveBeenCalledWith('::error file=docs/b.md,line=3::Supabase secret key');
    } finally {
      log.mockRestore();
      if (saved === undefined) delete process.env.GITHUB_ACTIONS;
      else process.env.GITHUB_ACTIONS = saved;
    }
  });
});

describe('npm run check:secrets', () => {
  it('runs under plain Node and exits 0 on this repository', () => {
    // Node, not Jest's Babel transform, runs the script in CI.
    const output = execFileSync(process.execPath, ['scripts/check-secrets.mjs'], {
      encoding: 'utf8',
    });

    expect(output).toMatch(/^No secrets found in \d+ files\.\n$/);
  });
});
