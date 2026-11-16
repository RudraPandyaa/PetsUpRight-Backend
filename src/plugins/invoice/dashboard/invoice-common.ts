import { api } from '@vendure/dashboard';
import { graphql } from '@/gql';

export interface OrderInvoice {
    id: string;
    orderId: string;
    orderCode: string;
    customerName: string;
    customerEmail?: string | null;
    type: 'INVOICE' | 'CREDIT_NOTE';
    status: 'ISSUED' | 'CANCELLED';
    invoiceNumber: string;
    financialYear: string;
    issuedAt: string;
    totalWithTax: number;
    taxTotal: number;
    relatedInvoiceId?: string | null;
    reason?: string | null;
    emailedAt?: string | null;
}

const invoicePdfQuery = graphql(`
    query InvoicePdf($id: ID!) {
        invoicePdf(id: $id)
    }
`);

export const issueInvoiceMutation = graphql(`
    mutation IssueInvoice($orderId: ID!, $sendEmail: Boolean) {
        issueInvoice(orderId: $orderId, sendEmail: $sendEmail) {
            id
            invoiceNumber
        }
    }
`);

export const issueCreditNoteMutation = graphql(`
    mutation IssueCreditNote($invoiceId: ID!, $reason: String!, $sendEmail: Boolean) {
        issueCreditNote(invoiceId: $invoiceId, reason: $reason, sendEmail: $sendEmail) {
            id
            invoiceNumber
        }
    }
`);

export const resendInvoiceEmailMutation = graphql(`
    mutation ResendInvoiceEmail($id: ID!) {
        resendInvoiceEmail(id: $id) {
            id
            customerEmail
        }
    }
`);

export const formatMoney = (paise: number) =>
    `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatDate = (iso?: string | null) =>
    iso
        ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        : '-';

export const errorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message.replace(/^\[GraphQL\]\s*/, '') : fallback;

/** Fetches the PDF through the admin API and opens it in a new tab. */
export async function openInvoicePdf(invoice: Pick<OrderInvoice, 'id' | 'invoiceNumber'>) {
    // Open the tab first so pop-up blockers allow it.
    const tab = window.open('', '_blank');
    const result: any = await api.query(invoicePdfQuery, { id: invoice.id });
    const bytes = Uint8Array.from(atob(result.invoicePdf), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    if (tab) {
        tab.location.href = url;
    } else {
        const link = document.createElement('a');
        link.href = url;
        link.download = `${invoice.invoiceNumber.replace(/[^A-Za-z0-9-]+/g, '-')}.pdf`;
        link.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const typeLabel = (type: OrderInvoice['type']) => (type === 'CREDIT_NOTE' ? 'Credit note' : 'Invoice');
