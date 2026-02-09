import Fastify from 'fastify';
import { z } from 'zod';
import { AppError } from './errors';
import { BillingService } from './services/billingService';
import { AiService } from './services/aiService';
import { AuthService } from './services/authService';
import { InsightService } from './services/insightService';
import { JournalService } from './services/journalService';
import { createStore, type StoreKind } from './store';

export interface BuildServerOptions {
  storage?: StoreKind;
  databaseUrl?: string;
}

function bearerToken(auth?: string): string | undefined {
  if (!auth) {
    return undefined;
  }
  const [type, token] = auth.split(' ');
  if (type !== 'Bearer') {
    return undefined;
  }
  return token;
}

function authContext(request: {
  headers: Record<string, string | string[] | undefined>;
  ip: string;
}) {
  const deviceId = String(request.headers['x-device-id'] ?? 'unknown');
  return {
    ip: request.ip || '0.0.0.0',
    deviceId
  };
}

const phoneSchema = z.string().regex(/^1[3-9]\d{9}$/);

export function buildServer(options: BuildServerOptions = {}) {
  const storage =
    options.storage ?? (process.env.STORAGE_DRIVER === 'memory' ? 'memory' : 'postgres');
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;

  const app = Fastify({ logger: false });
  const store = createStore({ kind: storage, databaseUrl });
  const aiService = new AiService();
  const authService = new AuthService(store);
  const journalService = new JournalService(store, aiService);
  const insightService = new InsightService(store);
  const billingService = new BillingService(store);

  app.addHook('onReady', async () => {
    await store.init();
  });

  app.addHook('onClose', async () => {
    await store.close();
  });

  const requireUser = async (request: {
    headers: Record<string, string | string[] | undefined>;
  }) => {
    const token = bearerToken(String(request.headers.authorization ?? ''));
    return authService.getUserBySessionToken(token);
  };

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      reply.status(error.status).send({
        code: error.code,
        message: error.message,
        details: error.details ?? null
      });
      return;
    }

    if (error instanceof z.ZodError) {
      reply.status(400).send({
        code: 40000,
        message: '请求参数错误',
        details: { issues: error.issues }
      });
      return;
    }

    reply.status(500).send({
      code: 50000,
      message: '服务器内部错误'
    });
  });

  app.post('/v1/auth/sms/send', async (request) => {
    const body = z
      .object({
        phone: phoneSchema,
        captcha_token: z.string().optional()
      })
      .parse(request.body);
    const ctx = authContext(request);
    const result = await authService.sendSms({
      phone: body.phone,
      ip: ctx.ip,
      deviceId: ctx.deviceId,
      captchaToken: body.captcha_token
    });
    return {
      code: 0,
      message: 'ok',
      data: result
    };
  });

  app.post('/v1/auth/sms/verify', async (request) => {
    const body = z
      .object({
        phone: phoneSchema,
        code: z.string().length(6)
      })
      .parse(request.body);
    const ctx = authContext(request);
    const result = await authService.verifySms({
      phone: body.phone,
      code: body.code,
      ip: ctx.ip,
      deviceId: ctx.deviceId
    });
    return {
      code: 0,
      message: 'ok',
      data: {
        user_id: result.user.id,
        phone: result.user.phone,
        has_password: result.hasPassword,
        session_token: result.sessionToken
      }
    };
  });

  app.post('/v1/auth/captcha/verify', async (request) => {
    const body = z
      .object({
        phone: phoneSchema,
        captcha_id: z.string().min(1),
        answer: z.string().min(1)
      })
      .parse(request.body);
    const ctx = authContext(request);
    const result = await authService.verifyCaptcha({
      phone: body.phone,
      captchaId: body.captcha_id,
      answer: body.answer,
      ip: ctx.ip,
      deviceId: ctx.deviceId
    });
    return {
      code: 0,
      message: 'ok',
      data: {
        captcha_token: result.captchaToken,
        expires_in_sec: result.expiresInSec
      }
    };
  });

  app.post('/v1/auth/password/set', async (request) => {
    const user = await requireUser(request);
    const body = z.object({ password: z.string().min(6).max(20) }).parse(request.body);
    await authService.setPassword(user.id, body.password);
    return { code: 0, message: 'ok' };
  });

  app.post('/v1/auth/password/login', async (request) => {
    const body = z
      .object({
        phone: phoneSchema,
        password: z.string().min(1)
      })
      .parse(request.body);
    const ctx = authContext(request);
    const result = await authService.loginWithPassword({
      phone: body.phone,
      password: body.password,
      ip: ctx.ip,
      deviceId: ctx.deviceId
    });
    return {
      code: 0,
      message: 'ok',
      data: {
        user_id: result.user.id,
        phone: result.user.phone,
        session_token: result.sessionToken
      }
    };
  });

  app.post('/v1/auth/password/reset', async (request) => {
    const body = z
      .object({
        phone: phoneSchema,
        code: z.string().length(6),
        new_password: z.string().min(6).max(20)
      })
      .parse(request.body);
    await authService.resetPassword({
      phone: body.phone,
      code: body.code,
      newPassword: body.new_password
    });
    return { code: 0, message: 'ok' };
  });

  app.post('/v1/journals', async (request) => {
    const user = await requireUser(request);
    const body = z
      .object({
        mode: z.enum(['free', 'guided']),
        source: z.enum(['text', 'voice']),
        raw_text: z.string().min(1)
      })
      .parse(request.body);
    const entry = await journalService.create(user.id, {
      mode: body.mode,
      source: body.source,
      rawText: body.raw_text
    });
    return { code: 0, message: 'ok', data: entry };
  });

  app.get('/v1/journals/:id', async (request) => {
    const user = await requireUser(request);
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const result = await journalService.getById(user.id, params.id);
    return { code: 0, message: 'ok', data: result };
  });

  app.post('/v1/journals/:id/analyze', async (request) => {
    const user = await requireUser(request);
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const result = await journalService.analyze(user.id, params.id);
    const safetyPrompt =
      result.reflection.riskLevel === 'high' || result.reflection.riskLevel === 'medium'
        ? {
            level: result.reflection.riskLevel,
            message: '你可能处于较强心理压力状态，如果需要，请尽快联系专业支持。',
            resources: ['全国心理援助热线：12356', '紧急情况请联系当地急救电话']
          }
        : null;
    return { code: 0, message: 'ok', data: { ...result, safety_prompt: safetyPrompt } };
  });

  app.patch('/v1/journals/:id/spans', async (request) => {
    const user = await requireUser(request);
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        spans: z.array(
          z.object({
            start: z.number().int(),
            end: z.number().int(),
            label: z.enum(['thought', 'emotion', 'body'])
          })
        )
      })
      .parse(request.body);
    const result = await journalService.patchSpans(user.id, params.id, body.spans);
    return { code: 0, message: 'ok', data: result };
  });

  app.get('/v1/journals/:id/reflection', async (request) => {
    const user = await requireUser(request);
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const result = await journalService.getReflection(user.id, params.id);
    return { code: 0, message: 'ok', data: result };
  });

  app.get('/v1/calendar/garden', async (request) => {
    const user = await requireUser(request);
    const query = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }).parse(request.query);
    const result = await insightService.getGarden(user.id, query.month);
    return { code: 0, message: 'ok', data: result };
  });

  app.get('/v1/reports/weekly', async (request) => {
    const user = await requireUser(request);
    const query = z
      .object({ week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
      .parse(request.query);
    const result = await insightService.getWeeklyInsight(user.id, query.week_start);
    return { code: 0, message: 'ok', data: result };
  });

  app.get('/v1/reminders/settings', async (request) => {
    const user = await requireUser(request);
    const settings = (await store.getReminder(user.id)) ?? {
      userId: user.id,
      enabled: true,
      time: '22:00'
    };
    await store.upsertReminder(settings);
    return { code: 0, message: 'ok', data: settings };
  });

  app.patch('/v1/reminders/settings', async (request) => {
    const user = await requireUser(request);
    const body = z
      .object({
        enabled: z.boolean().optional(),
        time: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
          .optional()
      })
      .parse(request.body);

    const current = (await store.getReminder(user.id)) ?? {
      userId: user.id,
      enabled: true,
      time: '22:00'
    };
    const next = {
      ...current,
      ...body
    };
    await store.upsertReminder(next);
    return { code: 0, message: 'ok', data: next };
  });

  app.post('/v1/billing/receipt/verify', async (request) => {
    const user = await requireUser(request);
    const body = z.object({ receipt_data: z.string().min(1) }).parse(request.body);
    const entitlement = await billingService.verifyReceipt(user.id, body.receipt_data);
    return { code: 0, message: 'ok', data: entitlement };
  });

  app.get('/v1/billing/entitlement', async (request) => {
    const user = await requireUser(request);
    const entitlement = await billingService.getEntitlement(user.id);
    return { code: 0, message: 'ok', data: entitlement };
  });

  return app;
}
