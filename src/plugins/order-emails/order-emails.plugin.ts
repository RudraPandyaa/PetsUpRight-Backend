import { OnApplicationBootstrap } from '@nestjs/common';
import {
    EventBus,
    Fulfillment,
    FulfillmentStateTransitionEvent,
    ID,
    Logger,
    OrderStateTransitionEvent,
    PluginCommonModule,
    ProcessContext,
    RequestContext,
    TransactionalConnection,
    VendurePlugin,
} from '@vendure/core';

import { adminApiExtensions, OrderEmailAdminResolver } from './api/order-email.api';
import { OrderEmailSettings } from './entities/order-email-settings.entity';
import { ShipmentStatusChangedEvent } from './events';
import { loggerCtx, OrderEmailService } from './services/order-email.service';
import { OrderEmailSettingsService } from './services/order-email-settings.service';
import { OrderEmailKind } from './types';

/**
 * Order emails to the customer and the shop admin at every step:
 *
 *   paid             -> customer "payment successful" / admin "new order to prepare"
 *   fulfilled        -> customer "confirmed, ships in 24h" / admin "start packing"
 *   picked up        -> customer "on its way" / admin "handed over to courier"
 *   out for delivery -> customer "arriving today"
 *   delivered        -> customer + admin
 *   cancelled        -> customer + admin
 *
 * Admin address(es) and on/off switches: Settings > Email notifications.
 */
@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [OrderEmailSettings],
    providers: [OrderEmailService, OrderEmailSettingsService],
    adminApiExtensions: {
        schema: adminApiExtensions,
        resolvers: [OrderEmailAdminResolver],
    },
    dashboard: './dashboard/index.tsx',
    compatibility: '^3.0.0',
})
export class OrderEmailsPlugin implements OnApplicationBootstrap {
    constructor(
        private eventBus: EventBus,
        private orderEmailService: OrderEmailService,
        private connection: TransactionalConnection,
        private processContext: ProcessContext,
    ) {}

    onApplicationBootstrap() {
        if (this.processContext.isWorker) return;

        this.eventBus.ofType(OrderStateTransitionEvent).subscribe(event => {
            const placed = ['ArrangingPayment', 'PaymentAuthorized'].includes(event.fromState);
            if (event.toState === 'PaymentSettled' && placed) {
                this.send(event.ctx, 'ORDER_RECEIVED', event.order.id);
            }
            // Only orders that were actually placed; abandoned carts get no email.
            if (event.toState === 'Cancelled' && event.order.orderPlacedAt) {
                this.send(event.ctx, 'CANCELLED', event.order.id);
            }
        });

        this.eventBus.ofType(FulfillmentStateTransitionEvent).subscribe(event => {
            const kind: OrderEmailKind | null =
                event.fromState === 'Created' && event.toState === 'Pending'
                    ? 'ORDER_CONFIRMED'
                    : event.toState === 'Shipped'
                      ? 'SHIPPED'
                      : event.toState === 'Delivered'
                        ? 'DELIVERED'
                        : null;
            if (kind) this.sendForFulfillment(event.ctx, kind, event.fulfillment.id);
        });

        this.eventBus.ofType(ShipmentStatusChangedEvent).subscribe(event => {
            const now = event.status.toUpperCase();
            if (now === 'OUT FOR DELIVERY' && event.previousStatus.toUpperCase() !== now) {
                this.sendForFulfillment(event.ctx, 'OUT_FOR_DELIVERY', event.fulfillmentId);
            }
        });
    }

    private send(ctx: RequestContext, kind: OrderEmailKind, orderId: ID, fulfillmentId?: ID) {
        this.orderEmailService.notify(ctx, kind, orderId, { fulfillmentId }).catch(error =>
            Logger.error(
                `Could not send ${kind} emails for order ${orderId}: ${
                    error instanceof Error ? error.message : String(error)
                }`,
                loggerCtx,
            ),
        );
    }

    private sendForFulfillment(ctx: RequestContext, kind: OrderEmailKind, fulfillmentId: ID) {
        this.connection
            .getRepository(ctx, Fulfillment)
            .findOne({ where: { id: fulfillmentId as any }, relations: ['orders'] })
            .then(fulfillment => {
                for (const order of fulfillment?.orders ?? []) {
                    this.send(ctx, kind, order.id, fulfillmentId);
                }
            })
            .catch(error =>
                Logger.error(`Could not load fulfillment ${fulfillmentId}: ${String(error)}`, loggerCtx),
            );
    }
}
