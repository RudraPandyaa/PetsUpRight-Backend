import { DeepPartial, ID, VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

import { InvoiceSnapshot, InvoiceStatus, InvoiceType } from '../types';

@Entity()
@Index(['channelId', 'invoiceNumber'], { unique: true })
@Index(['orderId'])
export class Invoice extends VendureEntity {
    constructor(input?: DeepPartial<Invoice>) {
        super(input);
    }

    @Column({ type: 'varchar', length: 40 })
    channelId!: ID;

    @Column({ type: 'varchar', length: 40 })
    orderId!: ID;

    @Column({ type: 'varchar', length: 64 })
    orderCode!: string;

    @Column({ type: 'varchar', length: 40, nullable: true })
    customerId!: ID | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    customerEmail!: string | null;

    @Column({ type: 'varchar', length: 255, default: '' })
    customerName!: string;

    @Column({ type: 'varchar', length: 20 })
    type!: InvoiceType;

    @Column({ type: 'varchar', length: 20, default: 'ISSUED' })
    status!: InvoiceStatus;

    @Column({ type: 'varchar', length: 32 })
    invoiceNumber!: string;

    @Column({ type: 'int' })
    sequenceNumber!: number;

    @Column({ type: 'varchar', length: 9 })
    financialYear!: string;

    @Column({ type: 'timestamp' })
    issuedAt!: Date;

    @Column({ type: 'int' })
    totalWithTax!: number;

    @Column({ type: 'int' })
    taxTotal!: number;

    @Column({ type: 'varchar', length: 3, default: 'INR' })
    currencyCode!: string;

    /** Credit note: the invoice it reverses. Invoice: its credit note, once cancelled. */
    @Column({ type: 'varchar', length: 40, nullable: true })
    relatedInvoiceId!: ID | null;

    @Column({ type: 'text', nullable: true })
    reason!: string | null;

    @Column({ type: 'timestamp', nullable: true })
    emailedAt!: Date | null;

    @Column({ type: 'simple-json' })
    data!: InvoiceSnapshot;
}
