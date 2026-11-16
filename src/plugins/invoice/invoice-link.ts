import * as crypto from 'crypto';
import { ID, RequestContext } from '@vendure/core';

import { invoiceLinkSecret } from './constants';

/** Signed token for a customer download link (no login needed, unguessable). */
export function invoiceToken(id: ID, invoiceNumber: string): string {
    return crypto
        .createHmac('sha256', invoiceLinkSecret())
        .update(`${id}|${invoiceNumber}`)
        .digest('hex')
        .slice(0, 40);
}

export function verifyInvoiceToken(id: ID, invoiceNumber: string, token: string): boolean {
    const expected = Buffer.from(invoiceToken(id, invoiceNumber));
    const received = Buffer.from(String(token ?? ''));
    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

/**
 * Public address of this backend, for links in emails and the storefront.
 * BACKEND_PUBLIC_URL wins; otherwise it is taken from the current request.
 */
export function backendBaseUrl(ctx?: RequestContext): string {
    const configured = process.env.BACKEND_PUBLIC_URL?.trim();
    if (configured) return configured.replace(/\/+$/, '');
    const req = ctx?.req;
    const host = req?.get?.('x-forwarded-host') ?? req?.get?.('host');
    if (host) {
        const proto = (req?.get?.('x-forwarded-proto') ?? req?.protocol ?? 'http').split(',')[0].trim();
        return `${proto}://${host}`;
    }
    return `http://localhost:${process.env.PORT || process.env.VENDURE_SERVER_PORT || 3000}`;
}

export function invoiceDownloadUrl(ctx: RequestContext | undefined, id: ID, invoiceNumber: string): string {
    return `${backendBaseUrl(ctx)}/invoices/${id}/pdf?token=${invoiceToken(id, invoiceNumber)}`;
}

/** e.g. "INV/26-27/0001" -> "INV-26-27-0001.pdf" */
export function invoiceFileName(invoiceNumber: string): string {
    return `${invoiceNumber.replace(/[^A-Za-z0-9-]+/g, '-')}.pdf`;
}
