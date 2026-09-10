import { Injectable } from '@nestjs/common';
import Razorpay from 'razorpay';

@Injectable()
export class RazorpayService {
    private razorpay: Razorpay;

    constructor() {
        const keyId = process.env.RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;

        if (!keyId || !keySecret) {
            throw new Error(
                'RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is missing in .env',
            );
        }

        this.razorpay = new Razorpay({
            key_id: keyId,
            key_secret: keySecret,
        });
    }

    async createOrder(
        amount: number,
        receipt: string,
    ) {
        return this.razorpay.orders.create({
            amount,
            currency: 'INR',
            receipt,
        });
    }
}