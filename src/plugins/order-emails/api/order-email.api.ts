import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, Permission, RequestContext } from '@vendure/core';
import gql from 'graphql-tag';

import { OrderEmailService } from '../services/order-email.service';
import {
    OrderEmailSettingsService,
    UpdateOrderEmailSettingsInput,
} from '../services/order-email-settings.service';
import { OrderEmailKind } from '../types';

const toggles = `
    customerOrderReceived: Boolean
    customerOrderConfirmed: Boolean
    customerShipped: Boolean
    customerOutForDelivery: Boolean
    customerDelivered: Boolean
    customerCancelled: Boolean
    adminNewOrder: Boolean
    adminFulfilled: Boolean
    adminShipped: Boolean
    adminDelivered: Boolean
    adminCancelled: Boolean
`;

export const adminApiExtensions = gql`
    enum OrderEmailKind {
        ORDER_RECEIVED
        ORDER_CONFIRMED
        SHIPPED
        OUT_FOR_DELIVERY
        DELIVERED
        CANCELLED
    }

    enum OrderEmailAudience {
        CUSTOMER
        ADMIN
    }

    type OrderEmailSettings {
        id: ID!
        "Comma-separated addresses that receive the admin emails."
        adminEmails: String!
        supportEmail: String!
        supportPhone: String!
        ${toggles.replace(/Boolean/g, 'Boolean!')}
    }

    input UpdateOrderEmailSettingsInput {
        adminEmails: String
        supportEmail: String
        supportPhone: String
        ${toggles}
    }

    extend type Query {
        orderEmailSettings: OrderEmailSettings!
    }

    extend type Mutation {
        updateOrderEmailSettings(input: UpdateOrderEmailSettingsInput!): OrderEmailSettings!
        "Sends one email for an existing order to the given address(es) - or the admin emails - never to the customer. Returns the recipients."
        sendOrderEmailPreview(
            orderId: ID!
            kind: OrderEmailKind!
            audience: OrderEmailAudience!
            recipients: String
        ): String!
    }
`;

@Resolver()
export class OrderEmailAdminResolver {
    constructor(
        private settingsService: OrderEmailSettingsService,
        private orderEmailService: OrderEmailService,
    ) {}

    @Query()
    @Allow(Permission.ReadSettings, Permission.ReadOrder)
    orderEmailSettings(@Ctx() ctx: RequestContext) {
        return this.settingsService.get(ctx);
    }

    @Mutation()
    @Allow(Permission.UpdateSettings)
    updateOrderEmailSettings(
        @Ctx() ctx: RequestContext,
        @Args('input') input: UpdateOrderEmailSettingsInput,
    ) {
        return this.settingsService.update(ctx, input);
    }

    @Mutation()
    @Allow(Permission.UpdateSettings)
    sendOrderEmailPreview(
        @Ctx() ctx: RequestContext,
        @Args('orderId') orderId: ID,
        @Args('kind') kind: OrderEmailKind,
        @Args('audience') audience: 'CUSTOMER' | 'ADMIN',
        @Args('recipients') recipients?: string,
    ) {
        return this.orderEmailService.sendPreview(
            ctx,
            orderId,
            kind,
            audience === 'ADMIN' ? 'admin' : 'customer',
            recipients,
        );
    }
}
