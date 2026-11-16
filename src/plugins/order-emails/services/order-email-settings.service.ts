import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';

import { OrderEmailSettings } from '../entities/order-email-settings.entity';

export type UpdateOrderEmailSettingsInput = Partial<
    Omit<OrderEmailSettings, 'id' | 'createdAt' | 'updatedAt' | 'channelId'>
>;

export const DEFAULT_ADMIN_EMAIL = 'orders.petsupright@gmail.com';

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** "a@x.com; b@y.com, a@x.com" -> ["a@x.com", "b@y.com"] */
export function parseEmailList(value: string | null | undefined): string[] {
    const seen = new Set<string>();
    return String(value ?? '')
        .split(/[,;\s]+/)
        .map(item => item.trim())
        .filter(item => item && !seen.has(item.toLowerCase()) && seen.add(item.toLowerCase()));
}

@Injectable()
export class OrderEmailSettingsService {
    constructor(private connection: TransactionalConnection) {}

    async get(ctx: RequestContext): Promise<OrderEmailSettings> {
        const repo = this.connection.getRepository(ctx, OrderEmailSettings);
        const existing = await repo.findOne({ where: { channelId: String(ctx.channelId) } });
        if (existing) return existing;
        try {
            return await repo.save(
                new OrderEmailSettings({
                    channelId: String(ctx.channelId),
                    // Keep honouring the old env variable if someone set it.
                    adminEmails: process.env.ORDERS_ADMIN_EMAIL?.trim() || DEFAULT_ADMIN_EMAIL,
                    supportEmail: DEFAULT_ADMIN_EMAIL,
                }),
            );
        } catch {
            return repo.findOneOrFail({ where: { channelId: String(ctx.channelId) } });
        }
    }

    async update(ctx: RequestContext, input: UpdateOrderEmailSettingsInput): Promise<OrderEmailSettings> {
        const settings = await this.get(ctx);
        const changes: UpdateOrderEmailSettingsInput = {};
        for (const [key, value] of Object.entries(input)) {
            if (value === undefined || value === null) continue;
            (changes as any)[key] = typeof value === 'string' ? value.trim() : value;
        }

        if (changes.adminEmails !== undefined) {
            const list = parseEmailList(changes.adminEmails);
            const invalid = list.filter(item => !EMAIL.test(item));
            if (invalid.length) {
                throw new UserInputError(`Not a valid email address: ${invalid.join(', ')}`);
            }
            if (list.length > 10) {
                throw new UserInputError('Up to 10 admin email addresses are allowed.');
            }
            changes.adminEmails = list.join(', ');
        }
        if (changes.supportEmail && !EMAIL.test(changes.supportEmail)) {
            throw new UserInputError(`Not a valid email address: ${changes.supportEmail}`);
        }

        Object.assign(settings, changes);
        return this.connection.getRepository(ctx, OrderEmailSettings).save(settings);
    }
}
