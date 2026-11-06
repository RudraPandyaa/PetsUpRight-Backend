import { FulfillmentHandler, LanguageCode } from '@vendure/core';
import { ShiprocketService } from './services/shiprocket.service';

let shiprocketService: ShiprocketService;

export const shiprocketFulfillmentHandler = new FulfillmentHandler({
    code: 'shiprocket-fulfillment',
    description: [
        {
            languageCode: LanguageCode.en,
            value: 'Shiprocket fulfillment (local mock)',
        },
    ],
    args: {},

    init(injector) {
        shiprocketService = injector.get(ShiprocketService);
    },

    createFulfillment: async (_ctx, orders) => {
        const mockEnabled =
            process.env.SHIPROCKET_MOCK_MODE?.trim().toLowerCase() === 'true';

        if (!mockEnabled || process.env.NODE_ENV === 'production') {
            throw new Error(
                'Mock Shiprocket fulfillment is enabled only in local development.',
            );
        }

        const order = orders[0];
        if (!order) {
            throw new Error('No order was provided for fulfillment.');
        }

        const shipment = await shiprocketService.createAdhocOrder({
            order_id: `MOCK-${order.code}`,
        });

        const awbResult = await shiprocketService.assignAwb(
            shipment.shipment_id,
            999999,
        );

        const awbData = (
            awbResult.response as
                | { data?: { awb_code?: string } }
                | undefined
        )?.data;

        if (!awbData?.awb_code) {
            throw new Error('Mock AWB was not returned.');
        }

        const pickupResult = await shiprocketService.requestPickup(
            shipment.shipment_id,
        );

        const trackingResult = await shiprocketService.getTracking(
            shipment.shipment_id,
        );

        const trackingStatus =
            typeof trackingResult.status === 'string'
                ? trackingResult.status
                : typeof pickupResult.status === 'string'
                ? pickupResult.status
                : 'MOCK_PICKUP_SCHEDULED';

        return {
            method: 'Shiprocket (Mock)',
            trackingCode: awbData.awb_code,
            customFields: {
                shiprocketOrderId: String(shipment.order_id),
                shiprocketShipmentId: String(shipment.shipment_id),
                shiprocketAwbCode: awbData.awb_code,
                shiprocketCourierName: 'MOCK Courier',
                shiprocketStatus: trackingStatus,
            },
        };
    },
});