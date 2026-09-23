import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
    Allow,
    Ctx,
    ID,
    Permission,
    RequestContext,
    Transaction,
} from '@vendure/core';
import {
    AdminReviewListOptions,
    ProductReviewService,
    UpdateProductReviewInput,
} from '../services/product-review.service';

@Resolver()
export class ProductReviewAdminResolver {
    constructor(
        private readonly productReviewService: ProductReviewService,
    ) {}

    @Query()
    @Allow(Permission.ReadCatalog)
    adminProductReviews(
        @Ctx() ctx: RequestContext,
        @Args('options') options?: AdminReviewListOptions,
    ) {
        return this.productReviewService.getAdminReviews(
            ctx,
            options ?? {},
        );
    }

    @Mutation()
    @Allow(Permission.UpdateCatalog)
    @Transaction()
    updateProductReview(
        @Ctx() ctx: RequestContext,
        @Args('input') input: UpdateProductReviewInput,
    ) {
        return this.productReviewService.updateReview(ctx, input);
    }

    @Mutation()
    @Allow(Permission.DeleteCatalog)
    @Transaction()
    deleteProductReview(
        @Ctx() ctx: RequestContext,
        @Args('id') id: ID,
    ) {
        return this.productReviewService.deleteReview(ctx, id);
    }
}