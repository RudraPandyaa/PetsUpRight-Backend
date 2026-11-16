import { api, Badge, Button, toast } from '@vendure/dashboard';
import { graphql } from '@/gql';
import { useCallback, useEffect, useState } from 'react';

import {
    errorMessage,
    formatDate,
    formatMoney,
    issueCreditNoteMutation,
    issueInvoiceMutation,
    OrderInvoice,
    openInvoicePdf,
    resendInvoiceEmailMutation,
    typeLabel,
} from './invoice-common';

const invoicesForOrderQuery = graphql(`
    query InvoicesForOrder($orderId: ID!) {
        invoicesForOrder(orderId: $orderId) {
            id
            orderId
            orderCode
            customerName
            customerEmail
            type
            status
            invoiceNumber
            financialYear
            issuedAt
            totalWithTax
            taxTotal
            relatedInvoiceId
            reason
            emailedAt
        }
    }
`);

const INVOICEABLE = ['PaymentSettled', 'PartiallyShipped', 'Shipped', 'PartiallyDelivered', 'Delivered'];

/** "Invoices" block on the order detail page. */
export function OrderInvoicesBlock({ context }: { context: { entity?: any } }) {
    const order = context.entity;
    const [invoices, setInvoices] = useState<OrderInvoice[] | null>(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        if (!order?.id) return;
        try {
            const result: any = await api.query(invoicesForOrderQuery, { orderId: order.id });
            setInvoices(result.invoicesForOrder);
        } catch (error) {
            toast.error(errorMessage(error, 'Could not load invoices'));
        }
    }, [order?.id]);

    // Reload when the order changes state (e.g. paid -> invoice issued automatically).
    useEffect(() => {
        void load();
    }, [load, order?.state]);

    async function run(action: () => Promise<void>) {
        setBusy(true);
        try {
            await action();
        } catch (error) {
            toast.error(errorMessage(error, 'Something went wrong'));
        } finally {
            setBusy(false);
        }
    }

    const issue = () =>
        run(async () => {
            if (!window.confirm(`Issue a GST tax invoice for order ${order.code}? This uses the next invoice number.`)) return;
            const email = order.customer?.emailAddress;
            const sendEmail = email ? window.confirm(`Email the invoice PDF to ${email}?`) : false;
            const result: any = await api.mutate(issueInvoiceMutation, { orderId: order.id, sendEmail });
            toast.success(`Invoice ${result.issueInvoice.invoiceNumber} issued${sendEmail ? ' and emailed' : ''}`);
            await load();
        });

    const creditNote = (invoice: OrderInvoice) =>
        run(async () => {
            const reason = window.prompt(
                `Issue a credit note cancelling ${invoice.invoiceNumber} (${formatMoney(invoice.totalWithTax)})?\n\nReason:`,
                'Order cancelled',
            );
            if (reason === null) return;
            const result: any = await api.mutate(issueCreditNoteMutation, {
                invoiceId: invoice.id,
                reason: reason || 'Order cancelled',
                sendEmail: true,
            });
            toast.success(`Credit note ${result.issueCreditNote.invoiceNumber} issued`);
            await load();
        });

    const resend = (invoice: OrderInvoice) =>
        run(async () => {
            if (!window.confirm(`Email ${invoice.invoiceNumber} to ${invoice.customerEmail}?`)) return;
            await api.mutate(resendInvoiceEmailMutation, { id: invoice.id });
            toast.success(`Emailing ${invoice.invoiceNumber}`);
            setTimeout(() => void load(), 1500);
        });

    if (!order?.id) return null;
    if (invoices === null) {
        return <p className="text-sm text-muted-foreground">Loading…</p>;
    }

    const hasActiveInvoice = invoices.some(invoice => invoice.type === 'INVOICE' && invoice.status === 'ISSUED');
    const canIssue = INVOICEABLE.includes(order.state) && !hasActiveInvoice;

    return (
        <div className="space-y-3">
            {!invoices.length && (
                <p className="text-sm text-muted-foreground">
                    {INVOICEABLE.includes(order.state)
                        ? 'No invoice yet.'
                        : 'An invoice can be issued once payment is settled.'}
                </p>
            )}

            {invoices.map(invoice => (
                <div key={invoice.id} className="space-y-2 rounded-md border p-3">
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <div className="font-mono text-sm font-semibold">{invoice.invoiceNumber}</div>
                            <div className="text-xs text-muted-foreground">
                                {typeLabel(invoice.type)} · {formatDate(invoice.issuedAt)} ·{' '}
                                {formatMoney(invoice.totalWithTax)}
                            </div>
                        </div>
                        {invoice.status === 'CANCELLED' ? (
                            <Badge variant="destructive">Cancelled</Badge>
                        ) : (
                            <Badge variant="success">Issued</Badge>
                        )}
                    </div>
                    {invoice.reason && <div className="text-xs text-muted-foreground">Reason: {invoice.reason}</div>}
                    <div className="text-xs text-muted-foreground">
                        {invoice.emailedAt ? `Emailed ${formatDate(invoice.emailedAt)}` : 'Not emailed'}
                    </div>
                    <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => openInvoicePdf(invoice))}>
                            View PDF
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={busy || !invoice.customerEmail}
                            onClick={() => resend(invoice)}
                        >
                            Email
                        </Button>
                        {invoice.type === 'INVOICE' && invoice.status === 'ISSUED' && (
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => creditNote(invoice)}>
                                Credit note
                            </Button>
                        )}
                    </div>
                </div>
            ))}

            {canIssue && (
                <Button size="sm" disabled={busy} onClick={issue}>
                    {invoices.length ? 'Issue new invoice' : 'Issue invoice'}
                </Button>
            )}
        </div>
    );
}
