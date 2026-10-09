import { Injectable } from '@nestjs/common';
import Razorpay from 'razorpay';

/**
 * Talks to the Razorpay API. The keys come from RAZORPAY_KEY_ID and
 * RAZORPAY_KEY_SECRET; the client is created on first use, so the backend
 * starts without them and only payments fail until they are set.
 */
@Injectable()
export class RazorpayService {
    private client?: Razorpay;

    isConfigured(): boolean {
        return Boolean(
            process.env.RAZORPAY_KEY_ID?.trim() &&
                process.env.RAZORPAY_KEY_SECRET?.trim(),
        );
    }

    keySecret(): string {
        const secret = process.env.RAZORPAY_KEY_SECRET?.trim();

        if (!secret) {
            throw new Error('Razorpay is not configured (RAZORPAY_KEY_SECRET is missing)');
        }

        return secret;
    }

    private razorpay(): Razorpay {
        if (!this.client) {
            const keyId = process.env.RAZORPAY_KEY_ID?.trim();

            if (!keyId) {
                throw new Error('Razorpay is not configured (RAZORPAY_KEY_ID is missing)');
            }

            this.client = new Razorpay({
                key_id: keyId,
                key_secret: this.keySecret(),
            });
        }

        return this.client;
    }

    /** amount is in paise, as Vendure stores it. */
    createOrder(amount: number, receipt: string) {
        return this.razorpay().orders.create({
            amount,
            currency: 'INR',
            receipt,
        });
    }

    fetchOrder(orderId: string) {
        return this.razorpay().orders.fetch(orderId);
    }

    fetchPayment(paymentId: string) {
        return this.razorpay().payments.fetch(paymentId);
    }

    capturePayment(paymentId: string, amount: number) {
        return this.razorpay().payments.capture(paymentId, amount, 'INR');
    }

    refundPayment(paymentId: string, amount: number) {
        return this.razorpay().payments.refund(paymentId, { amount });
    }
}
