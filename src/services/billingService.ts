import { AppError } from '../errors';
import type { DataStore } from '../store';
import type { Entitlement } from '../types';

export class BillingService {
  constructor(private readonly store: DataStore) {}

  async verifyReceipt(userId: string, receiptData: string): Promise<Entitlement> {
    if (!receiptData || receiptData.trim().length < 6) {
      throw new AppError(400, 40010, 'receipt_data 无效');
    }

    const current = await this.getEntitlement(userId);
    const expire = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const next: Entitlement = {
      ...current,
      premiumActive: true,
      premiumExpireAt: expire
    };
    await this.store.upsertEntitlement(next);
    return next;
  }

  async getEntitlement(userId: string): Promise<Entitlement> {
    const current = await this.store.getEntitlement(userId);
    if (current) {
      return current;
    }
    const fallback: Entitlement = {
      userId,
      baseAccess: true,
      premiumActive: false
    };
    await this.store.upsertEntitlement(fallback);
    return fallback;
  }
}
