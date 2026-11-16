/**
 * Invoice number formatting.
 *
 * The prefix and suffix may contain these tokens, replaced at issue time:
 *   {FY}       financial year, short   e.g. 26-27
 *   {FY_FULL}  financial year, long    e.g. 2026-27
 *   {YYYY}     calendar year           e.g. 2026
 *   {YY}       calendar year, short    e.g. 26
 *   {MM}       month                   e.g. 04
 *
 * GST rules (CGST Rule 46): an invoice number is at most 16 characters and
 * uses only letters, digits, "-" and "/". It must be unique for the
 * financial year.
 */

export const INVOICE_TOKENS = ['{FY}', '{FY_FULL}', '{YYYY}', '{YY}', '{MM}'];

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Date parts in India Standard Time, so the year/month match the invoice date. */
function istParts(date: Date) {
    const ist = new Date(date.getTime() + IST_OFFSET_MS);
    return { year: ist.getUTCFullYear(), month: ist.getUTCMonth() + 1 };
}

/** Indian financial year (1 April - 31 March), e.g. "2026-27". */
export function financialYear(date: Date): string {
    const { year, month } = istParts(date);
    const start = month >= 4 ? year : year - 1;
    return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export function applyTokens(template: string, date: Date): string {
    const { year, month } = istParts(date);
    const fy = financialYear(date);
    return template
        .replace(/\{FY_FULL\}/g, fy)
        .replace(/\{FY\}/g, fy.slice(2))
        .replace(/\{YYYY\}/g, String(year))
        .replace(/\{YY\}/g, String(year).slice(2))
        .replace(/\{MM\}/g, String(month).padStart(2, '0'));
}

export function formatInvoiceNumber(input: {
    prefix: string;
    suffix: string;
    padding: number;
    sequence: number;
    date: Date;
}): string {
    const padding = Math.min(Math.max(Math.trunc(input.padding) || 1, 1), 10);
    return (
        applyTokens(input.prefix ?? '', input.date) +
        String(input.sequence).padStart(padding, '0') +
        applyTokens(input.suffix ?? '', input.date)
    );
}

/** Returns a problem description, or null when the number is GST-valid. */
export function validateInvoiceNumber(value: string): string | null {
    if (!value) {
        return 'Invoice number is empty.';
    }
    if (value.length > 16) {
        return `"${value}" is ${value.length} characters; GST allows at most 16.`;
    }
    if (!/^[A-Za-z0-9\/-]+$/.test(value)) {
        return `"${value}" may only contain letters, digits, "-" and "/".`;
    }
    return null;
}
