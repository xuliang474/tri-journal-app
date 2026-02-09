import { Pool } from 'pg';
import type {
  AuthAttempt,
  AuthRiskEvent,
  CaptchaChallenge,
  CaptchaToken,
  Entitlement,
  JournalEntry,
  LabeledSpan,
  PasswordFailureRecord,
  ReflectionCard,
  ReminderSettings,
  Session,
  SmsCodeRecord,
  User
} from './types';

export type StoreKind = 'memory' | 'postgres';

export interface AuthAttemptFilter {
  kind?: AuthAttempt['kind'];
  phone?: string;
  ip?: string;
  deviceId?: string;
  success?: boolean;
  since: number;
}

export interface DataStore {
  init(): Promise<void>;
  close(): Promise<void>;

  getSmsCode(phone: string): Promise<SmsCodeRecord | undefined>;
  upsertSmsCode(record: SmsCodeRecord): Promise<void>;

  getUserByPhone(phone: string): Promise<User | undefined>;
  getUserById(userId: string): Promise<User | undefined>;
  createUser(user: User): Promise<void>;
  updateUserPassword(userId: string, passwordHash: string): Promise<void>;

  createSession(session: Session): Promise<void>;
  getSession(token: string): Promise<Session | undefined>;

  upsertCaptcha(challenge: CaptchaChallenge): Promise<void>;
  getCaptcha(captchaId: string): Promise<CaptchaChallenge | undefined>;

  upsertCaptchaToken(token: CaptchaToken): Promise<void>;
  getCaptchaToken(token: string): Promise<CaptchaToken | undefined>;

  getPasswordFailure(phone: string): Promise<PasswordFailureRecord | undefined>;
  upsertPasswordFailure(phone: string, record: PasswordFailureRecord): Promise<void>;
  deletePasswordFailure(phone: string): Promise<void>;

  addAuthAttempt(attempt: AuthAttempt): Promise<void>;
  listAuthAttempts(filter: AuthAttemptFilter): Promise<AuthAttempt[]>;
  addAuthRiskEvent(event: AuthRiskEvent): Promise<void>;

  createJournal(entry: JournalEntry): Promise<void>;
  getJournal(entryId: string): Promise<JournalEntry | undefined>;
  listJournalsByUserAndDateRange(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<JournalEntry[]>;

  replaceSpans(entryId: string, spans: LabeledSpan[]): Promise<void>;
  getSpans(entryId: string): Promise<LabeledSpan[]>;

  upsertReflection(card: ReflectionCard): Promise<void>;
  getReflection(entryId: string): Promise<ReflectionCard | undefined>;
  getReflectionsByEntryIds(entryIds: string[]): Promise<Map<string, ReflectionCard>>;

  getReminder(userId: string): Promise<ReminderSettings | undefined>;
  upsertReminder(settings: ReminderSettings): Promise<void>;

  getEntitlement(userId: string): Promise<Entitlement | undefined>;
  upsertEntitlement(entitlement: Entitlement): Promise<void>;
}

export class InMemoryStore implements DataStore {
  usersById = new Map<string, User>();
  userIdByPhone = new Map<string, string>();
  sessions = new Map<string, Session>();

  smsCodes = new Map<string, SmsCodeRecord>();
  captchas = new Map<string, CaptchaChallenge>();
  captchaTokens = new Map<string, CaptchaToken>();
  passwordFailures = new Map<string, PasswordFailureRecord>();

  journals = new Map<string, JournalEntry>();
  spansByEntryId = new Map<string, LabeledSpan[]>();
  reflectionsByEntryId = new Map<string, ReflectionCard>();

  remindersByUser = new Map<string, ReminderSettings>();
  entitlementsByUser = new Map<string, Entitlement>();

  authRiskEvents: AuthRiskEvent[] = [];
  authAttempts: AuthAttempt[] = [];

  async init(): Promise<void> {}

  async close(): Promise<void> {}

  async getSmsCode(phone: string): Promise<SmsCodeRecord | undefined> {
    return this.smsCodes.get(phone);
  }

  async upsertSmsCode(record: SmsCodeRecord): Promise<void> {
    this.smsCodes.set(record.phone, record);
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    const userId = this.userIdByPhone.get(phone);
    return userId ? this.usersById.get(userId) : undefined;
  }

  async getUserById(userId: string): Promise<User | undefined> {
    return this.usersById.get(userId);
  }

  async createUser(user: User): Promise<void> {
    this.usersById.set(user.id, user);
    this.userIdByPhone.set(user.phone, user.id);
  }

  async updateUserPassword(userId: string, passwordHash: string): Promise<void> {
    const user = this.usersById.get(userId);
    if (!user) {
      return;
    }
    user.passwordHash = passwordHash;
    this.usersById.set(user.id, user);
  }

  async createSession(session: Session): Promise<void> {
    this.sessions.set(session.token, session);
  }

  async getSession(token: string): Promise<Session | undefined> {
    return this.sessions.get(token);
  }

  async upsertCaptcha(challenge: CaptchaChallenge): Promise<void> {
    this.captchas.set(challenge.id, challenge);
  }

  async getCaptcha(captchaId: string): Promise<CaptchaChallenge | undefined> {
    return this.captchas.get(captchaId);
  }

  async upsertCaptchaToken(token: CaptchaToken): Promise<void> {
    this.captchaTokens.set(token.token, token);
  }

  async getCaptchaToken(token: string): Promise<CaptchaToken | undefined> {
    return this.captchaTokens.get(token);
  }

  async getPasswordFailure(phone: string): Promise<PasswordFailureRecord | undefined> {
    return this.passwordFailures.get(phone);
  }

  async upsertPasswordFailure(phone: string, record: PasswordFailureRecord): Promise<void> {
    this.passwordFailures.set(phone, record);
  }

  async deletePasswordFailure(phone: string): Promise<void> {
    this.passwordFailures.delete(phone);
  }

  async addAuthAttempt(attempt: AuthAttempt): Promise<void> {
    this.authAttempts.push(attempt);
  }

  async listAuthAttempts(filter: AuthAttemptFilter): Promise<AuthAttempt[]> {
    return this.authAttempts.filter((item) => {
      if (item.timestamp <= filter.since) {
        return false;
      }
      if (filter.kind && item.kind !== filter.kind) {
        return false;
      }
      if (filter.phone && item.phone !== filter.phone) {
        return false;
      }
      if (filter.ip && item.ip !== filter.ip) {
        return false;
      }
      if (filter.deviceId && item.deviceId !== filter.deviceId) {
        return false;
      }
      if (typeof filter.success === 'boolean' && item.success !== filter.success) {
        return false;
      }
      return true;
    });
  }

  async addAuthRiskEvent(event: AuthRiskEvent): Promise<void> {
    this.authRiskEvents.push(event);
  }

  async createJournal(entry: JournalEntry): Promise<void> {
    this.journals.set(entry.id, entry);
  }

  async getJournal(entryId: string): Promise<JournalEntry | undefined> {
    return this.journals.get(entryId);
  }

  async listJournalsByUserAndDateRange(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<JournalEntry[]> {
    return [...this.journals.values()].filter((entry) => {
      if (entry.userId !== userId) {
        return false;
      }
      const date = entry.createdAt.slice(0, 10);
      return date >= startDate && date <= endDate;
    });
  }

  async replaceSpans(entryId: string, spans: LabeledSpan[]): Promise<void> {
    this.spansByEntryId.set(entryId, spans);
  }

  async getSpans(entryId: string): Promise<LabeledSpan[]> {
    return this.spansByEntryId.get(entryId) ?? [];
  }

  async upsertReflection(card: ReflectionCard): Promise<void> {
    this.reflectionsByEntryId.set(card.entryId, card);
  }

  async getReflection(entryId: string): Promise<ReflectionCard | undefined> {
    return this.reflectionsByEntryId.get(entryId);
  }

  async getReflectionsByEntryIds(entryIds: string[]): Promise<Map<string, ReflectionCard>> {
    const result = new Map<string, ReflectionCard>();
    entryIds.forEach((entryId) => {
      const card = this.reflectionsByEntryId.get(entryId);
      if (card) {
        result.set(entryId, card);
      }
    });
    return result;
  }

  async getReminder(userId: string): Promise<ReminderSettings | undefined> {
    return this.remindersByUser.get(userId);
  }

  async upsertReminder(settings: ReminderSettings): Promise<void> {
    this.remindersByUser.set(settings.userId, settings);
  }

  async getEntitlement(userId: string): Promise<Entitlement | undefined> {
    return this.entitlementsByUser.get(userId);
  }

  async upsertEntitlement(entitlement: Entitlement): Promise<void> {
    this.entitlementsByUser.set(entitlement.userId, entitlement);
  }
}

function parseJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export class PostgresStore implements DataStore {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        phone TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sms_codes (
        phone TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        expires_at BIGINT NOT NULL,
        last_sent_at BIGINT NOT NULL,
        daily_date TEXT NOT NULL,
        daily_count INT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS captchas (
        id TEXT PRIMARY KEY,
        answer TEXT NOT NULL,
        prompt TEXT NOT NULL,
        expires_at BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS captcha_tokens (
        token TEXT PRIMARY KEY,
        phone TEXT NOT NULL,
        ip TEXT NOT NULL,
        device_id TEXT NOT NULL,
        expires_at BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS password_failures (
        phone TEXT PRIMARY KEY,
        count INT NOT NULL,
        first_failure_at BIGINT NOT NULL,
        locked_until BIGINT
      );

      CREATE TABLE IF NOT EXISTS auth_attempts (
        id BIGSERIAL PRIMARY KEY,
        phone TEXT NOT NULL,
        ip TEXT NOT NULL,
        device_id TEXT NOT NULL,
        success BOOLEAN NOT NULL,
        kind TEXT NOT NULL,
        timestamp BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_auth_attempts_filter ON auth_attempts(kind, phone, ip, device_id, timestamp);

      CREATE TABLE IF NOT EXISTS auth_risk_events (
        id BIGSERIAL PRIMARY KEY,
        phone_hash TEXT NOT NULL,
        ip_hash TEXT NOT NULL,
        device_hash TEXT NOT NULL,
        trigger_reason TEXT NOT NULL,
        action TEXT NOT NULL,
        timestamp BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS journals (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        mode TEXT NOT NULL,
        source TEXT NOT NULL,
        raw_text TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_journals_user_created_at ON journals(user_id, created_at);

      CREATE TABLE IF NOT EXISTS journal_spans (
        entry_id TEXT NOT NULL REFERENCES journals(id) ON DELETE CASCADE,
        start_idx INT NOT NULL,
        end_idx INT NOT NULL,
        label TEXT NOT NULL,
        confidence REAL NOT NULL,
        edited_by_user BOOLEAN NOT NULL,
        version INT NOT NULL,
        PRIMARY KEY(entry_id, start_idx, end_idx, label, version)
      );

      CREATE TABLE IF NOT EXISTS reflections (
        entry_id TEXT PRIMARY KEY REFERENCES journals(id) ON DELETE CASCADE,
        thought_ratio REAL NOT NULL,
        emotion_ratio REAL NOT NULL,
        body_ratio REAL NOT NULL,
        prompts JSONB NOT NULL,
        risk_level TEXT NOT NULL,
        risk_flags JSONB NOT NULL
      );

      CREATE TABLE IF NOT EXISTS reminders (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        enabled BOOLEAN NOT NULL,
        time TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS entitlements (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        base_access BOOLEAN NOT NULL,
        premium_active BOOLEAN NOT NULL,
        premium_expire_at TIMESTAMPTZ
      );
    `);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async getSmsCode(phone: string): Promise<SmsCodeRecord | undefined> {
    const { rows } = await this.pool.query('SELECT * FROM sms_codes WHERE phone = $1', [phone]);
    const row = rows[0];
    if (!row) {
      return undefined;
    }
    return {
      phone: row.phone,
      code: row.code,
      expiresAt: Number(row.expires_at),
      lastSentAt: Number(row.last_sent_at),
      dailyDate: row.daily_date,
      dailyCount: Number(row.daily_count)
    };
  }

  async upsertSmsCode(record: SmsCodeRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO sms_codes(phone, code, expires_at, last_sent_at, daily_date, daily_count)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (phone)
       DO UPDATE SET code = EXCLUDED.code,
                     expires_at = EXCLUDED.expires_at,
                     last_sent_at = EXCLUDED.last_sent_at,
                     daily_date = EXCLUDED.daily_date,
                     daily_count = EXCLUDED.daily_count`,
      [
        record.phone,
        record.code,
        record.expiresAt,
        record.lastSentAt,
        record.dailyDate,
        record.dailyCount
      ]
    );
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    const { rows } = await this.pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    const row = rows[0];
    if (!row) {
      return undefined;
    }
    return {
      id: row.id,
      phone: row.phone,
      passwordHash: row.password_hash ?? undefined,
      createdAt: row.created_at.toISOString()
    };
  }

  async getUserById(userId: string): Promise<User | undefined> {
    const { rows } = await this.pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    const row = rows[0];
    if (!row) {
      return undefined;
    }
    return {
      id: row.id,
      phone: row.phone,
      passwordHash: row.password_hash ?? undefined,
      createdAt: row.created_at.toISOString()
    };
  }

  async createUser(user: User): Promise<void> {
    await this.pool.query(
      'INSERT INTO users(id, phone, password_hash, created_at) VALUES ($1,$2,$3,$4)',
      [user.id, user.phone, user.passwordHash ?? null, user.createdAt]
    );
  }

  async updateUserPassword(userId: string, passwordHash: string): Promise<void> {
    await this.pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [
      userId,
      passwordHash
    ]);
  }

  async createSession(session: Session): Promise<void> {
    await this.pool.query('INSERT INTO sessions(token, user_id, created_at) VALUES ($1,$2,$3)', [
      session.token,
      session.userId,
      session.createdAt
    ]);
  }

  async getSession(token: string): Promise<Session | undefined> {
    const { rows } = await this.pool.query('SELECT * FROM sessions WHERE token = $1', [token]);
    const row = rows[0];
    if (!row) {
      return undefined;
    }
    return {
      token: row.token,
      userId: row.user_id,
      createdAt: row.created_at.toISOString()
    };
  }

  async upsertCaptcha(challenge: CaptchaChallenge): Promise<void> {
    await this.pool.query(
      `INSERT INTO captchas(id, answer, prompt, expires_at)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (id)
       DO UPDATE SET answer = EXCLUDED.answer,
                     prompt = EXCLUDED.prompt,
                     expires_at = EXCLUDED.expires_at`,
      [challenge.id, challenge.answer, challenge.prompt, challenge.expiresAt]
    );
  }

  async getCaptcha(captchaId: string): Promise<CaptchaChallenge | undefined> {
    const { rows } = await this.pool.query('SELECT * FROM captchas WHERE id = $1', [captchaId]);
    const row = rows[0];
    if (!row) {
      return undefined;
    }
    return {
      id: row.id,
      answer: row.answer,
      prompt: row.prompt,
      expiresAt: Number(row.expires_at)
    };
  }

  async upsertCaptchaToken(token: CaptchaToken): Promise<void> {
    await this.pool.query(
      `INSERT INTO captcha_tokens(token, phone, ip, device_id, expires_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (token)
       DO UPDATE SET phone = EXCLUDED.phone,
                     ip = EXCLUDED.ip,
                     device_id = EXCLUDED.device_id,
                     expires_at = EXCLUDED.expires_at`,
      [token.token, token.phone, token.ip, token.deviceId, token.expiresAt]
    );
  }

  async getCaptchaToken(token: string): Promise<CaptchaToken | undefined> {
    const { rows } = await this.pool.query('SELECT * FROM captcha_tokens WHERE token = $1', [
      token
    ]);
    const row = rows[0];
    if (!row) {
      return undefined;
    }
    return {
      token: row.token,
      phone: row.phone,
      ip: row.ip,
      deviceId: row.device_id,
      expiresAt: Number(row.expires_at)
    };
  }

  async getPasswordFailure(phone: string): Promise<PasswordFailureRecord | undefined> {
    const { rows } = await this.pool.query('SELECT * FROM password_failures WHERE phone = $1', [
      phone
    ]);
    const row = rows[0];
    if (!row) {
      return undefined;
    }
    return {
      count: Number(row.count),
      firstFailureAt: Number(row.first_failure_at),
      lockedUntil: row.locked_until ? Number(row.locked_until) : undefined
    };
  }

  async upsertPasswordFailure(phone: string, record: PasswordFailureRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO password_failures(phone, count, first_failure_at, locked_until)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (phone)
       DO UPDATE SET count = EXCLUDED.count,
                     first_failure_at = EXCLUDED.first_failure_at,
                     locked_until = EXCLUDED.locked_until`,
      [phone, record.count, record.firstFailureAt, record.lockedUntil ?? null]
    );
  }

  async deletePasswordFailure(phone: string): Promise<void> {
    await this.pool.query('DELETE FROM password_failures WHERE phone = $1', [phone]);
  }

  async addAuthAttempt(attempt: AuthAttempt): Promise<void> {
    await this.pool.query(
      'INSERT INTO auth_attempts(phone, ip, device_id, success, kind, timestamp) VALUES ($1,$2,$3,$4,$5,$6)',
      [
        attempt.phone,
        attempt.ip,
        attempt.deviceId,
        attempt.success,
        attempt.kind,
        attempt.timestamp
      ]
    );
  }

  async listAuthAttempts(filter: AuthAttemptFilter): Promise<AuthAttempt[]> {
    const where: string[] = ['timestamp > $1'];
    const values: Array<string | number | boolean> = [filter.since];

    if (filter.kind) {
      values.push(filter.kind);
      where.push(`kind = $${values.length}`);
    }
    if (filter.phone) {
      values.push(filter.phone);
      where.push(`phone = $${values.length}`);
    }
    if (filter.ip) {
      values.push(filter.ip);
      where.push(`ip = $${values.length}`);
    }
    if (filter.deviceId) {
      values.push(filter.deviceId);
      where.push(`device_id = $${values.length}`);
    }
    if (typeof filter.success === 'boolean') {
      values.push(filter.success);
      where.push(`success = $${values.length}`);
    }

    const sql = `SELECT phone, ip, device_id, success, kind, timestamp FROM auth_attempts WHERE ${where.join(' AND ')}`;
    const { rows } = await this.pool.query(sql, values);
    return rows.map((row) => ({
      phone: row.phone,
      ip: row.ip,
      deviceId: row.device_id,
      success: row.success,
      kind: row.kind,
      timestamp: Number(row.timestamp)
    }));
  }

  async addAuthRiskEvent(event: AuthRiskEvent): Promise<void> {
    await this.pool.query(
      'INSERT INTO auth_risk_events(phone_hash, ip_hash, device_hash, trigger_reason, action, timestamp) VALUES ($1,$2,$3,$4,$5,$6)',
      [
        event.phoneHash,
        event.ipHash,
        event.deviceHash,
        event.triggerReason,
        event.action,
        event.timestamp
      ]
    );
  }

  async createJournal(entry: JournalEntry): Promise<void> {
    await this.pool.query(
      'INSERT INTO journals(id, user_id, mode, source, raw_text, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
      [entry.id, entry.userId, entry.mode, entry.source, entry.rawText, entry.createdAt]
    );
  }

  async getJournal(entryId: string): Promise<JournalEntry | undefined> {
    const { rows } = await this.pool.query('SELECT * FROM journals WHERE id = $1', [entryId]);
    const row = rows[0];
    if (!row) {
      return undefined;
    }
    return {
      id: row.id,
      userId: row.user_id,
      mode: row.mode,
      source: row.source,
      rawText: row.raw_text,
      createdAt: row.created_at.toISOString()
    };
  }

  async listJournalsByUserAndDateRange(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<JournalEntry[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM journals
       WHERE user_id = $1
         AND created_at::date >= $2::date
         AND created_at::date <= $3::date
       ORDER BY created_at ASC`,
      [userId, startDate, endDate]
    );
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      mode: row.mode,
      source: row.source,
      rawText: row.raw_text,
      createdAt: row.created_at.toISOString()
    }));
  }

  async replaceSpans(entryId: string, spans: LabeledSpan[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM journal_spans WHERE entry_id = $1', [entryId]);
      for (const span of spans) {
        await client.query(
          `INSERT INTO journal_spans(entry_id, start_idx, end_idx, label, confidence, edited_by_user, version)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            entryId,
            span.start,
            span.end,
            span.label,
            span.confidence,
            span.editedByUser,
            span.version
          ]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getSpans(entryId: string): Promise<LabeledSpan[]> {
    const { rows } = await this.pool.query(
      'SELECT entry_id, start_idx, end_idx, label, confidence, edited_by_user, version FROM journal_spans WHERE entry_id = $1 ORDER BY start_idx ASC',
      [entryId]
    );
    return rows.map((row) => ({
      entryId: row.entry_id,
      start: Number(row.start_idx),
      end: Number(row.end_idx),
      label: row.label,
      confidence: Number(row.confidence),
      editedByUser: row.edited_by_user,
      version: Number(row.version)
    }));
  }

  async upsertReflection(card: ReflectionCard): Promise<void> {
    await this.pool.query(
      `INSERT INTO reflections(entry_id, thought_ratio, emotion_ratio, body_ratio, prompts, risk_level, risk_flags)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb)
       ON CONFLICT (entry_id)
       DO UPDATE SET thought_ratio = EXCLUDED.thought_ratio,
                     emotion_ratio = EXCLUDED.emotion_ratio,
                     body_ratio = EXCLUDED.body_ratio,
                     prompts = EXCLUDED.prompts,
                     risk_level = EXCLUDED.risk_level,
                     risk_flags = EXCLUDED.risk_flags`,
      [
        card.entryId,
        card.thoughtRatio,
        card.emotionRatio,
        card.bodyRatio,
        JSON.stringify(card.prompts),
        card.riskLevel,
        JSON.stringify(card.riskFlags)
      ]
    );
  }

  async getReflection(entryId: string): Promise<ReflectionCard | undefined> {
    const { rows } = await this.pool.query('SELECT * FROM reflections WHERE entry_id = $1', [
      entryId
    ]);
    const row = rows[0];
    if (!row) {
      return undefined;
    }
    return {
      entryId: row.entry_id,
      thoughtRatio: Number(row.thought_ratio),
      emotionRatio: Number(row.emotion_ratio),
      bodyRatio: Number(row.body_ratio),
      prompts: parseJsonArray<string>(row.prompts),
      riskLevel: row.risk_level,
      riskFlags: parseJsonArray<string>(row.risk_flags)
    };
  }

  async getReflectionsByEntryIds(entryIds: string[]): Promise<Map<string, ReflectionCard>> {
    const result = new Map<string, ReflectionCard>();
    if (entryIds.length === 0) {
      return result;
    }
    const { rows } = await this.pool.query('SELECT * FROM reflections WHERE entry_id = ANY($1)', [
      entryIds
    ]);
    rows.forEach((row) => {
      result.set(row.entry_id, {
        entryId: row.entry_id,
        thoughtRatio: Number(row.thought_ratio),
        emotionRatio: Number(row.emotion_ratio),
        bodyRatio: Number(row.body_ratio),
        prompts: parseJsonArray<string>(row.prompts),
        riskLevel: row.risk_level,
        riskFlags: parseJsonArray<string>(row.risk_flags)
      });
    });
    return result;
  }

  async getReminder(userId: string): Promise<ReminderSettings | undefined> {
    const { rows } = await this.pool.query('SELECT * FROM reminders WHERE user_id = $1', [userId]);
    const row = rows[0];
    if (!row) {
      return undefined;
    }
    return {
      userId: row.user_id,
      enabled: row.enabled,
      time: row.time
    };
  }

  async upsertReminder(settings: ReminderSettings): Promise<void> {
    await this.pool.query(
      `INSERT INTO reminders(user_id, enabled, time)
       VALUES ($1,$2,$3)
       ON CONFLICT (user_id)
       DO UPDATE SET enabled = EXCLUDED.enabled,
                     time = EXCLUDED.time`,
      [settings.userId, settings.enabled, settings.time]
    );
  }

  async getEntitlement(userId: string): Promise<Entitlement | undefined> {
    const { rows } = await this.pool.query('SELECT * FROM entitlements WHERE user_id = $1', [
      userId
    ]);
    const row = rows[0];
    if (!row) {
      return undefined;
    }
    return {
      userId: row.user_id,
      baseAccess: row.base_access,
      premiumActive: row.premium_active,
      premiumExpireAt: row.premium_expire_at ? row.premium_expire_at.toISOString() : undefined
    };
  }

  async upsertEntitlement(entitlement: Entitlement): Promise<void> {
    await this.pool.query(
      `INSERT INTO entitlements(user_id, base_access, premium_active, premium_expire_at)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id)
       DO UPDATE SET base_access = EXCLUDED.base_access,
                     premium_active = EXCLUDED.premium_active,
                     premium_expire_at = EXCLUDED.premium_expire_at`,
      [
        entitlement.userId,
        entitlement.baseAccess,
        entitlement.premiumActive,
        entitlement.premiumExpireAt ?? null
      ]
    );
  }
}

export function createStore(params: { kind: StoreKind; databaseUrl?: string }): DataStore {
  if (params.kind === 'memory') {
    return new InMemoryStore();
  }
  if (!params.databaseUrl) {
    throw new Error('DATABASE_URL is required when using postgres store');
  }
  return new PostgresStore(params.databaseUrl);
}
