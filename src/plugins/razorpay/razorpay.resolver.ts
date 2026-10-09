import {
    Mutation,
    Resolver,
} from '@nestjs/graphql';

import {
    ActiveOrderService,
    Ctx,
    Logger,
    RequestContext,
    UserInputError,
} from '@vendure/core';

import { RazorpayService } from './razorpay.service';

@Resolver()
export class RazorpayResolver {
    constructor(
        private razorpayService: RazorpayService,
        private activeOrderService: ActiveOrderService,
    ) {}

    /**
     * Creates the Razorpay order for the customer's active order. The order
     * must already be in ArrangingPayment, i.e. it passed the checks for
     * going to payment (shipping method, deliverable pincode, ...).
     */
    @Mutation()
    async createRazorpayOrder(
        @Ctx() ctx: RequestContext,
    ) {
        if (!this.razorpayService.isConfigured()) {
            throw new UserInputError('Online payment is not available yet. Please try again later.');
        }

        const order =
            await this.activeOrderService.getOrderFromContext(ctx);

        if (!order) {
            throw new UserInputError('No active order found');
        }

        if (order.state !== 'ArrangingPayment') {
            throw new UserInputError('The order is not ready for payment');
        }

        if (order.totalWithTax <= 0) {
            throw new UserInputError('Order total must be greater than 0');
        }

        try {
            return await this.razorpayService.createOrder(
                order.totalWithTax,
                order.code,
            );
        } catch (error: any) {
            // e.g. wrong keys (401 Authentication failed); details stay in the log
            Logger.error(
                `Could not create Razorpay order for ${order.code}: ` +
                    (error?.error?.description ?? error?.message ?? JSON.stringify(error)),
                'Razorpay',
            );

            throw new UserInputError('Online payment is not available right now. Please try again later.');
        }
    }
}
