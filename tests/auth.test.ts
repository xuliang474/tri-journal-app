import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildServer } from '../src/server';

describe('auth and risk controls', () => {
  const baseTime = new Date('2026-02-09T00:00:00.000Z').getTime();
  const deviceId = 'ios-device-1';
  let app = buildServer({ storage: 'memory' });

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(baseTime);
    app = buildServer({ storage: 'memory' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.useRealTimers();
  });

  it('enforces sms cooldown and daily limit', async () => {
    const phone = '13800000001';

    const firstSend = await request(app.server)
      .post('/v1/auth/sms/send')
      .set('x-device-id', deviceId)
      .send({ phone });
    expect(firstSend.status).toBe(200);

    const cooldownHit = await request(app.server)
      .post('/v1/auth/sms/send')
      .set('x-device-id', deviceId)
      .send({ phone });
    expect(cooldownHit.status).toBe(429);
    expect(cooldownHit.body.code).toBe(42901);

    for (let i = 0; i < 9; i += 1) {
      vi.setSystemTime(baseTime + (i + 1) * 61_000);
      const resp = await request(app.server)
        .post('/v1/auth/sms/send')
        .set('x-device-id', deviceId)
        .send({ phone });
      expect(resp.status).toBe(200);
    }

    vi.setSystemTime(baseTime + 10 * 61_000);
    const dailyLimitHit = await request(app.server)
      .post('/v1/auth/sms/send')
      .set('x-device-id', deviceId)
      .send({ phone });
    expect(dailyLimitHit.status).toBe(429);
    expect(dailyLimitHit.body.code).toBe(42902);
  });

  it('requires captcha only when risk is triggered and accepts captcha token', async () => {
    const ip = '10.10.10.10';

    for (let i = 0; i < 6; i += 1) {
      const phone = `1390000000${i}`;
      const resp = await request(app.server)
        .post('/v1/auth/sms/send')
        .set('x-device-id', 'device-risk')
        .set('x-forwarded-for', ip)
        .send({ phone });
      expect(resp.status).toBe(200);
    }

    const targetPhone = '13900000009';
    const blocked = await request(app.server)
      .post('/v1/auth/sms/send')
      .set('x-device-id', 'device-risk')
      .set('x-forwarded-for', ip)
      .send({ phone: targetPhone });

    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe(40331);
    const captchaId = blocked.body.details.captcha_id as string;
    const prompt = blocked.body.details.captcha_prompt as string;
    const [, a, b] = prompt.match(/(\d+)\+(\d+)=\?/)!;
    const answer = String(Number(a) + Number(b));

    const captcha = await request(app.server)
      .post('/v1/auth/captcha/verify')
      .set('x-device-id', 'device-risk')
      .set('x-forwarded-for', ip)
      .send({ phone: targetPhone, captcha_id: captchaId, answer });
    expect(captcha.status).toBe(200);

    const afterCaptcha = await request(app.server)
      .post('/v1/auth/sms/send')
      .set('x-device-id', 'device-risk')
      .set('x-forwarded-for', ip)
      .send({ phone: targetPhone, captcha_token: captcha.body.data.captcha_token });
    expect(afterCaptcha.status).toBe(200);
  });

  it('locks password login after repeated failures', async () => {
    const phone = '13800000008';

    const send = await request(app.server).post('/v1/auth/sms/send').send({ phone });
    const code = send.body.data.debugCode as string;

    const verify = await request(app.server).post('/v1/auth/sms/verify').send({ phone, code });
    const token = verify.body.data.session_token as string;

    const setPwd = await request(app.server)
      .post('/v1/auth/password/set')
      .set('authorization', `Bearer ${token}`)
      .send({ password: 'safe@123' });
    expect(setPwd.status).toBe(200);

    for (let i = 0; i < 5; i += 1) {
      const badLogin = await request(app.server)
        .post('/v1/auth/password/login')
        .send({ phone, password: 'wrong' });
      expect(badLogin.status).toBe(401);
    }

    const locked = await request(app.server)
      .post('/v1/auth/password/login')
      .send({ phone, password: 'safe@123' });
    expect(locked.status).toBe(423);
    expect(locked.body.code).toBe(42311);
    expect(locked.body.details.retry_after_sec).toBeGreaterThan(0);
    expect(typeof locked.body.details.locked_until).toBe('string');
  });
});
