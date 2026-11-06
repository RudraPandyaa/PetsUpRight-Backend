import {
    defaultOrderProcess,
    PluginCommonModule,
    VendurePlugin,
} from '@vendure/core';

import {
    DeliverablePincodeAdminResolver,
    DeliverablePincodeShopResolver,
} from './api/deliverable-pincode.resolver';
import {
    adminApiExtensions,
    shopApiExtensions,
} from './api/deliverable-pincode.schema';
import { deliverablePincodeOrderProcess } from './deliverable-pincode-order-process';
import { DeliverablePincode } from './entities/deliverable-pincode.entity';
import { DeliverablePincodeService } from './services/deliverable-pincode.service';
import { ShiprocketService } from './services/shiprocket.service';
import { shiprocketFulfillmentHandler } from './shiprocket-fulfillment.handler';
import { ShiprocketTrackingController } from './shiprocket-tracking.controller';


/**
 * Deliverable pincodes: the admin manages the list in the dashboard
 * (Settings > Deliverable Pincodes), the storefront can check a pincode,
 * and orders outside the list cannot go to payment.
 */
@VendurePlugin({    
    imports: [PluginCommonModule],

    entities: [DeliverablePincode],

    providers: [DeliverablePincodeService, ShiprocketService],
    controllers: [ShiprocketTrackingController],
    shopApiExtensions: {
        schema: shopApiExtensions,
        resolvers: [DeliverablePincodeShopResolver],
    },

    adminApiExtensions: {
        schema: adminApiExtensions,
        resolvers: [DeliverablePincodeAdminResolver],
    },

    configuration: config => {
        const orderProcesses =
            config.orderOptions.process ?? [defaultOrderProcess];

        config.orderOptions.process = [
            ...orderProcesses,
            deliverablePincodeOrderProcess,
        ];

        config.shippingOptions.fulfillmentHandlers = [
            ...(config.shippingOptions.fulfillmentHandlers ?? []),
            shiprocketFulfillmentHandler,
        ];

        return config;
    },

    dashboard: './dashboard/index.tsx',

    compatibility: '^3.0.0',
})
export class DeliveryPincodePlugin {}
