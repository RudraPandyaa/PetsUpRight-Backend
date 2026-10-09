import {
    Injector,
    OrderProcess,
    OrderState,
} from '@vendure/core';

import {
    DeliverablePincodeService,
    normalizePincode,
} from './services/deliverable-pincode.service';

let pincodes: DeliverablePincodeService;

/**
 * Stops a storefront order from going to payment unless its shipping
 * address is in a deliverable pincode. Orders created by an administrator
 * in the dashboard are not checked.
 */
export const deliverablePincodeOrderProcess: OrderProcess<OrderState> = {
    init(injector: Injector) {
        pincodes = injector.get(DeliverablePincodeService);
    },

    async onTransitionStart(fromState, toState, { ctx, order }) {
        if (toState !== 'ArrangingPayment' || ctx.apiType !== 'shop') {
            return;
        }

        const pincode = normalizePincode(order.shippingAddress?.postalCode);

        if (!pincode) {
            return 'Please add a shipping address with a pincode.';
        }

        if (!(await pincodes.isDeliverable(ctx, pincode))) {
            return `Sorry, we do not deliver to pincode ${pincode} yet.`;
        }
    },
};
