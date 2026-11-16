import { Controller, Get, NotFoundException, Param, Query, Res } from '@nestjs/common';
import { Ctx, RequestContext } from '@vendure/core';
import type { Response } from 'express';

import { invoiceFileName, verifyInvoiceToken } from '../invoice-link';
import { InvoicePdfService } from '../services/invoice-pdf.service';
import { InvoiceService } from '../services/invoice.service';

/** GET /invoices/:id/pdf?token=... - the link in customer emails and the storefront. */
@Controller('invoices')
export class InvoiceDownloadController {
    constructor(
        private invoiceService: InvoiceService,
        private pdfService: InvoicePdfService,
    ) {}

    @Get(':id/pdf')
    async download(
        @Ctx() ctx: RequestContext,
        @Param('id') id: string,
        @Query('token') token: string,
        @Query('download') download: string | undefined,
        @Res() res: Response,
    ) {
        const invoice = /^\d+$/.test(id) ? await this.invoiceService.findOne(ctx, id) : null;
        // Same response for "missing" and "bad token", so ids cannot be probed.
        if (!invoice || !verifyInvoiceToken(invoice.id, invoice.invoiceNumber, token)) {
            throw new NotFoundException();
        }

        const pdf = await this.pdfService.render(invoice.data);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', String(pdf.length));
        res.setHeader(
            'Content-Disposition',
            `${download === '1' ? 'attachment' : 'inline'}; filename="${invoiceFileName(invoice.invoiceNumber)}"`,
        );
        res.setHeader('Cache-Control', 'private, max-age=300');
        res.setHeader('X-Robots-Tag', 'noindex');
        res.end(pdf);
    }
}
