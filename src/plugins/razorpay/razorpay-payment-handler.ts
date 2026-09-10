import {
    CreatePaymentResult,
    LanguageCode,
    PaymentMethodHandler,
    SettlePaymentResult,
} from '@vendure/core';

import crypto from 'crypto';

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

        createPayment: async (
            ctx,
            order,
            amount,
            args,
            metadata,
        ): Promise<CreatePaymentResult> => {
            try {
                const razorpayOrderId =
                    metadata?.razorpay_order_id;

                const razorpayPaymentId =
                    metadata?.razorpay_payment_id;

                const razorpaySignature =
                    metadata?.razorpay_signature;

                if (
                    !razorpayOrderId ||
                    !razorpayPaymentId ||
                    !razorpaySignature
                ) {
                    return {
                        amount,
                        state: 'Declined',

                        metadata: {
                            errorMessage:
                                'Missing Razorpay payment information',
                        },
                    };
                }

                const secret =
                    process.env.RAZORPAY_KEY_SECRET;

                if (!secret) {
                    throw new Error(
                        'RAZORPAY_KEY_SECRET is missing',
                    );
                }

                const generatedSignature =
                    crypto
                        .createHmac(
                            'sha256',
                            secret,
                        )
                        .update(
                            `${razorpayOrderId}|${razorpayPaymentId}`,
                        )
                        .digest('hex');

                if (
                    generatedSignature !==
                    razorpaySignature
                ) {
                    return {
                        amount,
                        state: 'Declined',

                        metadata: {
                            errorMessage:
                                'Invalid Razorpay signature',
                        },
                    };
                }

                return {
                    amount,
                    state: 'Settled',

                    transactionId:
                        razorpayPaymentId,

                    metadata: {
                        razorpayOrderId,

                        public: {
                            razorpayPaymentId,
                        },
                    },
                };
            } catch (error: any) {
                return {
                    amount,
                    state: 'Declined',

                    metadata: {
                        errorMessage:
                            error?.message ??
                            'Razorpay payment failed',
                    },
                };
            }
        },

        settlePayment: async (): Promise<SettlePaymentResult> => {
            return {
                success: true,
            };
        },
    });