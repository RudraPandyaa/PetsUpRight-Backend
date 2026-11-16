import { Injectable } from '@nestjs/common';
import {
    EntityNotFoundError,
    EventBus,
    ID,
    Logger,
    Order,
    OrderService,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { Brackets } from 'typeorm';

import { amountInWords } from '../amount-in-words';
import { loggerCtx } from '../constants';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceSettings } from '../entities/invoice-settings.entity';
import { InvoiceIssuedEvent } from '../events/invoice-issued.event';
import { isSameState, resolveGstState } from '../gst-states';
import { financialYear, formatInvoiceNumber, validateInvoiceNumber } from '../invoice-number';
import {
    InvoiceLineSnapshot,
    InvoiceParty,
    InvoiceSnapshot,
    InvoiceTaxRow,
    InvoiceType,
} from '../types';
import { InvoiceSettingsService } from './invoice-settings.service';

/** Orders in these states can be invoiced. */
const INVOICEABLE_STATES = [
    'PaymentSettled',
    'PartiallyShipped',
    'Shipped',
    'PartiallyDelivered',
    'Delivered',
];

export interface InvoiceListOptions {
    skip?: number;
    take?: number;
    search?: string;
    type?: InvoiceType;
    orderId?: ID;
}

@Injectable()
export class InvoiceService {
    constructor(
        private connection: TransactionalConnection,
        private orderService: OrderService,
        private settingsService: InvoiceSettingsService,
        private eventBus: EventBus,
    ) {}

    async list(ctx: RequestContext, options: InvoiceListOptions = {}) {
        const qb = this.connection
            .getRepository(ctx, Invoice)
            .createQueryBuilder('invoice')
            .where('invoice.channelId = :channelId', { channelId: String(ctx.channelId) })
            .orderBy('invoice.issuedAt', 'DESC')
            .addOrderBy('invoice.id', 'DESC')
            .skip(Math.max(options.skip ?? 0, 0))
            .take(Math.min(Math.max(options.take ?? 25, 1), 100));

        if (options.type) {
            qb.andWhere('invoice.type = :type', { type: options.type });
        }
        if (options.orderId) {
            qb.andWhere('invoice.orderId = :orderId', { orderId: String(options.orderId) });
        }
        const search = options.search?.trim();
        if (search) {
            qb.andWhere(
                new Brackets(where => {
                    where
                        .where('LOWER(invoice.invoiceNumber) LIKE :term')
                        .orWhere('LOWER(invoice.orderCode) LIKE :term')
                        .orWhere('LOWER(invoice.customerName) LIKE :term')
                        .orWhere('LOWER(invoice.customerEmail) LIKE :term');
                }),
                { term: `%${search.toLowerCase()}%` },
            );
        }

        const [items, totalItems] = await qb.getManyAndCount();
        return { items, totalItems };
    }

    findOne(ctx: RequestContext, id: ID): Promise<Invoice | null> {
        return this.connection.getRepository(ctx, Invoice).findOne({
            where: { id: id as any, channelId: String(ctx.channelId) },
        });
    }

    findForOrder(ctx: RequestContext, orderId: ID): Promise<Invoice[]> {
        return this.connection.getRepository(ctx, Invoice).find({
            where: { orderId: String(orderId), channelId: String(ctx.channelId) },
            order: { issuedAt: 'ASC', id: 'ASC' },
        });
    }

    /**
     * Issues the tax invoice for an order. Safe to call repeatedly: if the
     * order already has a valid invoice, that one is returned.
     */
    async issueForOrder(
        ctx: RequestContext,
        orderId: ID,
        options: { sendEmail?: boolean } = {},
    ): Promise<Invoice> {
        // Make sure the settings row exists before locking it.
        await this.settingsService.get(ctx);

        let created = false;
        const invoice = await this.connection.withTransaction(ctx, async txCtx => {
            const settings = await this.lockSettings(txCtx);

            const existing = await this.connection.getRepository(txCtx, Invoice).findOne({
                where: {
                    orderId: String(orderId),
                    channelId: String(ctx.channelId),
                    type: 'INVOICE',
                    status: 'ISSUED',
                },
            });
            if (existing) return existing;

            const order = await this.orderService.findOne(txCtx, orderId);
            if (!order) {
                throw new EntityNotFoundError('Order', orderId);
            }
            if (!INVOICEABLE_STATES.includes(order.state)) {
                throw new UserInputError(
                    `Order ${order.code} is "${order.state}". An invoice can be issued once payment is settled.`,
                );
            }
            const payments = await this.orderService.getOrderPayments(txCtx, order.id);

            const issuedAt = new Date();
            const { number, sequence } = await this.allocateNumber(txCtx, settings, 'INVOICE', issuedAt);
            const data = this.buildSnapshot(order, payments, settings, number, issuedAt);

            created = true;
            return this.connection.getRepository(txCtx, Invoice).save(
                new Invoice({
                    channelId: String(ctx.channelId),
                    orderId: String(order.id),
                    orderCode: order.code,
                    customerId: order.customer ? String(order.customer.id) : null,
                    customerEmail: order.customer?.emailAddress ?? null,
                    customerName: data.billTo.name,
                    type: 'INVOICE',
                    status: 'ISSUED',
                    invoiceNumber: number,
                    sequenceNumber: sequence,
                    financialYear: financialYear(issuedAt),
                    issuedAt,
                    totalWithTax: data.totals.grandTotal,
                    taxTotal: data.totals.totalTax,
                    currencyCode: order.currencyCode,
                    relatedInvoiceId: null,
                    reason: null,
                    emailedAt: null,
                    data,
                }),
            );
        });

        if (created) {
            Logger.info(`Issued invoice ${invoice.invoiceNumber} for order ${invoice.orderCode}`, loggerCtx);
            await this.eventBus.publish(
                new InvoiceIssuedEvent(ctx, invoice, await this.shouldEmail(ctx, options.sendEmail)),
            );
        }
        return invoice;
    }

    /** Reverses an invoice in full with a credit note and marks it cancelled. */
    async issueCreditNote(
        ctx: RequestContext,
        invoiceId: ID,
        reason: string,
        options: { sendEmail?: boolean } = {},
    ): Promise<Invoice> {
        await this.settingsService.get(ctx);

        const creditNote = await this.connection.withTransaction(ctx, async txCtx => {
            const settings = await this.lockSettings(txCtx);
            const repo = this.connection.getRepository(txCtx, Invoice);
            const invoice = await repo.findOne({
                where: { id: invoiceId as any, channelId: String(ctx.channelId) },
            });
            if (!invoice) {
                throw new EntityNotFoundError('Invoice', invoiceId);
            }
            if (invoice.type !== 'INVOICE') {
                throw new UserInputError('A credit note can only be issued against an invoice.');
            }
            if (invoice.status !== 'ISSUED') {
                throw new UserInputError(`Invoice ${invoice.invoiceNumber} is already cancelled.`);
            }

            const issuedAt = new Date();
            const { number, sequence } = await this.allocateNumber(txCtx, settings, 'CREDIT_NOTE', issuedAt);
            const data: InvoiceSnapshot = {
                ...invoice.data,
                type: 'CREDIT_NOTE',
                title: 'CREDIT NOTE',
                invoiceNumber: number,
                issuedAt: issuedAt.toISOString(),
                reference: {
                    invoiceNumber: invoice.invoiceNumber,
                    issuedAt: invoice.issuedAt.toISOString(),
                },
                reason: reason.trim() || 'Order cancelled',
            };

            const saved = await repo.save(
                new Invoice({
                    channelId: invoice.channelId,
                    orderId: invoice.orderId,
                    orderCode: invoice.orderCode,
                    customerId: invoice.customerId,
                    customerEmail: invoice.customerEmail,
                    customerName: invoice.customerName,
                    type: 'CREDIT_NOTE',
                    status: 'ISSUED',
                    invoiceNumber: number,
                    sequenceNumber: sequence,
                    financialYear: financialYear(issuedAt),
                    issuedAt,
                    totalWithTax: invoice.totalWithTax,
                    taxTotal: invoice.taxTotal,
                    currencyCode: invoice.currencyCode,
                    relatedInvoiceId: invoice.id,
                    reason: data.reason ?? null,
                    emailedAt: null,
                    data,
                }),
            );

            invoice.status = 'CANCELLED';
            invoice.relatedInvoiceId = saved.id;
            await repo.save(invoice);
            return saved;
        });

        Logger.info(
            `Issued credit note ${creditNote.invoiceNumber} against ${creditNote.data.reference?.invoiceNumber}`,
            loggerCtx,
        );
        await this.eventBus.publish(
            new InvoiceIssuedEvent(ctx, creditNote, await this.shouldEmail(ctx, options.sendEmail)),
        );
        return creditNote;
    }

    /** Sends (again) the email with the PDF attached, regardless of the auto-email setting. */
    async resendEmail(ctx: RequestContext, invoiceId: ID): Promise<Invoice> {
        const invoice = await this.findOne(ctx, invoiceId);
        if (!invoice) {
            throw new EntityNotFoundError('Invoice', invoiceId);
        }
        if (!invoice.customerEmail) {
            throw new UserInputError('This order has no customer email address.');
        }
        await this.eventBus.publish(new InvoiceIssuedEvent(ctx, invoice, true));
        return invoice;
    }

    async markEmailed(ctx: RequestContext, invoiceId: ID): Promise<void> {
        await this.connection
            .getRepository(ctx, Invoice)
            .update({ id: invoiceId as any }, { emailedAt: new Date() });
    }

    // ------------------------------------------------------------------

    /** An explicit admin choice wins; otherwise the "email customer" setting decides. */
    private async shouldEmail(ctx: RequestContext, requested: boolean | undefined): Promise<boolean> {
        if (requested === false) return false;
        const settings = await this.settingsService.get(ctx);
        return requested === true || settings.emailCustomer;
    }

    private async lockSettings(ctx: RequestContext): Promise<InvoiceSettings> {
        const settings = await this.connection
            .getRepository(ctx, InvoiceSettings)
            .createQueryBuilder('settings')
            .setLock('pessimistic_write')
            .where('settings.channelId = :channelId', { channelId: String(ctx.channelId) })
            .getOne();
        if (!settings) {
            throw new Error('Invoice settings are missing.');
        }
        return settings;
    }

    /** Must run inside the transaction that holds the settings lock. */
    private async allocateNumber(
        ctx: RequestContext,
        settings: InvoiceSettings,
        type: InvoiceType,
        date: Date,
    ): Promise<{ number: string; sequence: number }> {
        const fy = financialYear(date);
        const isInvoice = type === 'INVOICE';
        const counterYear = isInvoice ? settings.invoiceSequenceYear : settings.creditNoteSequenceYear;
        let sequence = isInvoice ? settings.invoiceNextNumber : settings.creditNoteNextNumber;
        if (settings.resetEachFinancialYear && counterYear && counterYear !== fy) {
            sequence = 1;
        }

        const repo = this.connection.getRepository(ctx, Invoice);
        const format = (seq: number) =>
            formatInvoiceNumber({
                prefix: isInvoice ? settings.invoicePrefix : settings.creditNotePrefix,
                suffix: isInvoice ? settings.invoiceSuffix : settings.creditNoteSuffix,
                padding: settings.numberPadding,
                sequence: seq,
                date,
            });

        let number = format(sequence);
        // Skip numbers that are already taken (e.g. the counter was set back by hand).
        for (let attempt = 0; attempt < 1000; attempt++) {
            const clash = await repo.findOne({
                where: { channelId: String(ctx.channelId), invoiceNumber: number },
            });
            if (!clash) break;
            Logger.warn(`Invoice number ${number} is already used; skipping to the next one`, loggerCtx);
            sequence++;
            number = format(sequence);
        }

        const problem = validateInvoiceNumber(number);
        if (problem) {
            throw new UserInputError(`Cannot issue: ${problem} Fix the prefix/suffix in Invoice settings.`);
        }

        if (isInvoice) {
            settings.invoiceNextNumber = sequence + 1;
            settings.invoiceSequenceYear = fy;
        } else {
            settings.creditNoteNextNumber = sequence + 1;
            settings.creditNoteSequenceYear = fy;
        }
        await this.connection.getRepository(ctx, InvoiceSettings).save(settings);
        return { number, sequence };
    }

    private buildSnapshot(
        order: Order,
        payments: Array<{ method: string; state: string; transactionId?: string | null; amount: number }>,
        settings: InvoiceSettings,
        invoiceNumber: string,
        issuedAt: Date,
    ): InvoiceSnapshot {
        const sellerState = resolveGstState(settings.sellerState);
        const seller: InvoiceSnapshot['seller'] = {
            legalName: settings.sellerLegalName || 'PetsUpRight',
            name: settings.sellerTradeName || settings.sellerLegalName || 'PetsUpRight',
            addressLines: settings.sellerAddress
                .split(/\r?\n/)
                .map(line => line.trim())
                .filter(Boolean),
            state: sellerState.name,
            stateCode: sellerState.code || settings.sellerGstin.slice(0, 2),
            gstin: settings.sellerGstin || undefined,
            pan: settings.sellerPan || undefined,
            email: settings.sellerEmail || undefined,
            phone: settings.sellerPhone || undefined,
        };

        const email = order.customer?.emailAddress ?? undefined;
        const toParty = (address: any): InvoiceParty | null => {
            if (!address?.streetLine1) return null;
            const state = resolveGstState(address.province);
            const customerName = [order.customer?.firstName, order.customer?.lastName]
                .filter(Boolean)
                .join(' ');
            return {
                name: String(address.fullName || address.company || customerName || 'Customer').trim(),
                addressLines: [
                    address.company && address.fullName ? address.company : '',
                    address.streetLine1,
                    address.streetLine2,
                    [address.city, address.postalCode].filter(Boolean).join(' - '),
                    [state.name, address.country].filter(Boolean).join(', '),
                ]
                    .map((line: string) => String(line ?? '').trim())
                    .filter(Boolean),
                state: state.name,
                stateCode: state.code,
                email,
                phone: address.phoneNumber || order.customer?.phoneNumber || undefined,
            };
        };

        const shipTo = toParty(order.shippingAddress);
        if (!shipTo) {
            throw new UserInputError(`Order ${order.code} has no shipping address.`);
        }
        const billTo = toParty(order.billingAddress) ?? shipTo;
        // Goods delivered to a consumer: place of supply is the delivery state.
        const interState = !isSameState(seller.state, shipTo.state);

        const split = (tax: number) =>
            interState
                ? { cgst: 0, sgst: 0, igst: tax }
                : { cgst: Math.floor(tax / 2), sgst: tax - Math.floor(tax / 2), igst: 0 };

        const lines: InvoiceLineSnapshot[] = [];

        for (const line of order.lines ?? []) {
            if (!line.quantity) continue;
            const variant: any = line.productVariant;
            const taxable = line.proratedLinePrice;
            const total = line.proratedLinePriceWithTax;
            const gross = line.unitPrice * line.quantity;
            lines.push({
                description: String(variant?.name ?? 'Item'),
                sku: String(variant?.sku ?? ''),
                hsn: String(variant?.customFields?.hsnCode ?? '').trim(),
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                discount: Math.max(gross - taxable, 0),
                taxableValue: taxable,
                taxRate: line.taxRate,
                ...split(total - taxable),
                total,
            });
        }

        for (const shippingLine of order.shippingLines ?? []) {
            const total = shippingLine.discountedPriceWithTax;
            if (!total) continue;
            const taxable = shippingLine.discountedPrice;
            lines.push({
                description: `Shipping charges${shippingLine.shippingMethod?.name ? ` (${shippingLine.shippingMethod.name})` : ''}`,
                sku: '',
                hsn: settings.shippingSac,
                quantity: 1,
                unitPrice: shippingLine.price,
                discount: Math.max(shippingLine.price - taxable, 0),
                taxableValue: taxable,
                taxRate: shippingLine.taxRate,
                ...split(total - taxable),
                total,
            });
        }

        for (const surcharge of order.surcharges ?? []) {
            const total = surcharge.priceWithTax;
            const taxable = surcharge.price;
            lines.push({
                description: surcharge.description,
                sku: surcharge.sku ?? '',
                hsn: '',
                quantity: 1,
                unitPrice: taxable,
                discount: 0,
                taxableValue: taxable,
                taxRate: surcharge.taxRate,
                ...split(total - taxable),
                total,
            });
        }

        const sum = (key: keyof InvoiceLineSnapshot) =>
            lines.reduce((acc, line) => acc + (line[key] as number), 0);

        const taxRowMap = new Map<string, InvoiceTaxRow>();
        for (const line of lines) {
            const key = `${line.hsn}|${line.taxRate}`;
            const row = taxRowMap.get(key) ?? {
                hsn: line.hsn,
                taxRate: line.taxRate,
                taxableValue: 0,
                cgst: 0,
                sgst: 0,
                igst: 0,
            };
            row.taxableValue += line.taxableValue;
            row.cgst += line.cgst;
            row.sgst += line.sgst;
            row.igst += line.igst;
            taxRowMap.set(key, row);
        }

        const linesTotal = sum('total');
        const grandTotal = order.totalWithTax;
        const cgst = sum('cgst');
        const sgst = sum('sgst');
        const igst = sum('igst');

        const settled =
            payments.find(payment => payment.state === 'Settled') ??
            payments.find(payment => payment.state === 'Authorized') ??
            null;

        return {
            type: 'INVOICE',
            title: 'TAX INVOICE',
            invoiceNumber,
            issuedAt: issuedAt.toISOString(),
            orderCode: order.code,
            orderDate: order.orderPlacedAt ? new Date(order.orderPlacedAt).toISOString() : null,
            seller,
            billTo,
            shipTo,
            placeOfSupply: shipTo.stateCode ? `${shipTo.state} (${shipTo.stateCode})` : shipTo.state,
            interState,
            reverseCharge: false,
            lines,
            taxRows: [...taxRowMap.values()],
            totals: {
                taxableValue: sum('taxableValue'),
                cgst,
                sgst,
                igst,
                totalTax: cgst + sgst + igst,
                roundOff: grandTotal - linesTotal,
                grandTotal,
                amountInWords: amountInWords(grandTotal),
            },
            payment: settled
                ? {
                      method: settled.method === 'razorpay' ? 'Online (Razorpay)' : settled.method,
                      reference: settled.transactionId ?? '',
                      status: settled.state === 'Settled' ? 'Paid' : settled.state,
                  }
                : null,
            currencyCode: order.currencyCode,
            notes: settings.notes,
            footerText: settings.footerText,
            signatoryLabel: settings.signatoryLabel,
            logoUrl: settings.logoUrl,
        };
    }
}
