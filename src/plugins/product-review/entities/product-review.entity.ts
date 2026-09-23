import {
    Customer,
    DeepPartial,
    EntityId,
    ID,
    Product,
    VendureEntity,
} from '@vendure/core';
import {
    Column,
    Entity,
    Index,
    ManyToOne,
} from 'typeorm';

export enum ProductReviewStatus {
    PENDING = 'PENDING',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
}

@Entity()
@Index(['productId', 'customerId'], { unique: true })
export class ProductReview extends VendureEntity {
    constructor(input?: DeepPartial<ProductReview>) {
        super(input);
    }

    @ManyToOne(() => Product, {
        onDelete: 'CASCADE',
        nullable: false,
    })
    product!: Product;

    @EntityId()
    productId!: ID;

    @ManyToOne(() => Customer, {
        onDelete: 'CASCADE',
        nullable: false,
    })
    customer!: Customer;

    @EntityId()
    customerId!: ID;

    @Column({ type: 'int' })
    rating!: number;

    @Column({
        type: 'varchar',
        length: 120,
    })
    title!: string;

    @Column({ type: 'text' })
    body!: string;

    @Column({
        type: 'varchar',
        length: 150,
    })
    customerName!: string;

    @Column({
        type: 'boolean',
        default: false,
    })
    verifiedPurchase!: boolean;

    @Column({
        type: 'varchar',
        length: 20,
        default: ProductReviewStatus.PENDING,
    })
    status!: ProductReviewStatus;

    @Column({
        type: 'boolean',
        default: false,
    })
    isFeatured!: boolean;

    @Column({
        type: 'int',
        default: 0,
    })
    displayOrder!: number;
}