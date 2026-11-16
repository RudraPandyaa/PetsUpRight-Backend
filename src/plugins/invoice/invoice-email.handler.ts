import { Logger } from '@vendure/core';
import { EmailEventListener } from '@vendure/email-plugin';

import { loggerCtx } from './constants';
import { InvoiceIssuedEvent } from './events/invoice-issued.event';
import { invoiceDownloadUrl, invoiceFileName } from './invoice-link';
import { InvoicePdfService } from './services/invoice-pdf.service';
import { InvoiceService } from './services/invoice.service';

const formatMoney = (paise: number) =>
    `Rs. ${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Emails the invoice / credit note PDF to the customer. */
export const invoiceEmailHandler = new EmailEventListener('invoice-issued')
    .on(InvoiceIssuedEvent)
    .filter(event => event.sendEmail && Boolean(event.invoice.customerEmail))
    .loadData(async ({ event, injector }) => {
        const pdf = await injector.get(InvoicePdfService).render(event.invoice.data);
        await injector
            .get(InvoiceService)
            .markEmailed(event.ctx, event.invoice.id)
            .catch(error => Logger.warn(`Could not record emailedAt: ${String(error)}`, loggerCtx));
        return { pdfBase64: pdf.toString('base64') };
    })
    .setRecipient(event => event.invoice.customerEmail as string)
    .setFrom('{{ fromAddress }}')
    .setSubject(event =>
        event.invoice.type === 'CREDIT_NOTE'
            ? `Credit note ${event.invoice.invoiceNumber} for order ${event.invoice.orderCode}`
            : `Your invoice ${event.invoice.invoiceNumber} for order ${event.invoice.orderCode}`,
    )
    .setAttachments(event => [
        {
            filename: invoiceFileName(event.invoice.invoiceNumber),
            content: Buffer.from(event.data.pdfBase64, 'base64'),
            contentType: 'application/pdf',
        },
    ])
    .setTemplateVars(event => {
        const isCredit = event.invoice.type === 'CREDIT_NOTE';
        return {
            isCreditNote: isCredit,
            documentTitle: isCredit ? 'Credit note' : 'Tax invoice',
            customerName: event.invoice.customerName,
            invoiceNumber: event.invoice.invoiceNumber,
            invoiceDate: new Date(event.invoice.issuedAt).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                timeZone: 'Asia/Kolkata',
            }),
            orderCode: event.invoice.orderCode,
            total: formatMoney(event.invoice.totalWithTax),
            referenceNumber: event.invoice.data.reference?.invoiceNumber ?? '',
            reason: event.invoice.reason ?? '',
            downloadUrl: invoiceDownloadUrl(event.ctx, event.invoice.id, event.invoice.invoiceNumber),
        };
    });
