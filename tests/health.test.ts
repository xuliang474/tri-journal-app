import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server';

describe('ops health endpoints', () => {
  let app = buildServer({ storage: 'memory' });

  beforeEach(async () => {
    app = buildServer({ storage: 'memory' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns ok for healthz and readyz', async () => {
    const health = await request(app.server).get('/healthz');
    expect(health.status).toBe(200);
    expect(health.body.code).toBe(0);
    expect(health.body.data.status).toBe('ok');
    expect(typeof health.body.data.uptime_sec).toBe('number');

    const ready = await request(app.server).get('/readyz');
    expect(ready.status).toBe(200);
    expect(ready.body.code).toBe(0);
    expect(ready.body.data.status).toBe('ready');
  });
});
