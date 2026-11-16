import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, EntityNotFoundError, ID, Permission, RequestContext } from '@vendure/core';

import { Invoice } from '../entities/invoice.entity';
import { InvoiceSettings } from '../entities/invoice-settings.entity';
import { GST_STATE_NAMES } from '../gst-states';
import { invoiceDownloadUrl } from '../invoice-link';
import { buildSampleSnapshot } from '../sample-invoice';
import { InvoicePdfService } from '../services/invoice-pdf.service';
import {
    InvoiceSettingsService,
    UpdateInvoiceSettingsInput,
} from '../services/invoice-settings.service';
import { InvoiceListOptions, InvoiceService } from '../services/invoice.service';

@Resolver()
export class InvoiceAdminResolver {
    constructor(
        private invoiceService: InvoiceService,
        private settingsService: InvoiceSettingsService,
        private pdfService: InvoicePdfService,
    ) {}

    @Query()
    @Allow(Permission.ReadOrder)
    invoiceSettings(@Ctx() ctx: RequestContext) {
        return this.settingsService.get(ctx);
    }

    @Query()
    @Allow(Permission.ReadOrder)
    async previewInvoiceNumbers(
        @Ctx() ctx: RequestContext,
        @Args('input') input: UpdateInvoiceSettingsInput,
    ) {
        return this.settingsService.preview(ctx, await this.draft(ctx, input));
    }

    @Query()
    @Allow(Permission.ReadOrder)
    async sampleInvoicePdf(
        @Ctx() ctx: RequestContext,
        @Args('input') input: UpdateInvoiceSettingsInput | undefined,
        @Args('interState') interState: boolean,
    ) {
        const draft = await this.draft(ctx, input ?? {});
        const { nextInvoiceNumber } = await this.settingsService.preview(ctx, draft);
        const pdf = await this.pdfService.render(
            buildSampleSnapshot(draft, nextInvoiceNumber, { interState: Boolean(interState) }),
        );
        return pdf.toString('base64');
    }

    /** Current settings with the unsaved form values applied. */
    private async draft(ctx: RequestContext, input: UpdateInvoiceSettingsInput) {
        const current = await this.settingsService.get(ctx);
        const draft = Object.assign(new InvoiceSettings(), current);
        for (const [key, value] of Object.entries(input)) {
            if (value !== undefined && value !== null) (draft as any)[key] = value;
        }
        return draft;
    }

    @Query()
    @Allow(Permission.ReadOrder)
    orderInvoiceList(
        @Ctx() ctx: RequestContext,
        @Args('options') options?: InvoiceListOptions,
    ) {
        return this.invoiceService.list(ctx, options ?? {});
    }

    @Query()
    @Allow(Permission.ReadOrder)
    invoicesForOrder(@Ctx() ctx: RequestContext, @Args('orderId') orderId: ID) {
        return this.invoiceService.findForOrder(ctx, orderId);
    }

    @Query()
    @Allow(Permission.ReadOrder)
    async invoicePdf(@Ctx() ctx: RequestContext, @Args('id') id: ID) {
        const invoice = await this.invoiceService.findOne(ctx, id);
        if (!invoice) throw new EntityNotFoundError('Invoice', id);
        const pdf = await this.pdfService.render(invoice.data);
        return pdf.toString('base64');
    }

    @Mutation()
    @Allow(Permission.UpdateSettings)
    updateInvoiceSettings(
        @Ctx() ctx: RequestContext,
        @Args('input') input: UpdateInvoiceSettingsInput,
    ) {
        return this.settingsService.update(ctx, input);
    }

    @Mutation()
    @Allow(Permission.UpdateOrder)
    issueInvoice(
        @Ctx() ctx: RequestContext,
        @Args('orderId') orderId: ID,
        @Args('sendEmail') sendEmail: boolean,
    ) {
        return this.invoiceService.issueForOrder(ctx, orderId, { sendEmail });
    }

    @Mutation()
    @Allow(Permission.UpdateOrder)
    issueCreditNote(
        @Ctx() ctx: RequestContext,
        @Args('invoiceId') invoiceId: ID,
        @Args('reason') reason: string,
        @Args('sendEmail') sendEmail: boolean,
    ) {
        return this.invoiceService.issueCreditNote(ctx, invoiceId, reason, { sendEmail });
    }

    @Mutation()
    @Allow(Permission.UpdateOrder)
    resendInvoiceEmail(@Ctx() ctx: RequestContext, @Args('id') id: ID) {
        return this.invoiceService.resendEmail(ctx, id);
    }
}

@Resolver('OrderInvoice')
export class OrderInvoiceEntityResolver {
    @ResolveField()
    downloadUrl(@Ctx() ctx: RequestContext, @Parent() invoice: Invoice) {
        return invoiceDownloadUrl(ctx, invoice.id, invoice.invoiceNumber);
    }
}

@Resolver('InvoiceSettings')
export class InvoiceSettingsEntityResolver {
    constructor(private settingsService: InvoiceSettingsService) {}

    @ResolveField()
    preview(@Ctx() ctx: RequestContext, @Parent() settings: InvoiceSettings) {
        return this.settingsService.preview(ctx, settings);
    }

    @ResolveField()
    stateOptions() {
        return GST_STATE_NAMES;
    }
}
