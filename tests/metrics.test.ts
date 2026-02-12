import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server';

describe('ops metrics endpoint', () => {
  let app = buildServer({ storage: 'memory' });

  beforeEach(async () => {
    app = buildServer({ storage: 'memory' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('exposes prometheus text metrics', async () => {
    await request(app.server).get('/healthz');
    await request(app.server).get('/readyz');

    const metrics = await request(app.server).get('/metrics');
    expect(metrics.status).toBe(200);
    expect(metrics.headers['content-type']).toContain('text/plain');
    expect(metrics.text).toContain('# HELP tri_http_requests_total');
    expect(metrics.text).toContain('tri_uptime_seconds ');
    expect(metrics.text).toContain(
      'tri_http_requests_total{method="GET",route="/healthz",status="200"}'
    );
    expect(metrics.text).toContain(
      'tri_http_request_duration_ms_count{method="GET",route="/readyz"}'
    );
  });
});
