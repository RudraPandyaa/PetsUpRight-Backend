import { Customer, EntityHydrator, TransactionalConnection } from '@vendure/core';
import {
    orderConfirmationHandler,
    shippingLinesWithMethod,
    transformOrderLineAssetUrls,
} from '@vendure/email-plugin';

export const storefrontOrderConfirmationHandler = orderConfirmationHandler
    .loadData(async ({ event, injector }) => {
        await injector.get(EntityHydrator).hydrate(event.ctx, event.order, {
            relations: ['lines.featuredAsset', 'shippingLines.shippingMethod'],
        });
        transformOrderLineAssetUrls(event.ctx, event.order, injector);

        const customer = await injector.get(TransactionalConnection)
            .getRepository(event.ctx, Customer)
            .findOne({
                where: { id: event.order.customer!.id },
                relations: ['user'],
                select: { id: true, user: { id: true, verified: true } },
            });

        return {
            shippingLines: shippingLinesWithMethod(event.order),
            showAccountTrackingNote: customer != null && customer.user?.verified !== true,
        };
    })
    .setTemplateVars(event => ({
        order: event.order,
        shippingLines: event.data.shippingLines,
        showAccountTrackingNote: event.data.showAccountTrackingNote,
    }));
