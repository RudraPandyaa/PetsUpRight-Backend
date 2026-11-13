import {
    DeepPartial,
    VendureEntity,
} from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

/**
 * A pincode (Indian postal code) that orders can be delivered to. Orders
 * with a shipping address outside this list cannot be paid for.
 */
@Entity()
export class DeliverablePincode extends VendureEntity {
    constructor(input?: DeepPartial<DeliverablePincode>) {
        super(input);
    }

    // 6 digits, e.g. "380052"
    @Index({ unique: true })
    @Column({ type: 'varchar', length: 10 })
    code!: string;

    // Optional label for the admin, e.g. "Ahmedabad"
    @Column({ type: 'varchar', length: 255, nullable: true })
    area!: string | null;
}
