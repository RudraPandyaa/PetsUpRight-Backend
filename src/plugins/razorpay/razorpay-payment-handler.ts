import {
    CreatePaymentResult,
    CreateRefundResult,
    Injector,
    LanguageCode,
    Logger,
    PaymentMethodHandler,
    SettlePaymentResult,
} from '@vendure/core';

import crypto from 'crypto';

import { RazorpayService } from './razorpay.service';

let razorpay: RazorpayService;

const errorText = (error: any): string =>
    error?.error?.description ?? error?.message ?? 'Razorpay request failed';

/** Compares two hex strings in constant time. */
function signaturesMatch(expected: string, received: string): boolean {
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(received, 'utf8');

    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// errorMessage is shown on the payment in the dashboard
const declined = (amount: number, errorMessage: string): CreatePaymentResult => ({
    amount,
    state: 'Declined',
    errorMessage,
    metadata: { errorMessage },
});

/**
 * Accepts a Razorpay payment for an order only when:
 * - the signature from Razorpay Checkout is valid,
 * - the Razorpay order was created for this order (receipt = order code)
 *   and for the same amount,
 * - the payment belongs to that Razorpay order and is captured (an
 *   authorized payment is captured here).
 */
export const razorpayPaymentHandler =
    new PaymentMethodHandler({
        code: 'razorpay',

        description: [
            {
                languageCode: LanguageCode.en,
                value: 'Razorpay',
            },
        ],

        args: {},

        init(injector: Injector) {
            razorpay = injector.get(RazorpayService);
        },

        createPayment: async (
            ctx,
            order,
            amount,
            args,
            metadata,
        ): Promise<CreatePaymentResult> => {
            const razorpayOrderId = metadata?.razorpay_order_id;
            const razorpayPaymentId = metadata?.razorpay_payment_id;
            const razorpaySignature = metadata?.razorpay_signature;

            if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
                return declined(amount, 'Missing Razorpay payment information');
            }

            try {
                const expectedSignature = crypto
                    .createHmac('sha256', razorpay.keySecret())
                    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
                    .digest('hex');

                if (!signaturesMatch(expectedSignature, String(razorpaySignature))) {
                    return declined(amount, 'Invalid Razorpay signature');
                }

                // The Razorpay order must be the one created for this order
                const razorpayOrder = await razorpay.fetchOrder(razorpayOrderId);

                if (razorpayOrder.receipt !== order.code) {
                    return declined(amount, 'Razorpay payment belongs to a different order');
                }

                if (Number(razorpayOrder.amount) !== amount) {
                    return declined(
                        amount,
                        `Razorpay amount ${razorpayOrder.amount} does not match the order total ${amount}`,
                    );
                }

                let payment = await razorpay.fetchPayment(razorpayPaymentId);

                if (payment.order_id !== razorpayOrderId) {
                    return declined(amount, 'Razorpay payment does not match the Razorpay order');
                }

                // Without auto-capture in the Razorpay account, a payment is
                // only authorized; capture it so the money is collected
                if (payment.status === 'authorized') {
                    payment = await razorpay.capturePayment(razorpayPaymentId, amount);
                }

                if (payment.status !== 'captured') {
                    return declined(amount, `Razorpay payment is ${payment.status}`);
                }

                return {
                    amount,
                    state: 'Settled',
                    transactionId: razorpayPaymentId,
                    metadata: {
                        razorpayOrderId,
                        razorpayPaymentId,
                        method: payment.method,
                        public: {
                            razorpayPaymentId,
                            method: payment.method,
                        },
                    },
                };
            } catch (error: any) {
                Logger.error(
                    `Razorpay payment ${razorpayPaymentId} for order ${order.code} failed: ${errorText(error)}`,
                    'Razorpay',
                );

                return declined(amount, errorText(error));
            }
        },

        settlePayment: async (): Promise<SettlePaymentResult> => ({
            success: true,
        }),

        /** Refunds through Razorpay when an admin refunds in the dashboard. */
        createRefund: async (ctx, input, amount, order, payment): Promise<CreateRefundResult> => {
            if (!payment.transactionId) {
                return {
                    state: 'Failed',
                    metadata: { errorMessage: 'Payment has no Razorpay payment ID' },
                };
            }

            try {
                const refund = await razorpay.refundPayment(payment.transactionId, amount);

                return {
                    state: refund.status === 'failed' ? 'Failed' : 'Settled',
                    transactionId: refund.id,
                    metadata: { razorpayRefundStatus: refund.status },
                };
            } catch (error: any) {
                Logger.error(
                    `Razorpay refund for payment ${payment.transactionId} failed: ${errorText(error)}`,
                    'Razorpay',
                );

                return {
                    state: 'Failed',
                    metadata: { errorMessage: errorText(error) },
                };
            }
        },
    });
