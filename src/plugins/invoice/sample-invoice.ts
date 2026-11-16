import { amountInWords } from './amount-in-words';
import { InvoiceSettings } from './entities/invoice-settings.entity';
import { resolveGstState } from './gst-states';
import { sellerFromSettings } from './services/invoice.service';
import { InvoiceLineSnapshot, InvoiceSnapshot, InvoiceTaxRow } from './types';

/**
 * A made-up invoice built from the given (possibly unsaved) settings, so the
 * admin can see exactly how real invoices will look before issuing any.
 */
export function buildSampleSnapshot(
    settings: InvoiceSettings,
    invoiceNumber: string,
    options: { interState: boolean },
): InvoiceSnapshot {
    const seller = sellerFromSettings(settings);
    const buyerState = options.interState
        ? resolveGstState(seller.state === 'Maharashtra' ? 'Karnataka' : 'Maharashtra')
        : resolveGstState(seller.state || 'Gujarat');
    const city = options.interState ? (buyerState.name === 'Karnataka' ? 'Bengaluru' : 'Mumbai') : 'Ahmedabad';
    const pin = options.interState ? (buyerState.name === 'Karnataka' ? '560001' : '400001') : '380015';

    const split = (tax: number) =>
        options.interState
            ? { cgst: 0, sgst: 0, igst: tax }
            : { cgst: Math.floor(tax / 2), sgst: tax - Math.floor(tax / 2), igst: 0 };

    // Prices include 18% GST, as in the store.
    const line = (
        description: string,
        sku: string,
        hsn: string,
        quantity: number,
        unitPriceWithTax: number,
        discountWithTax: number,
        rate: number,
    ): InvoiceLineSnapshot => {
        const total = unitPriceWithTax * quantity - discountWithTax;
        const taxable = Math.round(total / (1 + rate / 100));
        const unitPrice = Math.round(unitPriceWithTax / (1 + rate / 100));
        return {
            description,
            sku,
            hsn,
            quantity,
            unitPrice,
            discount: Math.max(unitPrice * quantity - taxable, 0),
            taxableValue: taxable,
            taxRate: rate,
            ...split(total - taxable),
            total,
        };
    };

    const lines = [
        line('Premium Grain-Free Dry Dog Food (Salmon) 2 kg', 'SAMPLE-DOG-FOOD-2KG', '23091000', 1, 225000, 0, 18),
        line('Natural Healing Gel for Dogs & Cats 40 g', 'SAMPLE-HEALING-GEL', '30049099', 2, 29900, 5000, 18),
        line('Shipping charges (Courier)', '', settings.shippingSac || '996812', 1, 13284, 0, 0),
    ];

    const sum = (key: keyof InvoiceLineSnapshot) => lines.reduce((acc, l) => acc + (l[key] as number), 0);
    const rows = new Map<string, InvoiceTaxRow>();
    for (const l of lines) {
        const key = `${l.hsn}|${l.taxRate}`;
        const row = rows.get(key) ?? { hsn: l.hsn, taxRate: l.taxRate, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 };
        row.taxableValue += l.taxableValue;
        row.cgst += l.cgst;
        row.sgst += l.sgst;
        row.igst += l.igst;
        rows.set(key, row);
    }

    const buyer = {
        name: 'Sample Customer',
        addressLines: ['12, Sample Residency, Example Road', `${city} - ${pin}`, `${buyerState.name}, India`],
        state: buyerState.name,
        stateCode: buyerState.code,
        email: 'customer@example.com',
        phone: '9876543210',
    };
    const now = new Date();
    const grandTotal = sum('total');
    const cgst = sum('cgst');
    const sgst = sum('sgst');
    const igst = sum('igst');

    return {
        type: 'INVOICE',
        title: 'TAX INVOICE',
        invoiceNumber,
        issuedAt: now.toISOString(),
        orderCode: 'SAMPLE12345',
        orderDate: now.toISOString(),
        seller,
        billTo: buyer,
        shipTo: buyer,
        placeOfSupply: `${buyerState.name} (${buyerState.code})`,
        interState: options.interState,
        reverseCharge: false,
        lines,
        taxRows: [...rows.values()],
        totals: {
            taxableValue: sum('taxableValue'),
            cgst,
            sgst,
            igst,
            totalTax: cgst + sgst + igst,
            roundOff: 0,
            grandTotal,
            amountInWords: amountInWords(grandTotal),
        },
        payment: { method: 'Online (Razorpay)', reference: 'pay_SAMPLE123', status: 'Paid' },
        currencyCode: 'INR',
        notes: settings.notes,
        footerText: settings.footerText,
        signatoryLabel: settings.signatoryLabel,
        logoUrl: settings.logoUrl,
    };
}
