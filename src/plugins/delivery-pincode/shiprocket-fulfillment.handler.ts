import {
    EntityHydrator,
    FulfillmentHandler,
    Injector,
    LanguageCode,
    Order,
} from '@vendure/core';
import {
    ShiprocketAdhocOrderPayload,
    ShiprocketService,
} from './services/shiprocket.service';

let shiprocketService: ShiprocketService;
let entityHydrator: EntityHydrator;

const requiredValue = (value: unknown, label: string): string => {
    const result = String(value ?? '').trim();
    if (!result) {
        throw new Error(`Missing ${label} for Shiprocket shipment.`);
    }
    return result;
};

const positiveNumber = (
    value: string | undefined,
    fallback: number,
    label: string,
): number => {
    const result = value?.trim() ? Number(value) : fallback;
    if (!Number.isFinite(result) || result <= 0) {
        throw new Error(`${label} must be a positive number.`);
    }
    return result;
};

const rupees = (minorUnits: number): number =>
    Math.round((minorUnits / 100) * 100) / 100;

async function buildShiprocketPayload(
    order: Order,
): Promise<{ payload: ShiprocketAdhocOrderPayload; weightKg: number }> {
    const address = order.shippingAddress as any;
    const billingAddress = (order.billingAddress as any) ?? address;
    const email = order.customer?.emailAddress;

    if (!address) {
        throw new Error('Shipping address is missing.');
    }

    const phone = requiredValue(
        address.phoneNumber ?? billingAddress.phoneNumber,
        'customer phone',
    );
    const customerEmail = requiredValue(email, 'customer email');

    const lines = order.lines ?? [];
    if (!lines.length) {
        throw new Error('Cannot create a Shiprocket shipment for an empty order.');
    }

    let totalWeightGrams = 0;

    const orderItems = lines.map(line => {
        const variant = line.productVariant as any;
        const customFields = variant?.customFields ?? {};
        const grams = Number(customFields.shippingWeightGrams);

        if (!Number.isFinite(grams) || grams <= 0) {
            throw new Error(
                `Shipping weight is missing for "${variant?.name ?? 'a product'}".`,
            );
        }

        totalWeightGrams += grams * line.quantity;

        return {
            name: requiredValue(variant?.name, 'product name'),
            sku: requiredValue(variant?.sku, 'product SKU'),
            units: line.quantity,
            selling_price: rupees(line.unitPriceWithTax),
            ...(customFields.hsnCode
                ? { hsn: String(customFields.hsnCode) }
                : {}),
        };
    });

    const weightKg = totalWeightGrams / 1000;
    const subTotal = Math.round(
        orderItems.reduce(
            (sum, item) => sum + item.selling_price * item.units,
            0,
        ) * 100,
    ) / 100;

    // Temporary parcel dimensions for initial testing.
    // Set these to the packed parcel measurements before live shipping.
    const length = positiveNumber(
        process.env.SHIPROCKET_DEFAULT_LENGTH_CM,
        10,
        'SHIPROCKET_DEFAULT_LENGTH_CM',
    );
    const breadth = positiveNumber(
        process.env.SHIPROCKET_DEFAULT_BREADTH_CM,
        10,
        'SHIPROCKET_DEFAULT_BREADTH_CM',
    );
    const height = positiveNumber(
        process.env.SHIPROCKET_DEFAULT_HEIGHT_CM,
        10,
        'SHIPROCKET_DEFAULT_HEIGHT_CM',
    );

    const customer = order.customer as any;

    const fullName = String(
        billingAddress.fullName ??
            address.fullName ??
            [customer?.firstName, customer?.lastName].filter(Boolean).join(' ') ??
            '',
    ).trim();

        const nameParts = fullName.split(/\s+/).filter(Boolean);

        const firstName = requiredValue(
            billingAddress.firstName ??
                address.firstName ??
                customer?.firstName ??
                nameParts[0],
            'customer first name',
        );

        const lastName = String(
            billingAddress.lastName ??
                address.lastName ??
                customer?.lastName ??
                nameParts.slice(1).join(' ') ??
                '',
        ).trim();

        const shippingFirstName = requiredValue(
            address.firstName ?? nameParts[0] ?? firstName,
            'shipping first name',
        );

        const shippingLastName = String(
            address.lastName ?? nameParts.slice(1).join(' ') ?? lastName,
        ).trim();

    const payload: ShiprocketAdhocOrderPayload = {
        order_id: order.code,
        order_date: new Date(order.createdAt).toISOString().slice(0, 10),
        pickup_location: requiredValue(
            process.env.SHIPROCKET_PICKUP_LOCATION,
            'SHIPROCKET_PICKUP_LOCATION',
        ),

        billing_customer_name: firstName,
        billing_last_name: String(
            billingAddress.lastName ?? address.lastName ?? '',
        ),
        billing_address: requiredValue(
            billingAddress.streetLine1 ?? address.streetLine1,
            'billing address',
        ),
        billing_address_2: String(
            billingAddress.streetLine2 ?? address.streetLine2 ?? '',
        ),
        billing_city: requiredValue(
            billingAddress.city ?? address.city,
            'billing city',
        ),
        billing_pincode: requiredValue(
            billingAddress.postalCode ?? address.postalCode,
            'billing pincode',
        ),
        billing_state: requiredValue(
            billingAddress.province ?? address.province,
            'billing state',
        ),
        billing_country: requiredValue(
            billingAddress.country ?? address.country,
            'billing country',
        ),
        billing_email: customerEmail,
        billing_phone: phone,

        shipping_is_billing: false,
        shipping_customer_name: shippingFirstName,
        shipping_last_name: String(address.lastName ?? ''),
        shipping_address: requiredValue(
            address.streetLine1,
            'shipping address',
        ),
        shipping_address_2: String(address.streetLine2 ?? ''),
        shipping_city: requiredValue(address.city, 'shipping city'),
        shipping_pincode: requiredValue(
            address.postalCode,
            'shipping pincode',
        ),
        shipping_state: requiredValue(address.province, 'shipping state'),
        shipping_country: requiredValue(address.country, 'shipping country'),
        shipping_email: customerEmail,
        shipping_phone: phone,

        order_items: orderItems,
        payment_method: 'Prepaid',
        sub_total: subTotal,

        length,
        breadth,
        height,
        weight: weightKg,
    };

    return { payload, weightKg };
}

export const shiprocketFulfillmentHandler = new FulfillmentHandler({
    code: 'shiprocket-fulfillment',
    description: [
        {
            languageCode: LanguageCode.en,
            value: 'Shiprocket fulfillment',
        },
    ],
    args: {},

    init(injector: Injector) {
        shiprocketService = injector.get(ShiprocketService);
        entityHydrator = injector.get(EntityHydrator);
    },

    createFulfillment: async (ctx, orders) => {
        let stage = 'checking mode';

        try {
            const mockEnabled =
                process.env.SHIPROCKET_MOCK_MODE?.trim().toLowerCase() === 'true';
            const liveEnabled =
                process.env.SHIPROCKET_LIVE_MODE?.trim().toLowerCase() === 'true';

            if (mockEnabled === liveEnabled) {
                throw new Error(
                    'Set exactly one of SHIPROCKET_MOCK_MODE=true or SHIPROCKET_LIVE_MODE=true.',
                );
            }

            if (mockEnabled && process.env.NODE_ENV === 'production') {
                throw new Error(
                    'Mock Shiprocket fulfillment cannot run in production.',
                );
            }

            const order = orders[0];
            if (!order) {
                throw new Error('No order was provided for fulfillment.');
            }

            stage = 'hydrating order';
            await entityHydrator.hydrate(ctx, order, {
                relations: ['lines', 'lines.productVariant', 'customer'],
            });

            stage = 'building Shiprocket payload';
            const { payload, weightKg } = await buildShiprocketPayload(order);

            const deliveryPincode = requiredValue(
                payload.shipping_pincode,
                'shipping pincode',
            );

            stage = 'checking courier availability';
            const couriers = await shiprocketService.getCourierOptions({
                deliveryPincode,
                weightKg,
                cod: false,
            });

            const courier = couriers[0];
            if (!courier) {
                throw new Error(
                    `No Shiprocket courier is available for pincode ${deliveryPincode}.`,
                );
            }

            stage = 'creating Shiprocket order';
            const shipment = await shiprocketService.createAdhocOrder(payload);

            stage = 'assigning AWB';
            const awbResult = await shiprocketService.assignAwb(
                shipment.shipment_id,
                courier.courierId,
            );

            const awbResponse = awbResult as {
                awb_assign_status?: number;
                response?: {
                    data?: {
                        awb_code?: string;
                        courier_name?: string;
                    };
                };
                message?: string;
            };

            const awbData = awbResponse.response?.data;
            if (awbResponse.awb_assign_status === 0 || !awbData?.awb_code) {
                throw new Error(
                    awbResponse.message ?? 'Shiprocket did not return an AWB code.',
                );
            }

            stage = 'requesting pickup';
            const pickupResult = await shiprocketService.requestPickup(
                shipment.shipment_id,
            );

            const pickupStatus =
                typeof pickupResult.status === 'string'
                    ? pickupResult.status
                    : mockEnabled
                    ? 'MOCK_PICKUP_SCHEDULED'
                    : 'PICKUP_REQUESTED';

            return {
                method: mockEnabled ? 'Shiprocket (Mock)' : 'Shiprocket',
                trackingCode: awbData.awb_code,
                customFields: {
                    shiprocketOrderId: String(shipment.order_id),
                    shiprocketShipmentId: String(shipment.shipment_id),
                    shiprocketAwbCode: awbData.awb_code,
                    shiprocketCourierName:
                        awbData.courier_name ?? courier.courierName,
                    shiprocketStatus: pickupStatus,
                },
            };
        } catch (error) {
            console.error(
                `[Shiprocket fulfillment failed at: ${stage}]`,
                error instanceof Error ? error.stack ?? error.message : error,
            );
            throw error;
        }
    },
});