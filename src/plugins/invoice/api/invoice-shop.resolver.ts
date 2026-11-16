import { Args, Query, Resolver } from '@nestjs/graphql';
import {
    Allow,
    Ctx,
    CustomerService,
    OrderService,
    Permission,
    RequestContext,
} from '@vendure/core';

import { invoiceDownloadUrl } from '../invoice-link';
import { InvoiceService } from '../services/invoice.service';

@Resolver()
export class InvoiceShopResolver {
    constructor(
        private invoiceService: InvoiceService,
        private orderService: OrderService,
        private customerService: CustomerService,
    ) {}

    @Query()
    @Allow(Permission.Owner)
    async myOrderInvoices(@Ctx() ctx: RequestContext, @Args('orderCode') orderCode: string) {
        if (!ctx.activeUserId) return [];
        const customer = await this.customerService.findOneByUserId(ctx, ctx.activeUserId);
        const order = await this.orderService.findOneByCode(ctx, orderCode);
        // Same empty answer for "not found" and "not yours".
        if (!customer || !order || String(order.customerId) !== String(customer.id)) {
            return [];
        }
        const invoices = await this.invoiceService.findForOrder(ctx, order.id);
        return invoices.map(invoice => ({
            invoiceNumber: invoice.invoiceNumber,
            type: invoice.type,
            status: invoice.status,
            issuedAt: invoice.issuedAt,
            totalWithTax: invoice.totalWithTax,
            downloadUrl: invoiceDownloadUrl(ctx, invoice.id, invoice.invoiceNumber),
        }));
    }
}
