import {
    api,
    Badge,
    Button,
    Input,
    Page,
    PageBlock,
    PageLayout,
    PageTitle,
    toast,
} from '@vendure/dashboard';
import { graphql } from '@/gql';
import { useCallback, useEffect, useState } from 'react';

import {
    errorMessage,
    formatDate,
    formatMoney,
    issueCreditNoteMutation,
    OrderInvoice,
    openInvoicePdf,
    resendInvoiceEmailMutation,
    typeLabel,
} from './invoice-common';

const listQuery = graphql(`
    query OrderInvoiceList($options: OrderInvoiceListOptions) {
        orderInvoiceList(options: $options) {
            totalItems
            items {
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
    }
`);

const PAGE_SIZE = 25;

export function InvoicesPage() {
    const [items, setItems] = useState<OrderInvoice[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [search, setSearch] = useState('');
    const [appliedSearch, setAppliedSearch] = useState('');
    const [type, setType] = useState<'' | 'INVOICE' | 'CREDIT_NOTE'>('');
    const [loading, setLoading] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const result: any = await api.query(listQuery, {
                options: {
                    skip: page * PAGE_SIZE,
                    take: PAGE_SIZE,
                    search: appliedSearch || undefined,
                    type: type || undefined,
                },
            });
            setItems(result.orderInvoiceList.items);
            setTotal(result.orderInvoiceList.totalItems);
        } catch (error) {
            toast.error(errorMessage(error, 'Could not load invoices'));
        } finally {
            setLoading(false);
        }
    }, [page, appliedSearch, type]);

    useEffect(() => {
        void load();
    }, [load]);

    // Search as you type, with a short delay.
    useEffect(() => {
        const timer = setTimeout(() => {
            setPage(0);
            setAppliedSearch(search.trim());
        }, 350);
        return () => clearTimeout(timer);
    }, [search]);

    async function run(id: string, action: () => Promise<void>) {
        setBusyId(id);
        try {
            await action();
        } finally {
            setBusyId(null);
        }
    }

    const resend = (invoice: OrderInvoice) =>
        run(invoice.id, async () => {
            if (!window.confirm(`Email ${invoice.invoiceNumber} to ${invoice.customerEmail}?`)) return;
            try {
                await api.mutate(resendInvoiceEmailMutation, { id: invoice.id });
                toast.success(`Emailing ${invoice.invoiceNumber} to ${invoice.customerEmail}`);
                setTimeout(() => void load(), 1500);
            } catch (error) {
                toast.error(errorMessage(error, 'Could not send the email'));
            }
        });

    const creditNote = (invoice: OrderInvoice) =>
        run(invoice.id, async () => {
            const reason = window.prompt(
                `Issue a credit note cancelling ${invoice.invoiceNumber} (${formatMoney(invoice.totalWithTax)})?\n\nReason:`,
                'Order cancelled',
            );
            if (reason === null) return;
            try {
                const result: any = await api.mutate(issueCreditNoteMutation, {
                    invoiceId: invoice.id,
                    reason: reason || 'Order cancelled',
                    sendEmail: true,
                });
                toast.success(`Credit note ${result.issueCreditNote.invoiceNumber} issued`);
                await load();
            } catch (error) {
                toast.error(errorMessage(error, 'Could not issue the credit note'));
            }
        });

    const pdf = (invoice: OrderInvoice) =>
        run(invoice.id, async () => {
            try {
                await openInvoicePdf(invoice);
            } catch (error) {
                toast.error(errorMessage(error, 'Could not open the PDF'));
            }
        });

    const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

    return (
        <Page pageId="invoices">
            <PageTitle>Invoices</PageTitle>
            <PageLayout>
                <PageBlock column="main" blockId="invoice-list">
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <Input
                                value={search}
                                onChange={event => setSearch(event.target.value)}
                                placeholder="Search invoice no., order code, customer…"
                                aria-label="Search invoices"
                                className="max-w-sm"
                            />
                            <select
                                value={type}
                                onChange={event => {
                                    setPage(0);
                                    setType(event.target.value as typeof type);
                                }}
                                aria-label="Document type"
                                className="h-9 rounded-md border bg-background px-3 text-sm"
                            >
                                <option value="">All documents</option>
                                <option value="INVOICE">Invoices</option>
                                <option value="CREDIT_NOTE">Credit notes</option>
                            </select>
                            <span className="ml-auto text-sm text-muted-foreground">
                                {loading ? 'Loading…' : `${total} document${total === 1 ? '' : 's'}`}
                            </span>
                        </div>

                        <div className="overflow-x-auto rounded-md border">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50 text-left">
                                    <tr>
                                        <th className="px-3 py-2 font-medium">Number</th>
                                        <th className="px-3 py-2 font-medium">Type</th>
                                        <th className="px-3 py-2 font-medium">Date</th>
                                        <th className="px-3 py-2 font-medium">Order</th>
                                        <th className="px-3 py-2 font-medium">Customer</th>
                                        <th className="px-3 py-2 text-right font-medium">Total</th>
                                        <th className="px-3 py-2 font-medium">Status</th>
                                        <th className="px-3 py-2 font-medium">Emailed</th>
                                        <th className="px-3 py-2 text-right font-medium">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {!items.length && !loading && (
                                        <tr>
                                            <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                                                {appliedSearch || type
                                                    ? 'No documents match.'
                                                    : 'No invoices yet. They are issued automatically (see Settings › Invoice settings) or from an order page.'}
                                            </td>
                                        </tr>
                                    )}
                                    {items.map(invoice => (
                                        <tr key={invoice.id} className="border-t">
                                            <td className="px-3 py-2 font-mono font-medium">{invoice.invoiceNumber}</td>
                                            <td className="px-3 py-2">{typeLabel(invoice.type)}</td>
                                            <td className="px-3 py-2 whitespace-nowrap">{formatDate(invoice.issuedAt)}</td>
                                            <td className="px-3 py-2">
                                                <a
                                                    href={`/dashboard/orders/${invoice.orderId}`}
                                                    className="font-mono text-primary hover:underline"
                                                >
                                                    {invoice.orderCode}
                                                </a>
                                            </td>
                                            <td className="px-3 py-2">
                                                <div>{invoice.customerName}</div>
                                                <div className="text-xs text-muted-foreground">{invoice.customerEmail}</div>
                                            </td>
                                            <td className="px-3 py-2 text-right whitespace-nowrap">
                                                {invoice.type === 'CREDIT_NOTE' ? '−' : ''}
                                                {formatMoney(invoice.totalWithTax)}
                                            </td>
                                            <td className="px-3 py-2">
                                                {invoice.status === 'CANCELLED' ? (
                                                    <Badge variant="destructive">Cancelled</Badge>
                                                ) : (
                                                    <Badge variant="success">Issued</Badge>
                                                )}
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                                                {invoice.emailedAt ? formatDate(invoice.emailedAt) : 'Not sent'}
                                            </td>
                                            <td className="px-3 py-2">
                                                <div className="flex justify-end gap-1">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        disabled={busyId === invoice.id}
                                                        onClick={() => pdf(invoice)}
                                                    >
                                                        PDF
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        disabled={busyId === invoice.id || !invoice.customerEmail}
                                                        onClick={() => resend(invoice)}
                                                    >
                                                        Email
                                                    </Button>
                                                    {invoice.type === 'INVOICE' && invoice.status === 'ISSUED' && (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            disabled={busyId === invoice.id}
                                                            onClick={() => creditNote(invoice)}
                                                        >
                                                            Credit note
                                                        </Button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {pages > 1 && (
                            <div className="flex items-center justify-end gap-2 text-sm">
                                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                                    Previous
                                </Button>
                                <span>
                                    Page {page + 1} of {pages}
                                </span>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={page + 1 >= pages}
                                    onClick={() => setPage(p => p + 1)}
                                >
                                    Next
                                </Button>
                            </div>
                        )}
                    </div>
                </PageBlock>
            </PageLayout>
        </Page>
    );
}
