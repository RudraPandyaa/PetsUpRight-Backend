import { Injectable } from '@nestjs/common';
import {
    EntityNotFoundError,
    EventBus,
    Fulfillment,
    ID,
    Logger,
    Order,
    OrderService,
    RequestContext,
    ShippingLine,
    TransactionalConnection,
} from '@vendure/core';

import { backendBaseUrl } from '../../invoice/invoice-link';
import { OrderEmailSettings } from '../entities/order-email-settings.entity';
import { OrderEmailEvent } from '../events';
import { OrderEmailAudience, OrderEmailKind, SETTING_FOR, ShipmentInfo } from '../types';
import { OrderEmailSettingsService, parseEmailList } from './order-email-settings.service';

export const loggerCtx = 'OrderEmails';

const money = (paise: number) =>
    `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const dateTime = (value: Date | string | null | undefined) =>
    value
        ? new Date(value).toLocaleString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              timeZone: 'Asia/Kolkata',
          })
        : '';

/** Small product thumbnail for emails (Cloudinary resizes on the fly). */
function thumbnail(url: string | undefined | null): string {
    if (!url) return '';
    const match = url.match(/^(https?:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)$/);
    if (!match) return url;
    return `${match[1]}w_120,h_120,c_pad,b_white,f_jpg,q_80/${match[2]}`;
}

const storefrontUrl = () => (process.env.STOREFRONT_URL || 'http://localhost:3000').replace(/\/+$/, '');

const TRACKER_LABELS = ['Ordered', 'Confirmed', 'Shipped', 'Delivered'];
const TRACKER_STEP: Partial<Record<OrderEmailKind, number>> = {
    ORDER_RECEIVED: 1,
    ORDER_CONFIRMED: 2,
    SHIPPED: 3,
    OUT_FOR_DELIVERY: 3,
    DELIVERED: 4,
};

@Injectable()
export class OrderEmailService {
    constructor(
        private connection: TransactionalConnection,
        private orderService: OrderService,
        private settingsService: OrderEmailSettingsService,
        private eventBus: EventBus,
    ) {}

    /** Sends the customer and admin emails for one step, as enabled in the settings. */
    async notify(
        ctx: RequestContext,
        kind: OrderEmailKind,
        orderId: ID,
        options: { fulfillmentId?: ID } = {},
    ): Promise<void> {
        const settings = await this.settingsService.get(ctx);
        const audiences = (['customer', 'admin'] as OrderEmailAudience[]).filter(audience => {
            const key = SETTING_FOR[audience][kind];
            return key ? Boolean((settings as any)[key]) : false;
        });
        if (!audiences.length) return;

        const view = await this.buildView(ctx, orderId, options.fulfillmentId, settings);
        for (const audience of audiences) {
            const recipients =
                audience === 'customer' ? view.order.customer.email : parseEmailList(settings.adminEmails).join(', ');
            if (!recipients) {
                Logger.warn(`No ${audience} recipient for ${kind} email of order ${view.order.code}`, loggerCtx);
                continue;
            }
            await this.publish(ctx, audience, kind, view, settings, recipients, false);
        }
    }

    /** Sends one email to the given address(es), never to the customer. For checking the design. */
    async sendPreview(
        ctx: RequestContext,
        orderId: ID,
        kind: OrderEmailKind,
        audience: OrderEmailAudience,
        recipients?: string,
    ): Promise<string> {
        const settings = await this.settingsService.get(ctx);
        const to = parseEmailList(recipients || settings.adminEmails).join(', ');
        if (!to) throw new Error('No recipient: set an admin email first.');
        const order = await this.orderService.findOne(ctx, orderId);
        if (!order) throw new EntityNotFoundError('Order', orderId);
        const fulfillment = await this.latestFulfillment(ctx, order.id);
        const view = await this.buildView(ctx, orderId, fulfillment?.id, settings);
        await this.publish(ctx, audience, kind, view, settings, to, true);
        return to;
    }

    // ------------------------------------------------------------------

    private async publish(
        ctx: RequestContext,
        audience: OrderEmailAudience,
        kind: OrderEmailKind,
        view: Awaited<ReturnType<OrderEmailService['buildView']>>,
        settings: OrderEmailSettings,
        recipients: string,
        isPreview: boolean,
    ) {
        const content = audience === 'customer' ? this.customerCopy(kind, view) : this.adminCopy(kind, view);
        const step = TRACKER_STEP[kind];
        const steps = (content as { steps?: string[] }).steps;
        const templateVars = {
            ...view,
            ...content,
            steps: steps?.map((text, index) => ({ number: index + 1, text })) ?? null,
            kind,
            isPreview,
            isAdmin: audience === 'admin',
            isCancelled: kind === 'CANCELLED',
            tracker: step
                ? TRACKER_LABELS.map((label, index) => ({
                      label: kind === 'OUT_FOR_DELIVERY' && index === 2 ? 'Out for delivery' : label,
                      done: index < step,
                      current: index === step - 1,
                  }))
                : null,
            // The "need help?" footer is for customers only.
            support:
                audience === 'customer'
                    ? { email: settings.supportEmail, phone: settings.supportPhone }
                    : { email: '', phone: '' },
            defaultSupportEmail: audience === 'customer' ? settings.supportEmail : '',
        };
        const subject = `${isPreview ? '[Preview] ' : ''}${content.subject}`;
        await this.eventBus.publish(
            new OrderEmailEvent(
                ctx,
                audience,
                kind,
                recipients,
                subject,
                templateVars,
                audience === 'customer' ? settings.supportEmail || undefined : undefined,
            ),
        );
    }

    private async latestFulfillment(ctx: RequestContext, orderId: ID): Promise<Fulfillment | undefined> {
        const order = await this.connection.getRepository(ctx, Order).findOne({
            where: { id: orderId as any },
            relations: ['fulfillments'],
        });
        return (order?.fulfillments ?? [])
            .filter(f => f.state !== 'Cancelled')
            .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
    }

    private async buildView(
        ctx: RequestContext,
        orderId: ID,
        fulfillmentId: ID | undefined,
        settings: OrderEmailSettings,
    ) {
        const order = await this.orderService.findOne(ctx, orderId);
        if (!order) throw new EntityNotFoundError('Order', orderId);
        const payments = await this.orderService.getOrderPayments(ctx, order.id);
        const payment =
            payments.find(p => p.state === 'Settled') ?? payments.find(p => p.state === 'Authorized') ?? payments[0];

        let shipment: ShipmentInfo | null = null;
        const fulfillment = fulfillmentId
            ? await this.connection.getRepository(ctx, Fulfillment).findOne({ where: { id: fulfillmentId as any } })
            : await this.latestFulfillment(ctx, order.id);
        if (fulfillment) {
            const fields = (fulfillment.customFields ?? {}) as any;
            const isShiprocket = fulfillment.handlerCode === 'shiprocket-fulfillment';
            const awb = String(fields.shiprocketAwbCode || fulfillment.trackingCode || '');
            shipment = {
                fulfillmentId: String(fulfillment.id),
                method: fulfillment.method,
                isShiprocket,
                courier: String(fields.shiprocketCourierName || fulfillment.method || ''),
                awb,
                trackingUrl: isShiprocket && awb ? `https://shiprocket.co/tracking/${encodeURIComponent(awb)}` : '',
                status: String(fields.shiprocketStatus || fulfillment.state),
            };
        }

        const address: any = order.shippingAddress ?? {};
        const customerName =
            [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(' ') ||
            address.fullName ||
            'there';
        // The order's shipping lines don't include the method; load it explicitly.
        const shippingLines = await this.connection.getRepository(ctx, ShippingLine).find({
            where: { order: { id: order.id } } as any,
            relations: ['shippingMethod', 'shippingMethod.translations'],
        });
        const shippingMethods = shippingLines
            .map(line => line.shippingMethod)
            .filter(Boolean)
            .map(method => ({
                code: method.code,
                handler: method.fulfillmentHandlerCode,
                name: (method as any).translations?.[0]?.name ?? method.code,
            }));
        const isShiprocketDelivery =
            shipment?.isShiprocket ??
            shippingMethods.some(m => `${m.code} ${m.handler}`.includes('shiprocket'));
        const gst = (order.taxSummary ?? []).reduce((sum, row) => sum + row.taxTotal, 0);
        const discount = (order.discounts ?? []).reduce((sum, d) => sum + Math.abs(d.amountWithTax), 0);
        const originalTotal = Number((order.customFields as any)?.originalTotalBeforeCancellation ?? 0);
        const total = order.state === 'Cancelled' && originalTotal ? originalTotal : order.totalWithTax;

        return {
            order: {
                id: String(order.id),
                code: order.code,
                state: order.state,
                date: dateTime(order.orderPlacedAt ?? order.createdAt),
                total: money(total),
                subtotal: money(order.subTotalWithTax),
                shipping: order.shippingWithTax ? money(order.shippingWithTax) : 'Free',
                discount: discount ? money(discount) : '',
                gst: gst ? money(gst) : '',
                itemCount: order.totalQuantity,
                singleItem: order.totalQuantity === 1,
                paymentMethod: payment
                    ? payment.method === 'razorpay'
                        ? 'Paid online (Razorpay)'
                        : payment.method
                    : '',
                paymentReference: payment?.transactionId ?? '',
                deliveryType: isShiprocketDelivery
                    ? 'Courier (Shiprocket)'
                    : shippingMethods.map(m => m.name).filter(Boolean).join(', ') || 'Local delivery',
                isShiprocketDelivery,
                items: (order.lines ?? [])
                    .filter(line => line.quantity > 0)
                    .map(line => ({
                        name: line.productVariant?.name ?? 'Item',
                        quantity: line.quantity,
                        price: money(line.proratedLinePriceWithTax),
                        imageUrl: thumbnail(
                            (line.featuredAsset as any)?.preview ??
                                (line.productVariant as any)?.featuredAsset?.preview ??
                                '',
                        ),
                    })),
                address: {
                    name: address.fullName || customerName,
                    lines: [
                        address.company,
                        address.streetLine1,
                        address.streetLine2,
                        [address.city, address.province].filter(Boolean).join(', '),
                        address.postalCode,
                    ].filter(Boolean),
                    phone: address.phoneNumber ?? '',
                },
                customer: {
                    name: customerName,
                    firstName: order.customer?.firstName || String(address.fullName ?? '').split(' ')[0] || 'there',
                    email: order.customer?.emailAddress ?? '',
                    phone: address.phoneNumber || order.customer?.phoneNumber || '',
                },
                customerUrl: `${storefrontUrl()}/orders/${order.code}`,
                adminUrl: `${backendBaseUrl(ctx)}/dashboard/orders/${order.id}`,
            },
            shipment,
            storefrontUrl: storefrontUrl(),
        };
    }

    private customerCopy(kind: OrderEmailKind, view: Awaited<ReturnType<OrderEmailService['buildView']>>) {
        const { order, shipment } = view;
        const name = order.customer.firstName;
        const courier = shipment?.courier || 'our delivery partner';
        const local = !order.isShiprocketDelivery;
        const track = shipment?.trackingUrl
            ? { label: 'Track your package', url: shipment.trackingUrl }
            : { label: 'View your order', url: order.customerUrl };

        switch (kind) {
            case 'ORDER_RECEIVED':
                return {
                    subject: `Payment successful - we've received your order #${order.code}`,
                    preheader: `Your payment of ${order.total} was successful. We'll start preparing your order.`,
                    heading: 'Thank you for your order!',
                    intro: `Hi ${name}, your payment of ${order.total} was successful and we've received your order. We'll start preparing it right away and email you as soon as it's on its way.`,
                    cta: { label: 'View your order', url: order.customerUrl },
                };
            case 'ORDER_CONFIRMED':
                return {
                    subject: `Your order #${order.code} is confirmed and being packed`,
                    preheader: local
                        ? 'Your order is confirmed and will be delivered within 24 hours.'
                        : 'Your order is confirmed and will be shipped within 24 hours.',
                    heading: 'Your order is confirmed',
                    intro: local
                        ? `Good news, ${name}! Your order is confirmed and being packed. Our team will deliver it to you within 24 hours.`
                        : `Good news, ${name}! Your order is confirmed and being packed. It will be handed to ${courier} and be on its way within 24 hours.`,
                    cta: track,
                };
            case 'SHIPPED':
                return {
                    subject: local
                        ? `Your order #${order.code} is out for delivery`
                        : `Your order #${order.code} has been shipped`,
                    preheader: local ? 'Your order is on its way to you.' : `Picked up by ${courier} and on its way.`,
                    heading: local ? 'Your order is out for delivery' : 'Your order is on its way',
                    intro: local
                        ? `Hi ${name}, your order is out for delivery and will reach you soon.`
                        : `Hi ${name}, your package has been picked up by ${courier} and is on its way to you. You can follow it with the tracking number below.`,
                    cta: track,
                };
            case 'OUT_FOR_DELIVERY':
                return {
                    subject: `Arriving today: your order #${order.code} is out for delivery`,
                    preheader: 'Your package is out for delivery and will arrive today.',
                    heading: 'Arriving today',
                    intro: `Hi ${name}, your package is out for delivery with ${courier} and should reach you today. Please keep your phone handy for the delivery partner.`,
                    cta: track,
                };
            case 'DELIVERED':
                return {
                    subject: `Delivered: your order #${order.code}`,
                    preheader: 'Your order has been delivered. We hope your pet loves it!',
                    heading: 'Your order has been delivered',
                    intro: `Hi ${name}, your order has been delivered. We hope your pet loves it! If anything isn't right, just reply to this email and we'll help.`,
                    cta: { label: 'View your order', url: order.customerUrl },
                    secondaryCta: { label: 'Shop again', url: view.storefrontUrl },
                };
            case 'CANCELLED':
                return {
                    subject: `Your order #${order.code} has been cancelled`,
                    preheader: `Order #${order.code} was cancelled.`,
                    heading: 'Your order has been cancelled',
                    intro: `Hi ${name}, your order #${order.code} has been cancelled.`,
                    refundNote: order.paymentMethod
                        ? `If you paid online, the refund of ${order.total} goes back to your original payment method, usually within 5-7 working days.`
                        : '',
                    cta: { label: 'Continue shopping', url: view.storefrontUrl },
                };
        }
    }

    private adminCopy(kind: OrderEmailKind, view: Awaited<ReturnType<OrderEmailService['buildView']>>) {
        const { order, shipment } = view;
        const courier = shipment?.courier || 'the courier';
        const open = { label: 'Open order in dashboard', url: order.adminUrl };

        switch (kind) {
            case 'ORDER_RECEIVED':
                return {
                    subject: `New order #${order.code} - ${order.total} paid - ready to fulfill`,
                    preheader: `${order.customer.name} paid ${order.total}. Prepare and fulfill the order.`,
                    heading: 'New order to prepare',
                    intro: `Payment of ${order.total} received from ${order.customer.name}. The order is waiting to be fulfilled.`,
                    steps: order.isShiprocketDelivery
                        ? [
                              'Open the order in the dashboard',
                              'Click "Fulfill order"',
                              'Choose "Shiprocket fulfillment"',
                              'Click "Fulfill order" to book the courier',
                          ]
                        : [
                              'Open the order in the dashboard',
                              'Click "Fulfill order"',
                              'Enter the delivery details (local delivery)',
                              'Click "Fulfill order"',
                          ],
                    cta: open,
                };
            case 'ORDER_CONFIRMED': {
                const pickupProblem = shipment?.status === 'PICKUP_REQUEST_FAILED';
                return {
                    subject: `Order #${order.code} fulfilled - start packing`,
                    preheader: shipment?.isShiprocket
                        ? `${courier} will pick it up shortly. AWB ${shipment.awb}.`
                        : 'Pack the order for local delivery.',
                    heading: 'Order fulfilled - start packing',
                    intro: shipment?.isShiprocket
                        ? `You fulfilled order #${order.code}. Start packing it now - ${courier} will come to pick it up shortly.`
                        : `You fulfilled order #${order.code} for local delivery. Pack it and hand it to your delivery person.`,
                    warning: pickupProblem
                        ? 'The pickup could not be booked automatically. Schedule it in the Shiprocket panel.'
                        : '',
                    steps: shipment?.isShiprocket
                        ? [
                              'Pack the items securely',
                              'In the Shiprocket panel: Orders → Ready To Ship → Download Label',
                              'Stick the label on the box and keep it ready for pickup',
                          ]
                        : ['Pack the items securely', 'Hand the parcel to your delivery person'],
                    cta: open,
                    secondaryCta: shipment?.isShiprocket
                        ? { label: 'Open Shiprocket', url: 'https://app.shiprocket.in/' }
                        : undefined,
                };
            }
            case 'SHIPPED':
                return {
                    subject: shipment?.isShiprocket
                        ? `Order #${order.code} handed over to ${courier}`
                        : `Order #${order.code} is out for delivery`,
                    preheader: `Order #${order.code} has left your hands.`,
                    heading: shipment?.isShiprocket ? 'Handed over to the courier' : 'Out for delivery',
                    intro: shipment?.isShiprocket
                        ? `${courier} has picked up order #${order.code}. The customer has been told it's on its way.`
                        : `Order #${order.code} is out for delivery. The customer has been told.`,
                    cta: open,
                };
            case 'DELIVERED':
                return {
                    subject: `Order #${order.code} delivered to ${order.customer.name}`,
                    preheader: `Order #${order.code} has been delivered.`,
                    heading: 'Order delivered',
                    intro: `Order #${order.code} has been delivered to ${order.customer.name}.`,
                    cta: open,
                };
            case 'CANCELLED':
                return {
                    subject: `Order #${order.code} was cancelled`,
                    preheader: `Order #${order.code} (${order.total}) was cancelled.`,
                    heading: 'Order cancelled',
                    intro: `Order #${order.code} from ${order.customer.name} (${order.total}) was cancelled.`,
                    warning: order.paymentMethod
                        ? 'If the customer paid online, make sure the refund has been issued.'
                        : '',
                    cta: open,
                };
            default:
                return {
                    subject: `Order #${order.code} update`,
                    preheader: '',
                    heading: 'Order update',
                    intro: `Order #${order.code} was updated.`,
                    cta: open,
                };
        }
    }
}
