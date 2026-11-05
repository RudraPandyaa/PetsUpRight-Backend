import {
    EntityHydrator,
    Injector,
    OrderProcess,
    OrderState,
} from '@vendure/core';

import {
    DeliverablePincodeService,
    normalizePincode,
} from './services/deliverable-pincode.service';
import { ShiprocketService } from './services/shiprocket.service';

let pincodes: DeliverablePincodeService;
let shiprocket: ShiprocketService;
let entityHydrator: EntityHydrator;

export const deliverablePincodeOrderProcess: OrderProcess<OrderState> = {
    init(injector: Injector) {
        pincodes = injector.get(DeliverablePincodeService);
        shiprocket = injector.get(ShiprocketService);
        entityHydrator = injector.get(EntityHydrator);
    },

    async onTransitionStart(_fromState, toState, { ctx, order }) {
        if (toState !== 'ArrangingPayment' || ctx.apiType !== 'shop') {
            return;
        }

        const pincode = normalizePincode(
            order.shippingAddress?.postalCode,
        );

        if (!pincode) {
            return 'Please add a shipping address with a pincode.';
        }

        // Ensure variant custom fields, including shippingWeightGrams, are loaded.
        await entityHydrator.hydrate(ctx, order, {
            relations: ['lines', 'lines.productVariant'],
        });

        // Ahmedabad orders are delivered manually by the client.
        if (await pincodes.isAhmedabadManualDelivery(ctx, pincode)) {
            return;
        }

        const lines = order.lines ?? [];

        if (!lines.length) {
            return 'Your cart is empty.';
        }

        let totalWeightGrams = 0;

        for (const line of lines) {
            const grams = Number(
                (line.productVariant as any)?.customFields
                    ?.shippingWeightGrams,
            );

            if (!Number.isFinite(grams) || grams <= 0) {
                return `Shipping weight is missing for "${line.productVariant?.name ?? 'a product'}". Please contact support.`;
            }

            totalWeightGrams += grams * line.quantity;
        }

        try {
            const couriers = await shiprocket.getCourierOptions({
                deliveryPincode: pincode,
                weightKg: totalWeightGrams / 1000,
                // Checkout currently uses online payment.
                cod: false,
            });

            if (!couriers.length) {
                return `Shiprocket has no courier service for pincode ${pincode}.`;
            }
        } catch {
            return 'We could not verify delivery right now. Please try again.';
        }
    },
};