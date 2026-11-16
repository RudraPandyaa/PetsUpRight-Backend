export type OrderEmailKind =
    | 'ORDER_RECEIVED'
    | 'ORDER_CONFIRMED'
    | 'SHIPPED'
    | 'OUT_FOR_DELIVERY'
    | 'DELIVERED'
    | 'CANCELLED';

export type OrderEmailAudience = 'customer' | 'admin';

export const ORDER_EMAIL_KINDS: OrderEmailKind[] = [
    'ORDER_RECEIVED',
    'ORDER_CONFIRMED',
    'SHIPPED',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'CANCELLED',
];

/** Which settings switch controls each email. Admins get no out-for-delivery email. */
export const SETTING_FOR: Record<OrderEmailAudience, Partial<Record<OrderEmailKind, string>>> = {
    customer: {
        ORDER_RECEIVED: 'customerOrderReceived',
        ORDER_CONFIRMED: 'customerOrderConfirmed',
        SHIPPED: 'customerShipped',
        OUT_FOR_DELIVERY: 'customerOutForDelivery',
        DELIVERED: 'customerDelivered',
        CANCELLED: 'customerCancelled',
    },
    admin: {
        ORDER_RECEIVED: 'adminNewOrder',
        ORDER_CONFIRMED: 'adminFulfilled',
        SHIPPED: 'adminShipped',
        DELIVERED: 'adminDelivered',
        CANCELLED: 'adminCancelled',
    },
};

export interface ShipmentInfo {
    fulfillmentId: string;
    method: string;
    isShiprocket: boolean;
    courier: string;
    awb: string;
    trackingUrl: string;
    status: string;
}
