import { DeepPartial, ID, VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

/** One row per channel, edited in Settings > Email notifications. */
@Entity()
@Index(['channelId'], { unique: true })
export class OrderEmailSettings extends VendureEntity {
    constructor(input?: DeepPartial<OrderEmailSettings>) {
        super(input);
    }

    @Column({ type: 'varchar', length: 40 })
    channelId!: ID;

    /** Comma-separated list of addresses that receive the admin emails. */
    @Column({ type: 'varchar', length: 500, default: 'orders.petsupright@gmail.com' })
    adminEmails!: string;

    /** Shown to customers as the contact address, and used as Reply-To. */
    @Column({ type: 'varchar', length: 255, default: 'orders.petsupright@gmail.com' })
    supportEmail!: string;

    @Column({ type: 'varchar', length: 30, default: '' })
    supportPhone!: string;

    // Customer emails
    @Column({ type: 'boolean', default: true }) customerOrderReceived!: boolean;
    @Column({ type: 'boolean', default: true }) customerOrderConfirmed!: boolean;
    @Column({ type: 'boolean', default: true }) customerShipped!: boolean;
    @Column({ type: 'boolean', default: true }) customerOutForDelivery!: boolean;
    @Column({ type: 'boolean', default: true }) customerDelivered!: boolean;
    @Column({ type: 'boolean', default: true }) customerCancelled!: boolean;

    // Admin emails
    @Column({ type: 'boolean', default: true }) adminNewOrder!: boolean;
    @Column({ type: 'boolean', default: true }) adminFulfilled!: boolean;
    @Column({ type: 'boolean', default: true }) adminShipped!: boolean;
    @Column({ type: 'boolean', default: true }) adminDelivered!: boolean;
    @Column({ type: 'boolean', default: true }) adminCancelled!: boolean;
}
