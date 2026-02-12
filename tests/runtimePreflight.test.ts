import { describe, expect, it } from 'vitest';
import {
  assertRuntimeEnv,
  shouldRunRuntimePreflight,
  validateRuntimeEnv
} from '../src/runtimePreflight';

describe('runtime preflight', () => {
  it('runs by default in production or when explicit switch is enabled', () => {
    expect(shouldRunRuntimePreflight({ NODE_ENV: 'production' })).toBe(true);
    expect(shouldRunRuntimePreflight({ NODE_ENV: 'development' })).toBe(false);
    expect(shouldRunRuntimePreflight({ ENABLE_RUNTIME_PREFLIGHT: '1' })).toBe(true);
  });

  it('accepts valid production postgres env', () => {
    const errors = validateRuntimeEnv({
      NODE_ENV: 'production',
      STORAGE_DRIVER: 'postgres',
      DATABASE_URL: 'postgres://user:pass@127.0.0.1:5432/tri_journal',
      PORT: '3000'
    });
    expect(errors).toEqual([]);
  });

  it('fails for invalid postgres and port settings', () => {
    const errors = validateRuntimeEnv({
      NODE_ENV: 'production',
      STORAGE_DRIVER: 'postgres',
      DATABASE_URL: 'mysql://bad',
      PORT: '70000'
    });

    expect(errors.some((item) => item.includes('DATABASE_URL'))).toBe(true);
    expect(errors.some((item) => item.includes('PORT'))).toBe(true);
  });

  it('fails for production memory by default but can be overridden', () => {
    const normalErrors = validateRuntimeEnv({
      NODE_ENV: 'production',
      STORAGE_DRIVER: 'memory',
      PORT: '3000'
    });
    expect(normalErrors.some((item) => item.includes('memory'))).toBe(true);

    const overriddenErrors = validateRuntimeEnv(
      {
        NODE_ENV: 'production',
        STORAGE_DRIVER: 'memory',
        PORT: '3000'
      },
      { allowMemoryInProduction: true }
    );
    expect(overriddenErrors).toEqual([]);
  });

  it('throws on assert when env is invalid', () => {
    expect(() =>
      assertRuntimeEnv({
        NODE_ENV: 'production',
        STORAGE_DRIVER: 'postgres',
        PORT: '3000'
      })
    ).toThrow('DATABASE_URL');
  });
});
