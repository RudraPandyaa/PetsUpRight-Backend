import {
    Mutation,
    Resolver,
} from '@nestjs/graphql';

import {
    ActiveOrderService,
    Ctx,
    RequestContext,
} from '@vendure/core';

import { RazorpayService } from './razorpay.service';

@Resolver()
export class RazorpayResolver {
    constructor(
        private razorpayService: RazorpayService,
        private activeOrderService: ActiveOrderService,
    ) {}

    @Mutation()
    async createRazorpayOrder(
        @Ctx() ctx: RequestContext,
    ) {
        const order =
            await this.activeOrderService.getOrderFromContext(ctx);

        if (!order) {
            throw new Error('No active order found');
        }

        if (order.totalWithTax <= 0) {
            throw new Error('Order total must be greater than 0');
        }

        return this.razorpayService.createOrder(
            order.totalWithTax,
            order.code,
        );
    }
}