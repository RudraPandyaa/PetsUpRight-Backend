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

if (this.razorpayService.isTestPaymentEnabled()) {
    return {
        id: `test_${order.code}`,
        amount: order.totalWithTax,
        currency: 'INR',
        receipt: order.code,
        status: 'test',
        testMode: true,
    };
}

if (!this.razorpayService.isConfigured()) {
    throw new UserInputError(
        'Online payment is not available yet. Please try again later.',
    );
}

try {
    const razorpayOrder = await this.razorpayService.createOrder(
        order.totalWithTax,
        order.code,
    );

    return {
        ...razorpayOrder,
        testMode: false,
    };
} catch (error: any) {
    Logger.error(
        `Could not create Razorpay order for ${order.code}: ` +
            (error?.error?.description ??
                error?.message ??
                JSON.stringify(error)),
        'Razorpay',
    );

    throw new UserInputError(
        'Online payment is not available right now. Please try again later.',
    );
}
    }
}
