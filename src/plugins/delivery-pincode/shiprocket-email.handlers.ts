import {
    Fulfillment,
    FulfillmentStateTransitionEvent,
    TransactionalConnection,
} from '@vendure/core';
import { EmailEventListener } from '@vendure/email-plugin';

function createShiprocketEmailHandler(
    templateType: 'shiprocket-shipped' | 'shiprocket-delivered',
    targetState: 'Shipped' | 'Delivered',
    subject: string,
) {
    return new EmailEventListener(templateType)
        .on(FulfillmentStateTransitionEvent)
        .filter(event => {
            const matches =
                    event.toState === targetState &&
                    event.fulfillment.handlerCode === 'shiprocket-fulfillment';

                console.info('[Shiprocket email filter]', {
                    templateType,
                    toState: event.toState,
                    handlerCode: event.fulfillment.handlerCode,
                    matches,
                });

                return matches;
            })
        .loadData(async ({ event, injector }) => {
            const connection = injector.get(TransactionalConnection);
            const fulfillment = await connection.getEntityOrThrow(
                event.ctx,
                Fulfillment,
                event.fulfillment.id,
                { relations: ['orders', 'orders.customer'] },
            );

            const order = fulfillment.orders?.[0];
            const email = order?.customer?.emailAddress;

            if (!order || !email) {
                throw new Error(
                    `Order or customer email missing for fulfillment ${fulfillment.id}.`,
                );
            }
            console.info('[Shiprocket email prepared]', {
                templateType,
                orderCode: order.code,
                hasRecipient: !!email,
            });
            const shiprocketFields = fulfillment.customFields as unknown as {
                shiprocketAwbCode?: string | null;
                shiprocketCourierName?: string | null;
                shiprocketStatus?: string | null;
            };
            return {
                recipient: email,
                order: { code: order.code },
                fulfillment: {
                    trackingCode: fulfillment.trackingCode,
                    method: fulfillment.method,
                    state: fulfillment.state,
                    customFields: {
                        shiprocketAwbCode: shiprocketFields.shiprocketAwbCode ?? '',
                        shiprocketCourierName: shiprocketFields.shiprocketCourierName ?? '',
                        shiprocketStatus: shiprocketFields.shiprocketStatus ?? '',
                    },
                },
            };
        })
        .setRecipient(event => event.data.recipient)
        .setFrom('{{ fromAddress }}')
        .setSubject(subject)
        .setTemplateVars(event => ({
            order: event.data.order,
            fulfillment: event.data.fulfillment,
        }));
}

export const shiprocketEmailHandlers = [
    createShiprocketEmailHandler(
        'shiprocket-shipped',
        'Shipped',
        'Your order {{ order.code }} has shipped',
    ),
    createShiprocketEmailHandler(
        'shiprocket-delivered',
        'Delivered',
        'Your order {{ order.code }} has been delivered',
    ),
];