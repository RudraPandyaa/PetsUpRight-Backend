import { DeepPartial, ID, VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

import { InvoiceTrigger } from '../types';

/** One row per channel, edited in Settings > Invoice settings. */
@Entity()
@Index(['channelId'], { unique: true })
export class InvoiceSettings extends VendureEntity {
    constructor(input?: DeepPartial<InvoiceSettings>) {
        super(input);
    }

    @Column({ type: 'varchar', length: 40 })
    channelId!: ID;

    // --- Automation ---

    @Column({ type: 'boolean', default: true })
    enabled!: boolean;

    /** When an invoice is issued automatically. */
    @Column({ type: 'varchar', length: 20, default: 'PAYMENT_SETTLED' })
    issueOn!: InvoiceTrigger;

    @Column({ type: 'boolean', default: true })
    emailCustomer!: boolean;

    /** Issue a credit note automatically when an invoiced order is cancelled. */
    @Column({ type: 'boolean', default: true })
    creditNoteOnCancel!: boolean;

    // --- Numbering ---

    @Column({ type: 'varchar', length: 32, default: 'INV/{FY}/' })
    invoicePrefix!: string;

    @Column({ type: 'varchar', length: 32, default: '' })
    invoiceSuffix!: string;

    @Column({ type: 'int', default: 1 })
    invoiceNextNumber!: number;

    /** Financial year the invoice counter belongs to (for yearly reset). */
    @Column({ type: 'varchar', length: 9, nullable: true })
    invoiceSequenceYear!: string | null;

    @Column({ type: 'varchar', length: 32, default: 'CN/{FY}/' })
    creditNotePrefix!: string;

    @Column({ type: 'varchar', length: 32, default: '' })
    creditNoteSuffix!: string;

    @Column({ type: 'int', default: 1 })
    creditNoteNextNumber!: number;

    @Column({ type: 'varchar', length: 9, nullable: true })
    creditNoteSequenceYear!: string | null;

    @Column({ type: 'int', default: 4 })
    numberPadding!: number;

    /** Restart both counters at 1 on 1 April. */
    @Column({ type: 'boolean', default: true })
    resetEachFinancialYear!: boolean;

    // --- Seller (printed on the invoice) ---

    @Column({ type: 'varchar', length: 255, default: '' })
    sellerLegalName!: string;

    @Column({ type: 'varchar', length: 255, default: '' })
    sellerTradeName!: string;

    @Column({ type: 'text', default: '' })
    sellerAddress!: string;

    @Column({ type: 'varchar', length: 100, default: 'Gujarat' })
    sellerState!: string;

    @Column({ type: 'varchar', length: 15, default: '' })
    sellerGstin!: string;

    @Column({ type: 'varchar', length: 10, default: '' })
    sellerPan!: string;

    @Column({ type: 'varchar', length: 255, default: '' })
    sellerEmail!: string;

    @Column({ type: 'varchar', length: 30, default: '' })
    sellerPhone!: string;

    // --- Document ---

    @Column({ type: 'varchar', length: 500, default: '' })
    logoUrl!: string;

    /** SAC code printed on the shipping line (996812 = courier services). */
    @Column({ type: 'varchar', length: 10, default: '996812' })
    shippingSac!: string;

    @Column({ type: 'text', default: '' })
    notes!: string;

    @Column({ type: 'varchar', length: 255, default: 'This is a computer-generated invoice and does not require a signature.' })
    footerText!: string;

    @Column({ type: 'varchar', length: 100, default: 'Authorised Signatory' })
    signatoryLabel!: string;
}
