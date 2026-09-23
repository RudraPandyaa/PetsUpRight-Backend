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
    ProductReviewService,
    SubmitProductReviewInput,
} from '../services/product-review.service';

@Resolver()
export class ProductReviewShopResolver {
    constructor(
        private readonly productReviewService: ProductReviewService,
    ) {}

    @Query()
    productReviews(
        @Ctx() ctx: RequestContext,
        @Args('productId') productId: ID,
        @Args('skip') skip: number,
        @Args('take') take: number,
    ) {
        return this.productReviewService.getApprovedReviews(
            ctx,
            productId,
            skip,
            take,
        );
    }

    @Query()
    productRating(
        @Ctx() ctx: RequestContext,
        @Args('productId') productId: ID,
    ) {
        return this.productReviewService.getRatingSummary(
            ctx,
            productId,
        );
    }

    @Query()
    featuredProductReviews(
        @Ctx() ctx: RequestContext,
        @Args('take') take: number,
    ) {
        return this.productReviewService.getFeaturedReviews(
            ctx,
            take,
        );
    }

    @Mutation()
    @Allow(Permission.Authenticated)
    @Transaction()
    submitProductReview(
        @Ctx() ctx: RequestContext,
        @Args('input') input: SubmitProductReviewInput,
    ) {
        return this.productReviewService.submitReview(ctx, input);
    }
}