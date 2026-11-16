import { ID, RequestContext, VendureEvent } from '@vendure/core';

import { OrderEmailAudience, OrderEmailKind } from './types';

/** A ready-to-send order email. Published by OrderEmailService, sent by the email handlers. */
export class OrderEmailEvent extends VendureEvent {
    constructor(
        public ctx: RequestContext,
        public audience: OrderEmailAudience,
        public kind: OrderEmailKind,
        /** Comma-separated recipients. */
        public recipients: string,
        public subject: string,
        public templateVars: Record<string, unknown>,
        public replyTo?: string,
    ) {
        super();
    }
}

/** Published by the Shiprocket webhook when a shipment's courier status changes. */
export class ShipmentStatusChangedEvent extends VendureEvent {
    constructor(
        public ctx: RequestContext,
        public fulfillmentId: ID,
        public previousStatus: string,
        public status: string,
    ) {
        super();
    }
}
