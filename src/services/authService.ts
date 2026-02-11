import { AppError } from '../errors';
import type { DataStore } from '../store';
import type { User } from '../types';
import {
  dateKey,
  hashPassword,
  hashText,
  isChinaMainlandPhone,
  now,
  randomDigits,
  randomToken,
  toIso,
  verifyPassword
} from '../utils';

const SMS_TTL_MS = 5 * 60 * 1000;
const CAPTCHA_TTL_MS = 5 * 60 * 1000;
const CAPTCHA_TOKEN_TTL_MS = 5 * 60 * 1000;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const WEAK_PASSWORDS = new Set(['123456', '12345678', 'password', 'qwerty', '111111', '000000']);

export class AuthService {
  constructor(private readonly store: DataStore) {}

  async sendSms(params: {
    phone: string;
    ip: string;
    deviceId?: string;
    captchaToken?: string;
  }): Promise<{ expiresInSec: number; debugCode?: string }> {
    const { phone, ip } = params;
    const deviceId = params.deviceId || 'unknown';
    if (!isChinaMainlandPhone(phone)) {
      throw new AppError(400, 40001, '手机号格式不正确，仅支持中国大陆手机号');
    }

    const current = now();
    const sms = await this.store.getSmsCode(phone);
    if (sms) {
      if (current - sms.lastSentAt < 60_000) {
        throw new AppError(429, 42901, '发送过于频繁，请稍后再试');
      }
      const today = dateKey(current);
      if (sms.dailyDate === today && sms.dailyCount >= 10) {
        throw new AppError(429, 42902, '今日发送次数已达上限');
      }
    }

    const riskReasons = await this.riskReasons(phone, ip, deviceId, current);
    if (riskReasons.length > 0) {
      const verified = await this.checkCaptchaToken(
        params.captchaToken,
        phone,
        ip,
        deviceId,
        current
      );
      if (!verified) {
        const captcha = await this.createCaptcha();
        await this.store.addAuthRiskEvent({
          phoneHash: hashText(phone),
          ipHash: hashText(ip),
          deviceHash: hashText(deviceId),
          triggerReason: riskReasons.join(','),
          action: 'captcha',
          timestamp: current
        });
        throw new AppError(403, 40331, '需要完成图形验证码', {
          captcha_id: captcha.id,
          captcha_prompt: captcha.prompt
        });
      }
    }

    const code = randomDigits(6);
    const dailyDate = dateKey(current);
    const dailyCount = sms && sms.dailyDate === dailyDate ? sms.dailyCount + 1 : 1;
    await this.store.upsertSmsCode({
      phone,
      code,
      expiresAt: current + SMS_TTL_MS,
      lastSentAt: current,
      dailyDate,
      dailyCount
    });
    await this.store.addAuthAttempt({
      phone,
      ip,
      deviceId,
      success: true,
      kind: 'sms_send',
      timestamp: current
    });

    return {
      expiresInSec: SMS_TTL_MS / 1000,
      debugCode: process.env.NODE_ENV === 'production' ? undefined : code
    };
  }

  async verifySms(params: {
    phone: string;
    code: string;
    ip: string;
    deviceId?: string;
  }): Promise<{ user: User; sessionToken: string; hasPassword: boolean }> {
    const { phone, code, ip } = params;
    const deviceId = params.deviceId || 'unknown';
    const sms = await this.store.getSmsCode(phone);
    const current = now();

    if (!sms || sms.expiresAt < current || sms.code !== code) {
      await this.store.addAuthAttempt({
        phone,
        ip,
        deviceId,
        success: false,
        kind: 'sms_verify',
        timestamp: current
      });
      throw new AppError(401, 40101, '验证码错误或已过期');
    }

    await this.store.addAuthAttempt({
      phone,
      ip,
      deviceId,
      success: true,
      kind: 'sms_verify',
      timestamp: current
    });

    let user = await this.store.getUserByPhone(phone);
    if (!user) {
      user = {
        id: randomToken('usr'),
        phone,
        createdAt: toIso(current)
      };
      await this.store.createUser(user);
      await this.store.upsertReminder({ userId: user.id, enabled: true, time: '22:00' });
      await this.store.upsertEntitlement({
        userId: user.id,
        baseAccess: true,
        premiumActive: false
      });
    }

    const sessionToken = randomToken('sess');
    await this.store.createSession({
      token: sessionToken,
      userId: user.id,
      createdAt: toIso(current)
    });

    return {
      user,
      sessionToken,
      hasPassword: Boolean(user.passwordHash)
    };
  }

  async verifyCaptcha(params: {
    captchaId: string;
    answer: string;
    phone: string;
    ip: string;
    deviceId?: string;
  }): Promise<{ captchaToken: string; expiresInSec: number }> {
    const { captchaId, answer, phone, ip } = params;
    const deviceId = params.deviceId || 'unknown';
    const current = now();
    const challenge = await this.store.getCaptcha(captchaId);

    if (!challenge || challenge.expiresAt < current || challenge.answer !== answer.trim()) {
      throw new AppError(400, 40002, '图形验证码错误或已过期');
    }

    const token = randomToken('captcha');
    await this.store.upsertCaptchaToken({
      token,
      phone,
      ip,
      deviceId,
      expiresAt: current + CAPTCHA_TOKEN_TTL_MS
    });

    return {
      captchaToken: token,
      expiresInSec: CAPTCHA_TOKEN_TTL_MS / 1000
    };
  }

  async setPassword(userId: string, password: string): Promise<void> {
    this.validatePassword(password);
    const user = await this.store.getUserById(userId);
    if (!user) {
      throw new AppError(404, 40401, '用户不存在');
    }
    await this.store.updateUserPassword(user.id, hashPassword(password));
  }

  async loginWithPassword(params: {
    phone: string;
    password: string;
    ip: string;
    deviceId?: string;
  }): Promise<{ user: User; sessionToken: string }> {
    const { phone, password, ip } = params;
    const deviceId = params.deviceId || 'unknown';
    const current = now();

    await this.enforcePasswordLock(phone, current);
    const user = await this.store.getUserByPhone(phone);
    if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      await this.markPasswordFailure(phone, current);
      await this.store.addAuthAttempt({
        phone,
        ip,
        deviceId,
        success: false,
        kind: 'password_login',
        timestamp: current
      });
      throw new AppError(401, 40102, '手机号或密码错误');
    }

    await this.store.deletePasswordFailure(phone);
    await this.store.addAuthAttempt({
      phone,
      ip,
      deviceId,
      success: true,
      kind: 'password_login',
      timestamp: current
    });

    const sessionToken = randomToken('sess');
    await this.store.createSession({
      token: sessionToken,
      userId: user.id,
      createdAt: toIso(current)
    });

    return { user, sessionToken };
  }

  async resetPassword(params: { phone: string; code: string; newPassword: string }): Promise<void> {
    this.validatePassword(params.newPassword);
    const sms = await this.store.getSmsCode(params.phone);
    const current = now();
    if (!sms || sms.expiresAt < current || sms.code !== params.code) {
      throw new AppError(401, 40101, '验证码错误或已过期');
    }

    const user = await this.store.getUserByPhone(params.phone);
    if (!user) {
      throw new AppError(404, 40401, '用户不存在');
    }
    await this.store.updateUserPassword(user.id, hashPassword(params.newPassword));
    await this.store.deletePasswordFailure(params.phone);
  }

  async getUserBySessionToken(token?: string): Promise<User> {
    if (!token) {
      throw new AppError(401, 40103, '未登录或登录状态失效');
    }
    const session = await this.store.getSession(token);
    if (!session) {
      throw new AppError(401, 40103, '未登录或登录状态失效');
    }
    const user = await this.store.getUserById(session.userId);
    if (!user) {
      throw new AppError(401, 40103, '未登录或登录状态失效');
    }
    return user;
  }

  private async riskReasons(
    phone: string,
    ip: string,
    deviceId: string,
    current: number
  ): Promise<string[]> {
    const reasons: string[] = [];
    const tenMinutesAgo = current - 10 * 60 * 1000;

    const ipAttempts = await this.store.listAuthAttempts({
      kind: 'sms_send',
      ip,
      since: tenMinutesAgo
    });
    const ipUniquePhones = new Set(ipAttempts.map((item) => item.phone));
    if (ipAttempts.length >= 8 && ipUniquePhones.size >= 3) {
      reasons.push('ip_multi_phone_burst');
    }

    const deviceAttempts = await this.store.listAuthAttempts({
      kind: 'sms_send',
      deviceId,
      since: tenMinutesAgo
    });
    const deviceUniquePhones = new Set(deviceAttempts.map((item) => item.phone));
    if (deviceAttempts.length >= 6 && deviceUniquePhones.size >= 3) {
      reasons.push('device_multi_phone_burst');
    }

    const recentSmsFailures = await this.store.listAuthAttempts({
      kind: 'sms_verify',
      phone,
      success: false,
      since: current - 30 * 60 * 1000
    });
    if (recentSmsFailures.length >= 3) {
      reasons.push('phone_failed_verification');
    }

    return reasons;
  }

  private async createCaptcha(): Promise<{ id: string; prompt: string }> {
    const a = Math.floor(Math.random() * 9) + 1;
    const b = Math.floor(Math.random() * 9) + 1;
    const id = randomToken('capid');
    const prompt = `请输入算式结果：${a}+${b}=?`;
    await this.store.upsertCaptcha({
      id,
      answer: String(a + b),
      prompt,
      expiresAt: now() + CAPTCHA_TTL_MS
    });
    return { id, prompt };
  }

  private async checkCaptchaToken(
    captchaToken: string | undefined,
    phone: string,
    ip: string,
    deviceId: string,
    current: number
  ): Promise<boolean> {
    if (!captchaToken) {
      return false;
    }
    const token = await this.store.getCaptchaToken(captchaToken);
    if (!token || token.expiresAt < current) {
      return false;
    }
    return token.phone === phone && token.ip === ip && token.deviceId === deviceId;
  }

  private validatePassword(password: string): void {
    if (password.length < 6 || password.length > 20) {
      throw new AppError(400, 40003, '密码长度需为6-20位');
    }
    if (WEAK_PASSWORDS.has(password.toLowerCase())) {
      throw new AppError(400, 40004, '密码过于简单，请更换');
    }
  }

  private async markPasswordFailure(phone: string, current: number): Promise<void> {
    const record = await this.store.getPasswordFailure(phone);
    if (!record || current - record.firstFailureAt > LOCK_DURATION_MS) {
      await this.store.upsertPasswordFailure(phone, {
        count: 1,
        firstFailureAt: current
      });
      return;
    }

    const count = record.count + 1;
    await this.store.upsertPasswordFailure(phone, {
      ...record,
      count,
      lockedUntil: count >= 5 ? current + LOCK_DURATION_MS : record.lockedUntil
    });
  }

  private async enforcePasswordLock(phone: string, current: number): Promise<void> {
    const record = await this.store.getPasswordFailure(phone);
    if (!record || !record.lockedUntil) {
      return;
    }
    if (record.lockedUntil > current) {
      const retryAfterSec = Math.ceil((record.lockedUntil - current) / 1000);
      throw new AppError(423, 42311, '密码输入错误次数过多，请稍后再试', {
        retry_after_sec: retryAfterSec,
        locked_until: toIso(record.lockedUntil)
      });
    }
    await this.store.deletePasswordFailure(phone);
  }
}
