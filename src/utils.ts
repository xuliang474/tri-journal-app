import crypto from 'node:crypto';

export function now(): number {
  return Date.now();
}

export function toIso(ts: number): string {
  return new Date(ts).toISOString();
}

export function dateKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export function isChinaMainlandPhone(phone: string): boolean {
  return /^1[3-9]\d{9}$/.test(phone);
}

export function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export function randomDigits(length: number): string {
  const max = 10 ** length;
  return String(Math.floor(Math.random() * max)).padStart(length, '0');
}

export function randomToken(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}_${crypto.randomBytes(8).toString('hex')}`;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) {
    return false;
  }
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(candidate, 'hex');
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

export function getWeekStart(inputDate: string): string {
  const date = new Date(`${inputDate}T00:00:00.000Z`);
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function withinDateRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}
