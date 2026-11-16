import { OnApplicationBootstrap } from '@nestjs/common';
import {
    EventBus,
    Logger,
    OrderStateTransitionEvent,
    PluginCommonModule,
    ProcessContext,
    VendurePlugin,
} from '@vendure/core';

import { InvoiceDownloadController } from './api/invoice-download.controller';
import {
    InvoiceAdminResolver,
    InvoiceSettingsEntityResolver,
    OrderInvoiceEntityResolver,
} from './api/invoice-admin.resolver';
import { InvoiceShopResolver } from './api/invoice-shop.resolver';
import { adminApiExtensions, shopApiExtensions } from './api/invoice.schema';
import { loggerCtx } from './constants';
import { Invoice } from './entities/invoice.entity';
import { InvoiceSettings } from './entities/invoice-settings.entity';
import { InvoicePdfService } from './services/invoice-pdf.service';
import { InvoiceSettingsService } from './services/invoice-settings.service';
import { InvoiceService } from './services/invoice.service';
import { InvoiceTrigger } from './types';

/** Order states at which each setting issues the invoice (later states catch up missed ones). */
const ISSUE_STATES: Record<Exclude<InvoiceTrigger, 'MANUAL'>, string[]> = {
    PAYMENT_SETTLED: ['PaymentSettled', 'PartiallyShipped', 'Shipped', 'PartiallyDelivered', 'Delivered'],
    SHIPPED: ['PartiallyShipped', 'Shipped', 'PartiallyDelivered', 'Delivered'],
    DELIVERED: ['PartiallyDelivered', 'Delivered'],
};

/**
 * GST tax invoices and credit notes.
 *
 * - Issues an invoice automatically (when payment settles, by default) and
 *   emails the PDF to the customer.
 * - Issues a credit note when an invoiced order is cancelled.
 * - Dashboard: Sales > Invoices, Settings > Invoice settings, and an
 *   "Invoices" block on each order.
 * - Customers download PDFs from a signed link (email + storefront).
 */
@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [Invoice, InvoiceSettings],
    providers: [InvoiceService, InvoiceSettingsService, InvoicePdfService],
    controllers: [InvoiceDownloadController],
    adminApiExtensions: {
        schema: adminApiExtensions,
        resolvers: [InvoiceAdminResolver, OrderInvoiceEntityResolver, InvoiceSettingsEntityResolver],
    },
    shopApiExtensions: {
        schema: shopApiExtensions,
        resolvers: [InvoiceShopResolver],
    },
    dashboard: './dashboard/index.tsx',
    compatibility: '^3.0.0',
})
export class InvoicePlugin implements OnApplicationBootstrap {
    constructor(
        private eventBus: EventBus,
        private invoiceService: InvoiceService,
        private settingsService: InvoiceSettingsService,
        private processContext: ProcessContext,
    ) {}

    onApplicationBootstrap() {
        // Order transitions happen in the server process.
        if (this.processContext.isWorker) return;

        this.eventBus
            .ofType(OrderStateTransitionEvent)
            .subscribe(event => {
                void this.handleTransition(event).catch(error =>
                    Logger.error(
                        `Invoice automation failed for order ${event.order.code} (${event.toState}): ${
                            error instanceof Error ? error.message : String(error)
                        }`,
                        loggerCtx,
                    ),
                );
            });
    }

    private async handleTransition(event: OrderStateTransitionEvent) {
        const settings = await this.settingsService.get(event.ctx);
        if (!settings.enabled) return;

        if (event.toState === 'Cancelled') {
            if (!settings.creditNoteOnCancel) return;
            const invoices = await this.invoiceService.findForOrder(event.ctx, event.order.id);
            const active = invoices.find(invoice => invoice.type === 'INVOICE' && invoice.status === 'ISSUED');
            if (active) {
                await this.invoiceService.issueCreditNote(event.ctx, active.id, 'Order cancelled');
            }
            return;
        }

        if (settings.issueOn === 'MANUAL') return;
        if (!ISSUE_STATES[settings.issueOn].includes(event.toState)) return;

        // Don't send customers incomplete tax invoices.
        if (!settings.sellerGstin || !settings.sellerAddress.trim()) {
            Logger.warn(
                `Not issuing an invoice for order ${event.order.code}: fill in GSTIN and address in Settings > Invoice settings first`,
                loggerCtx,
            );
            return;
        }

        const invoices = await this.invoiceService.findForOrder(event.ctx, event.order.id);
        // Issue once. After a credit note, a new invoice is only issued by hand.
        if (invoices.some(invoice => invoice.type === 'INVOICE')) return;

        await this.invoiceService.issueForOrder(event.ctx, event.order.id);
    }
}
