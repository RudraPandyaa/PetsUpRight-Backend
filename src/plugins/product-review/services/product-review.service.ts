import { Injectable } from '@nestjs/common';
import {
    CustomerService,
    ID,
    Order,
    ProductService,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import {
    ProductReview,
    ProductReviewStatus,
} from '../entities/product-review.entity';

export interface SubmitProductReviewInput {
    productId: ID;
    rating: number;
    title: string;
    body: string;
}

export interface AdminReviewListOptions {
    skip?: number;
    take?: number;
    productId?: ID;
    status?: ProductReviewStatus;
    isFeatured?: boolean;
}

export interface UpdateProductReviewInput {
    id: ID;
    status?: ProductReviewStatus;
    isFeatured?: boolean;
    displayOrder?: number;
}

export interface RatingCount {
    rating: number;
    count: number;
}

export interface ProductRatingSummary {
    productId: ID;
    averageRating: number;
    totalReviews: number;
    ratingCounts: RatingCount[];
}

@Injectable()
export class ProductReviewService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly customerService: CustomerService,
        private readonly productService: ProductService,
    ) {}

    /**
     * Public list of approved reviews for a product.
     */
    async getApprovedReviews(
        ctx: RequestContext,
        productId: ID,
        skip = 0,
        take = 10,
    ): Promise<{
        items: ProductReview[];
        totalItems: number;
        averageRating: number;
        ratingCounts: RatingCount[];
    }> {
        const safeSkip = Math.max(0, skip);
        const safeTake = Math.min(Math.max(1, take), 100);

        const repository = this.connection.getRepository(ctx, ProductReview);

        const [items, totalItems] = await repository.findAndCount({
            where: {
                productId,
                status: ProductReviewStatus.APPROVED,
            },
            order: {
                verifiedPurchase: 'DESC',
                createdAt: 'DESC',
            },
            skip: safeSkip,
            take: safeTake,
        });

        const summary = await this.getRatingSummary(ctx, productId);

        return {
            items,
            totalItems,
            averageRating: summary.averageRating,
            ratingCounts: summary.ratingCounts,
        };
    }

    /**
     * Returns the approved rating summary for one product.
     */
    async getRatingSummary(
        ctx: RequestContext,
        productId: ID,
    ): Promise<ProductRatingSummary> {
        const repository = this.connection.getRepository(ctx, ProductReview);

        const rawCounts: Array<{
            rating: string;
            count: string;
        }> = await repository
            .createQueryBuilder('review')
            .select('review.rating', 'rating')
            .addSelect('COUNT(review.id)', 'count')
            .where('review.productId = :productId', { productId })
            .andWhere('review.status = :status', {
                status: ProductReviewStatus.APPROVED,
            })
            .groupBy('review.rating')
            .getRawMany();

        const countMap = new Map<number, number>();

        for (const row of rawCounts) {
            countMap.set(Number(row.rating), Number(row.count));
        }

        const ratingCounts: RatingCount[] = [5, 4, 3, 2, 1].map(rating => ({
            rating,
            count: countMap.get(rating) ?? 0,
        }));

        const totalReviews = ratingCounts.reduce(
            (total, item) => total + item.count,
            0,
        );

        const totalRating = ratingCounts.reduce(
            (total, item) => total + item.rating * item.count,
            0,
        );

        const averageRating =
            totalReviews === 0
                ? 0
                : Number((totalRating / totalReviews).toFixed(2));

        return {
            productId,
            averageRating,
            totalReviews,
            ratingCounts,
        };
    }

    /**
     * Returns featured, approved reviews for the homepage.
     */
    async getFeaturedReviews(
        ctx: RequestContext,
        take = 6,
    ): Promise<ProductReview[]> {
        const safeTake = Math.min(Math.max(1, take), 50);

        return this.connection.getRepository(ctx, ProductReview).find({
            where: {
                status: ProductReviewStatus.APPROVED,
                isFeatured: true,
            },
            relations: {
                product: true,
            },
            order: {
                displayOrder: 'ASC',
                createdAt: 'DESC',
            },
            take: safeTake,
        });
    }

    /**
     * Creates a review or updates the customer's existing review.
     */
    async submitReview(
        ctx: RequestContext,
        input: SubmitProductReviewInput,
    ): Promise<ProductReview> {
        if (!ctx.activeUserId) {
            throw new UserInputError(
                'You must be logged in to submit a review',
            );
        }

        this.validateReviewInput(input);

        const customer = await this.customerService.findOneByUserId(
            ctx,
            ctx.activeUserId,
            true,
        );

        if (!customer) {
            throw new UserInputError(
                'Customer account could not be found',
            );
        }

        const product = await this.productService.findOne(
            ctx,
            input.productId,
        );

        if (!product) {
            throw new UserInputError('Product could not be found');
        }

        const repository = this.connection.getRepository(ctx, ProductReview);

        const existingReview = await repository.findOne({
            where: {
                productId: product.id,
                customerId: customer.id,
            },
        });

        const verifiedPurchase = await this.hasPurchasedProduct(
            ctx,
            customer.id,
            product.id,
        );

        const customerName =
            `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() ||
            'Customer';

        if (existingReview) {
            existingReview.rating = input.rating;
            existingReview.title = input.title.trim();
            existingReview.body = input.body.trim();
            existingReview.customerName = customerName;
            existingReview.verifiedPurchase = verifiedPurchase;

            // Every edited review must be moderated again.
            existingReview.status = ProductReviewStatus.PENDING;
            existingReview.isFeatured = false;
            existingReview.displayOrder = 0;

            return repository.save(existingReview);
        }

        const review = new ProductReview({
            product,
            productId: product.id,
            customer,
            customerId: customer.id,
            rating: input.rating,
            title: input.title.trim(),
            body: input.body.trim(),
            customerName,
            verifiedPurchase,
            status: ProductReviewStatus.PENDING,
            isFeatured: false,
            displayOrder: 0,
        });

        return repository.save(review);
    }

    /**
     * Admin list containing pending, approved and rejected reviews.
     */
    async getAdminReviews(
        ctx: RequestContext,
        options: AdminReviewListOptions = {},
    ): Promise<{
        items: ProductReview[];
        totalItems: number;
    }> {
        const {
            skip = 0,
            take = 20,
            productId,
            status,
            isFeatured,
        } = options;

        const queryBuilder = this.connection
            .getRepository(ctx, ProductReview)
            .createQueryBuilder('review')
            .leftJoinAndSelect('review.product', 'product')
            .orderBy('review.createdAt', 'DESC')
            .skip(Math.max(0, skip))
            .take(Math.min(Math.max(1, take), 100));

        if (productId !== undefined) {
            queryBuilder.andWhere('review.productId = :productId', {
                productId,
            });
        }

        if (status !== undefined) {
            queryBuilder.andWhere('review.status = :status', {
                status,
            });
        }

        if (isFeatured !== undefined) {
            queryBuilder.andWhere('review.isFeatured = :isFeatured', {
                isFeatured,
            });
        }

        const [items, totalItems] = await queryBuilder.getManyAndCount();

        return {
            items,
            totalItems,
        };
    }

    /**
     * Admin moderation and homepage featuring.
     */
    async updateReview(
        ctx: RequestContext,
        input: UpdateProductReviewInput,
    ): Promise<ProductReview> {
        const repository = this.connection.getRepository(ctx, ProductReview);

        const review = await repository.findOne({
            where: {
                id: input.id,
            },
            relations: {
                product: true,
            },
        });

        if (!review) {
            throw new UserInputError('Review could not be found');
        }

        if (input.status !== undefined) {
            review.status = input.status;
        }

        if (input.isFeatured !== undefined) {
            if (
                input.isFeatured &&
                review.status !== ProductReviewStatus.APPROVED
            ) {
                throw new UserInputError(
                    'Only approved reviews can be featured',
                );
            }

            review.isFeatured = input.isFeatured;
        }

        if (input.displayOrder !== undefined) {
            review.displayOrder = Math.max(0, input.displayOrder);
        }

        // Rejected or pending reviews must not remain featured.
        if (review.status !== ProductReviewStatus.APPROVED) {
            review.isFeatured = false;
        }

        return repository.save(review);
    }

    async deleteReview(
        ctx: RequestContext,
        reviewId: ID,
    ): Promise<boolean> {
        const repository = this.connection.getRepository(ctx, ProductReview);

        const review = await repository.findOne({
            where: {
                id: reviewId,
            },
        });

        if (!review) {
            throw new UserInputError('Review could not be found');
        }

        await repository.remove(review);

        return true;
    }

    private validateReviewInput(input: SubmitProductReviewInput): void {
        if (
            !Number.isInteger(input.rating) ||
            input.rating < 1 ||
            input.rating > 5
        ) {
            throw new UserInputError(
                'Rating must be a whole number between 1 and 5',
            );
        }

        const title = input.title?.trim() ?? '';
        const body = input.body?.trim() ?? '';

        if (title.length < 3 || title.length > 120) {
            throw new UserInputError(
                'Review title must contain between 3 and 120 characters',
            );
        }

        if (body.length < 10 || body.length > 5000) {
            throw new UserInputError(
                'Review body must contain between 10 and 5000 characters',
            );
        }
    }

    /**
     * Verified Purchase is controlled by the backend.
     *
     * The customer must have a placed, non-active order containing
     * a variant belonging to this product.
     */
    private async hasPurchasedProduct(
        ctx: RequestContext,
        customerId: ID,
        productId: ID,
    ): Promise<boolean> {
        const result = await this.connection
            .getRepository(ctx, Order)
            .createQueryBuilder('order')
            .innerJoin('order.lines', 'line')
            .innerJoin('line.productVariant', 'variant')
            .where('order.customerId = :customerId', { customerId })
            .andWhere('variant.productId = :productId', { productId })
            .andWhere('order.active = :active', { active: false })
            .andWhere('order.orderPlacedAt IS NOT NULL')
            .getExists();

        return result;
    }
}