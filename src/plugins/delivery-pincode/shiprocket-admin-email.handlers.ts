import {
    EntityHydrator,
    Fulfillment,
    FulfillmentStateTransitionEvent,
    Order,
    OrderPlacedEvent,
    TransactionalConnection,
} from '@vendure/core';
import {
    EmailEventListener
} from '@vendure/email-plugin';

function getDeliveryType(shippingLines: any[]): string {
    const methods = shippingLines
        .map(line => {
            const method = line.shippingMethod;
            return `${method?.code ?? ''} ${method?.name ?? ''} ${
                method?.fulfillmentHandlerCode ?? ''
            }`;
        })
        .join(' ')
        .toLowerCase();

    if (methods.includes('shiprocket')) return 'Shiprocket';
    if (methods) return 'Local';
    return 'Not selected';
}

const adminEmail = () => process.env.ORDERS_ADMIN_EMAIL?.trim() ?? '';

const adminNewOrderHandler = new EmailEventListener('admin-new-order')
    .on(OrderPlacedEvent)
    .filter(event => !!adminEmail() && !!event.order)
    .loadData(async ({ event, injector }) => {
        const connection = injector.get(TransactionalConnection);

        const order = await connection.getEntityOrThrow(
            event.ctx,
            Order,
            event.order.id,
            {
                relations: [
                    'customer',
                    'lines',
                    'lines.productVariant',
                    'shippingLines',
                    'shippingLines.shippingMethod',
                ],
            },
        );

        const shippingLines = order.shippingLines ?? [];
        const shippingMethodName =
            shippingLines
                .map(line => line.shippingMethod?.name)
                .filter(Boolean)
                .join(', ') || 'Not selected';

        const address = (order.shippingAddress ?? {}) as any;

        return {
            recipient: adminEmail(),
            deliveryType: getDeliveryType(shippingLines),
            shippingMethodName,
            order: {
                code: order.code,
                placedAt: new Date(order.createdAt).toLocaleString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                }),
                total: (order.totalWithTax / 100).toFixed(2),
            },
            customer: {
                name:
                    [address.firstName, address.lastName]
                        .filter(Boolean)
                        .join(' ') || 'Customer',
                email: order.customer?.emailAddress ?? '',
                phone: address.phoneNumber ?? '',
            },
            items: order.lines.map(line => ({
                name: line.productVariant.name,
                sku: line.productVariant.sku,
                quantity: line.quantity,
                total: (line.linePriceWithTax / 100).toFixed(2),
            })),
        };
    })
    .setRecipient(event => event.data.recipient)
    .setFrom('{{ fromAddress }}')
    .setSubject('New order received: #{{order.code}}')
    .setTemplateVars(event => ({
        order: event.data.order,
        customer: event.data.customer,
        items: event.data.items,
        deliveryType: event.data.deliveryType,
        shippingMethodName: event.data.shippingMethodName,
    }));

function createAdminFulfillmentHandler(
    templateType: 'admin-order-shipped' | 'admin-order-delivered',
    targetState: 'Shipped' | 'Delivered',
    subject: string,
) {
    return new EmailEventListener(templateType)
        .on(FulfillmentStateTransitionEvent)
        .filter(event => !!adminEmail() && event.toState === targetState)
        .loadData(async ({ event, injector }) => {
            const connection = injector.get(TransactionalConnection);

            const fulfillment = await connection.getEntityOrThrow(
                event.ctx,
                Fulfillment,
                event.fulfillment.id,
                { relations: ['orders'] },
            );

            const orderSummary = fulfillment.orders?.[0];
            if (!orderSummary) {
                throw new Error(
                    `No order found for fulfillment ${fulfillment.id}.`,
                );
            }

            const order = await connection.getEntityOrThrow(
                event.ctx,
                Order,
                orderSummary.id,
                {
                    relations: [
                        'shippingLines',
                        'shippingLines.shippingMethod',
                    ],
                },
            );

            const shippingLines = order.shippingLines ?? [];
            const shippingMethodName =
                shippingLines
                    .map(line => line.shippingMethod?.name)
                    .filter(Boolean)
                    .join(', ') || 'Not selected';

            const fields = fulfillment.customFields as unknown as {
                shiprocketCourierName?: string | null;
            };

            return {
                recipient: adminEmail(),
                order: { code: order.code },
                deliveryType: getDeliveryType(shippingLines),
                shippingMethodName,
                fulfillment: {
                    trackingCode: fulfillment.trackingCode ?? '',
                    courierName:
                        fields.shiprocketCourierName || shippingMethodName,
                    state: fulfillment.state,
                },
            };
        })
        .setRecipient(event => event.data.recipient)
        .setFrom('{{ fromAddress }}')
        .setSubject(subject)
        .setTemplateVars(event => ({
            order: event.data.order,
            fulfillment: event.data.fulfillment,
            deliveryType: event.data.deliveryType,
            shippingMethodName: event.data.shippingMethodName,
        }));
}

export const shiprocketAdminEmailHandlers = [
    adminNewOrderHandler,
    createAdminFulfillmentHandler(
        'admin-order-shipped',
        'Shipped',
        'Order #{{order.code}} has shipped',
    ),
    createAdminFulfillmentHandler(
        'admin-order-delivered',
        'Delivered',
        'Order #{{order.code}} was delivered',
    ),
];