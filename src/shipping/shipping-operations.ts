import {
    EntityHydrator,
    Injector,
    LanguageCode,
    Order,
    RequestContext,
    ShippingCalculator,
    ShippingEligibilityChecker,
} from '@vendure/core';

import { DeliverablePincodeService } from '../plugins/delivery-pincode/services/deliverable-pincode.service';
import { ShiprocketService } from '../plugins/delivery-pincode/services/shiprocket.service';

let pincodeService: DeliverablePincodeService;
let shiprocketService: ShiprocketService;
let entityHydrator: EntityHydrator;

async function getWeightKg(
    ctx: RequestContext,
    order: Order,
): Promise<number | undefined> {
    await entityHydrator.hydrate(ctx, order, {
        relations: ['lines', 'lines.productVariant'],
    });

    if (!order.lines?.length) return undefined;

    const defaultWeightGrams = Number(
        process.env.SHIPROCKET_DEFAULT_WEIGHT_GRAMS ?? 500,
    );

    if (!Number.isFinite(defaultWeightGrams) || defaultWeightGrams <= 0) {
        return undefined;
    }

    let totalGrams = 0;

    for (const line of order.lines) {
        const variantGrams = Number(
            (line.productVariant as any)?.customFields?.shippingWeightGrams,
        );

        const grams =
            Number.isFinite(variantGrams) && variantGrams > 0
                ? variantGrams
                : defaultWeightGrams;

        totalGrams += grams * line.quantity;
    }

    return totalGrams > 0 ? totalGrams / 1000 : undefined;
}

async function isLocalAhmedabadOrder(
    ctx: RequestContext,
    order: Order,
): Promise<boolean> {
    return pincodeService.isAhmedabadManualDelivery(
        ctx,
        order.shippingAddress?.postalCode,
    );
}

export const ahmedabadManualChecker = new ShippingEligibilityChecker({
    code: 'ahmedabad-manual-checker',
    description: [
        {
            languageCode: LanguageCode.en,
            value: 'Only Ahmedabad manual-delivery pincodes',
        },
    ],
    args: {},
    init(injector: Injector) {
        pincodeService = injector.get(DeliverablePincodeService);
    },
    check: async (ctx, order) => isLocalAhmedabadOrder(ctx, order),
});

export const shiprocketChecker = new ShippingEligibilityChecker({
    code: 'shiprocket-serviceability-checker',
    description: [
        {
            languageCode: LanguageCode.en,
            value: 'Shiprocket courier available for the address and cart weight',
        },
    ],
    args: {},
    init(injector: Injector) {
        pincodeService = injector.get(DeliverablePincodeService);
        shiprocketService = injector.get(ShiprocketService);
        entityHydrator = injector.get(EntityHydrator);
    },
    check: async (ctx, order) => {
        try {
            if (await isLocalAhmedabadOrder(ctx, order)) return false;

            const pincode = order.shippingAddress?.postalCode;
            const weightKg = await getWeightKg(ctx, order);

            if (!pincode || !weightKg) return false;

            const couriers = await shiprocketService.getCourierOptions({
                deliveryPincode: pincode,
                weightKg,
                cod: false,
            });

            return couriers.length > 0;
        } catch (error) {
            console.error('[Shiprocket eligibility checker failed]', {
                pincode: order.shippingAddress?.postalCode,
                error: error instanceof Error ? error.message : error,
            });

            return false;
        }
    },
});

export const ahmedabadManualCalculator = new ShippingCalculator({
    code: 'ahmedabad-manual-calculator',
    description: [
        {
            languageCode: LanguageCode.en,
            value: 'Ahmedabad manual delivery fee',
        },
    ],
    args: {
        fee: {
            type: 'int',
            ui: { component: 'currency-form-input' },
            label: [
                {
                    languageCode: LanguageCode.en,
                    value: 'Manual delivery fee',
                },
            ],
        },
    },
    calculate: (_ctx, _order, args) => ({
        price: args.fee,
        priceIncludesTax: false,
        taxRate: 0,
        metadata: { deliveryType: 'manual' },
    }),
});

export const shiprocketCalculator = new ShippingCalculator({
    code: 'shiprocket-rate-calculator',
    description: [
        {
            languageCode: LanguageCode.en,
            value: 'Lowest available Shiprocket courier rate',
        },
    ],
    args: {},
    init(injector: Injector) {
        shiprocketService = injector.get(ShiprocketService);
        entityHydrator = injector.get(EntityHydrator);
    },
    calculate: async (ctx, order) => {
        const pincode = order.shippingAddress?.postalCode;
        const weightKg = await getWeightKg(ctx, order);

        if (!pincode || !weightKg) {
            throw new Error('Shipping address or product shipping weight is missing.');
        }

        const couriers = await shiprocketService.getCourierOptions({
            deliveryPincode: pincode,
            weightKg,
            cod: false,
        });

        const cheapest = couriers[0];

        if (!cheapest) {
            throw new Error('No Shiprocket courier is available for this address.');
        }

        return {
            price: Math.round(cheapest.rate * 100),
            priceIncludesTax: false,
            taxRate: 0,
            metadata: {
                deliveryType: 'shiprocket',
                courierId: cheapest.courierId,
                courierName: cheapest.courierName,
                estimatedDelivery: cheapest.estimatedDelivery,
            },
        };
    },
});