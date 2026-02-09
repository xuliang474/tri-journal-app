export type Label = 'thought' | 'emotion' | 'body';
export type EntryMode = 'free' | 'guided';
export type SourceType = 'text' | 'voice';

export interface User {
  id: string;
  phone: string;
  passwordHash?: string;
  createdAt: string;
}

export interface Session {
  token: string;
  userId: string;
  createdAt: string;
}

export interface SmsCodeRecord {
  phone: string;
  code: string;
  expiresAt: number;
  lastSentAt: number;
  dailyDate: string;
  dailyCount: number;
}

export interface CaptchaChallenge {
  id: string;
  answer: string;
  prompt: string;
  expiresAt: number;
}

export interface CaptchaToken {
  token: string;
  phone: string;
  ip: string;
  deviceId: string;
  expiresAt: number;
}

export interface PasswordFailureRecord {
  count: number;
  firstFailureAt: number;
  lockedUntil?: number;
}

export interface JournalEntry {
  id: string;
  userId: string;
  mode: EntryMode;
  source: SourceType;
  rawText: string;
  createdAt: string;
}

export interface LabeledSpan {
  entryId: string;
  start: number;
  end: number;
  label: Label;
  confidence: number;
  editedByUser: boolean;
  version: number;
}

export interface ReflectionCard {
  entryId: string;
  thoughtRatio: number;
  emotionRatio: number;
  bodyRatio: number;
  prompts: string[];
  riskLevel: 'low' | 'medium' | 'high';
  riskFlags: string[];
}

export interface ReminderSettings {
  userId: string;
  enabled: boolean;
  time: string;
}

export interface Entitlement {
  userId: string;
  baseAccess: boolean;
  premiumActive: boolean;
  premiumExpireAt?: string;
}

export interface WeeklyInsight {
  userId: string;
  weekStart: string;
  ratios: {
    thought: number;
    emotion: number;
    body: number;
  };
  recurringTopics: Array<{ topic: string; count: number }>;
  question: string;
  generatedAt: string;
}

export interface GardenDay {
  date: string;
  hasEntry: boolean;
  dominantLabel: Label | null;
  ratioSnapshot?: {
    thought: number;
    emotion: number;
    body: number;
  };
}

export interface AuthRiskEvent {
  phoneHash: string;
  ipHash: string;
  deviceHash: string;
  triggerReason: string;
  action: 'captcha' | 'block';
  timestamp: number;
}

export interface AuthAttempt {
  phone: string;
  ip: string;
  deviceId: string;
  success: boolean;
  kind: 'sms_send' | 'sms_verify' | 'password_login';
  timestamp: number;
}
