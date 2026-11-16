import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';

import { Invoice } from '../entities/invoice.entity';
import { InvoiceSettings } from '../entities/invoice-settings.entity';
import { resolveGstState } from '../gst-states';
import { financialYear, formatInvoiceNumber, validateInvoiceNumber } from '../invoice-number';
import { InvoiceTrigger } from '../types';

export type UpdateInvoiceSettingsInput = Partial<
    Omit<InvoiceSettings, 'id' | 'createdAt' | 'updatedAt' | 'channelId' | 'invoiceSequenceYear' | 'creditNoteSequenceYear'>
>;

const TRIGGERS: InvoiceTrigger[] = ['PAYMENT_SETTLED', 'SHIPPED', 'DELIVERED', 'MANUAL'];

@Injectable()
export class InvoiceSettingsService {
    constructor(private connection: TransactionalConnection) {}

    async get(ctx: RequestContext): Promise<InvoiceSettings> {
        const repo = this.connection.getRepository(ctx, InvoiceSettings);
        const existing = await repo.findOne({ where: { channelId: String(ctx.channelId) } });
        if (existing) return existing;

        // First use: seed with sensible defaults; the admin fills in the seller.
        try {
            return await repo.save(
                new InvoiceSettings({
                    channelId: String(ctx.channelId),
                    sellerLegalName: 'PetsUpRight',
                    sellerTradeName: 'PetsUpRight',
                    logoUrl: process.env.EMAIL_LOGO_URL ?? '',
                }),
            );
        } catch {
            // Another request created it at the same time.
            return repo.findOneOrFail({ where: { channelId: String(ctx.channelId) } });
        }
    }

    /** The next number for each document type, as it would be issued now. */
    async preview(ctx: RequestContext, settings?: InvoiceSettings) {
        const s = settings ?? (await this.get(ctx));
        const now = new Date();
        const fy = financialYear(now);
        const next = (prefix: string, suffix: string, nextNumber: number, year: string | null) =>
            formatInvoiceNumber({
                prefix,
                suffix,
                padding: s.numberPadding,
                sequence: s.resetEachFinancialYear && year && year !== fy ? 1 : nextNumber,
                date: now,
            });
        const invoice = next(s.invoicePrefix, s.invoiceSuffix, s.invoiceNextNumber, s.invoiceSequenceYear);
        const creditNote = next(s.creditNotePrefix, s.creditNoteSuffix, s.creditNoteNextNumber, s.creditNoteSequenceYear);
        return {
            financialYear: fy,
            nextInvoiceNumber: invoice,
            nextCreditNoteNumber: creditNote,
            invoiceNumberError: validateInvoiceNumber(invoice),
            creditNoteNumberError: validateInvoiceNumber(creditNote),
        };
    }

    async update(ctx: RequestContext, input: UpdateInvoiceSettingsInput): Promise<InvoiceSettings> {
        const settings = await this.get(ctx);
        const clean: UpdateInvoiceSettingsInput = {};

        for (const [key, value] of Object.entries(input)) {
            if (value === undefined || value === null) continue;
            (clean as any)[key] = typeof value === 'string' ? value.trim() : value;
        }

        if (clean.issueOn && !TRIGGERS.includes(clean.issueOn)) {
            throw new UserInputError(`issueOn must be one of ${TRIGGERS.join(', ')}`);
        }
        for (const key of ['invoiceNextNumber', 'creditNoteNextNumber'] as const) {
            if (clean[key] !== undefined && (!Number.isInteger(clean[key]) || (clean[key] as number) < 1)) {
                throw new UserInputError('Next number must be a whole number of at least 1.');
            }
        }
        if (clean.numberPadding !== undefined && (clean.numberPadding < 1 || clean.numberPadding > 10)) {
            throw new UserInputError('Number padding must be between 1 and 10.');
        }
        if (clean.sellerGstin) {
            clean.sellerGstin = clean.sellerGstin.toUpperCase();
            if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(clean.sellerGstin)) {
                throw new UserInputError('GSTIN must be 15 characters, e.g. 24ABCDE1234F1Z5.');
            }
        }
        if (clean.sellerPan) {
            clean.sellerPan = clean.sellerPan.toUpperCase();
            if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(clean.sellerPan)) {
                throw new UserInputError('PAN must be 10 characters, e.g. ABCDE1234F.');
            }
        }
        if (clean.sellerState) {
            clean.sellerState = resolveGstState(clean.sellerState).name || clean.sellerState;
        }

        const merged = Object.assign(new InvoiceSettings(), settings, clean);

        // A changed counter applies to the current financial year.
        const fy = financialYear(new Date());
        if (clean.invoiceNextNumber !== undefined) merged.invoiceSequenceYear = fy;
        if (clean.creditNoteNextNumber !== undefined) merged.creditNoteSequenceYear = fy;

        const preview = await this.preview(ctx, merged);
        const problem = preview.invoiceNumberError ?? preview.creditNoteNumberError;
        if (problem) {
            throw new UserInputError(problem);
        }

        const invoiceRepo = this.connection.getRepository(ctx, Invoice);
        for (const number of [preview.nextInvoiceNumber, preview.nextCreditNoteNumber]) {
            const clash = await invoiceRepo.findOne({
                where: { channelId: String(ctx.channelId), invoiceNumber: number },
            });
            if (clash) {
                throw new UserInputError(
                    `${number} has already been issued (order ${clash.orderCode}). Choose a higher next number or a different prefix.`,
                );
            }
        }

        return this.connection.getRepository(ctx, InvoiceSettings).save(merged);
    }
}
