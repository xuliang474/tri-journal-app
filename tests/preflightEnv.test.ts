import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function runPreflight(envContent: string, extraEnv: Record<string, string> = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'tri-preflight-'));
  const envFile = path.join(dir, '.env');
  writeFileSync(envFile, envContent, 'utf8');

  const scriptPath = path.resolve(process.cwd(), 'scripts/preflight_env.sh');
  const result = spawnSync('bash', [scriptPath], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ENV_FILE: envFile,
      ...extraEnv
    },
    encoding: 'utf8'
  });

  rmSync(dir, { recursive: true, force: true });
  return result;
}

describe('preflight env script', () => {
  it('passes with production postgres env', () => {
    const result = runPreflight(
      [
        'NODE_ENV=production',
        'STORAGE_DRIVER=postgres',
        'DATABASE_URL=postgres://user:pass@127.0.0.1:5432/tri_journal',
        'PORT=3000'
      ].join('\n')
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('PASS: 环境变量检查通过');
  });

  it('fails when DATABASE_URL is missing for postgres', () => {
    const result = runPreflight(['NODE_ENV=production', 'STORAGE_DRIVER=postgres'].join('\n'));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('DATABASE_URL');
  });

  it('fails when production uses memory storage without override', () => {
    const result = runPreflight(['NODE_ENV=production', 'STORAGE_DRIVER=memory'].join('\n'));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('memory');
  });
});
