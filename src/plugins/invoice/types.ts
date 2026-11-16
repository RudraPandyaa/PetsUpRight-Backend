/**
 * The invoice snapshot. Stored with the invoice when it is issued and never
 * changed afterwards, so the PDF always matches what was issued even if the
 * products, the order or the invoice settings change later.
 * All amounts are in paise (minor units).
 */

export type InvoiceType = 'INVOICE' | 'CREDIT_NOTE';
export type InvoiceStatus = 'ISSUED' | 'CANCELLED';
export type InvoiceTrigger = 'PAYMENT_SETTLED' | 'SHIPPED' | 'DELIVERED' | 'MANUAL';

export interface InvoiceParty {
    name: string;
    addressLines: string[];
    state: string;
    stateCode: string;
    gstin?: string;
    email?: string;
    phone?: string;
}

export interface InvoiceLineSnapshot {
    description: string;
    sku: string;
    hsn: string;
    quantity: number;
    /** Unit price before tax and before discounts. */
    unitPrice: number;
    /** Discount on the whole line, before tax. */
    discount: number;
    /** Line value after discounts, before tax. */
    taxableValue: number;
    taxRate: number;
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
}

export interface InvoiceTaxRow {
    hsn: string;
    taxRate: number;
    taxableValue: number;
    cgst: number;
    sgst: number;
    igst: number;
}

export interface InvoiceSnapshot {
    type: InvoiceType;
    title: string;
    invoiceNumber: string;
    issuedAt: string;
    orderCode: string;
    orderDate: string | null;
    /** Credit notes: the invoice they reverse. */
    reference?: { invoiceNumber: string; issuedAt: string };
    reason?: string;
    seller: InvoiceParty & { pan?: string; legalName: string };
    billTo: InvoiceParty;
    shipTo: InvoiceParty;
    placeOfSupply: string;
    interState: boolean;
    reverseCharge: boolean;
    lines: InvoiceLineSnapshot[];
    taxRows: InvoiceTaxRow[];
    totals: {
        taxableValue: number;
        cgst: number;
        sgst: number;
        igst: number;
        totalTax: number;
        roundOff: number;
        grandTotal: number;
        amountInWords: string;
    };
    payment: { method: string; reference: string; status: string } | null;
    currencyCode: string;
    notes: string;
    footerText: string;
    signatoryLabel: string;
    logoUrl: string;
}
