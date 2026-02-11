import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server';

describe('web static assets', () => {
  let app = buildServer({ storage: 'memory' });

  beforeEach(async () => {
    app = buildServer({ storage: 'memory' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('serves index page from root path', async () => {
    const response = await request(app.server).get('/');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('三色日记');
    expect(response.text).toContain('密码登录');
    expect(response.text).toContain('忘记密码');
    expect(response.text).toContain('退出登录');
  });

  it('serves frontend css and js assets', async () => {
    const css = await request(app.server).get('/app.css');
    expect(css.status).toBe(200);
    expect(css.headers['content-type']).toContain('text/css');
    expect(css.text).toContain('--thought');

    const js = await request(app.server).get('/app.js');
    expect(js.status).toBe(200);
    expect(js.headers['content-type']).toContain('application/javascript');
    expect(js.text).toContain('handleSubmitJournal');
    expect(js.text).toContain('锁定中');
    expect(js.text).toContain('连续失败');
  });
});
