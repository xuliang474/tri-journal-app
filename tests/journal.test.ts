import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildServer } from '../src/server';

async function login(app: ReturnType<typeof buildServer>, phone: string): Promise<string> {
  const send = await request(app.server).post('/v1/auth/sms/send').send({ phone });
  const code = send.body.data.debugCode as string;
  const verify = await request(app.server).post('/v1/auth/sms/verify').send({ phone, code });
  return verify.body.data.session_token as string;
}

describe('journal behavior loop', () => {
  let app = buildServer({ storage: 'memory' });

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-09T10:00:00.000Z'));
    app = buildServer({ storage: 'memory' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.useRealTimers();
  });

  it('creates, analyzes, edits spans, and generates weekly report', async () => {
    const token = await login(app, '13800000011');

    const create = await request(app.server)
      .post('/v1/journals')
      .set('authorization', `Bearer ${token}`)
      .send({
        mode: 'guided',
        source: 'text',
        raw_text: '今天我一直在想工作压力，很焦虑，肩膀很紧绷。'
      });
    expect(create.status).toBe(200);
    const entryId = create.body.data.id as string;

    const analyze = await request(app.server)
      .post(`/v1/journals/${entryId}/analyze`)
      .set('authorization', `Bearer ${token}`)
      .send({});
    expect(analyze.status).toBe(200);
    expect(analyze.body.data.spans.length).toBeGreaterThan(0);
    expect(analyze.body.data.reflection).toBeTruthy();

    const patch = await request(app.server)
      .patch(`/v1/journals/${entryId}/spans`)
      .set('authorization', `Bearer ${token}`)
      .send({
        spans: [
          { start: 0, end: 8, label: 'thought' },
          { start: 8, end: 14, label: 'emotion' },
          { start: 14, end: 20, label: 'body' }
        ]
      });
    expect(patch.status).toBe(200);

    const reflection = await request(app.server)
      .get(`/v1/journals/${entryId}/reflection`)
      .set('authorization', `Bearer ${token}`);
    expect(reflection.status).toBe(200);
    expect(
      reflection.body.data.thoughtRatio +
        reflection.body.data.emotionRatio +
        reflection.body.data.bodyRatio
    ).toBeGreaterThan(0.99);

    const garden = await request(app.server)
      .get('/v1/calendar/garden')
      .set('authorization', `Bearer ${token}`)
      .query({ month: '2026-02' });
    expect(garden.status).toBe(200);
    expect(garden.body.data.days.some((d: { hasEntry: boolean }) => d.hasEntry)).toBe(true);

    const weekly = await request(app.server)
      .get('/v1/reports/weekly')
      .set('authorization', `Bearer ${token}`)
      .query({ week_start: '2026-02-09' });
    expect(weekly.status).toBe(200);
    expect(weekly.body.data.recurringTopics.length).toBeGreaterThan(0);
  });

  it('rejects invalid overlapping span patches with 42221', async () => {
    const token = await login(app, '13800000012');

    const create = await request(app.server)
      .post('/v1/journals')
      .set('authorization', `Bearer ${token}`)
      .send({ mode: 'free', source: 'text', raw_text: '我很累但是我还在想工作。' });
    const entryId = create.body.data.id as string;

    const invalid = await request(app.server)
      .patch(`/v1/journals/${entryId}/spans`)
      .set('authorization', `Bearer ${token}`)
      .send({
        spans: [
          { start: 0, end: 5, label: 'emotion' },
          { start: 4, end: 10, label: 'thought' }
        ]
      });

    expect(invalid.status).toBe(422);
    expect(invalid.body.code).toBe(42221);
  });
});
