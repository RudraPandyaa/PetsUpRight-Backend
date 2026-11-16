const ONES = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowHundred(n: number): string {
    if (n < 20) return ONES[n];
    return `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`;
}

function belowThousand(n: number): string {
    const hundreds = Math.floor(n / 100);
    const rest = n % 100;
    return [hundreds ? `${ONES[hundreds]} Hundred` : '', rest ? belowHundred(rest) : '']
        .filter(Boolean)
        .join(' ');
}

/** Indian numbering: crore, lakh, thousand. */
function integerToWords(n: number): string {
    if (n === 0) return 'Zero';
    const parts: string[] = [];
    const crore = Math.floor(n / 10_000_000);
    const lakh = Math.floor((n % 10_000_000) / 100_000);
    const thousand = Math.floor((n % 100_000) / 1000);
    const rest = n % 1000;
    if (crore) parts.push(`${integerToWords(crore)} Crore`);
    if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
    if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
    if (rest) parts.push(belowThousand(rest));
    return parts.join(' ');
}

/** e.g. 238284 paise -> "Indian Rupees Two Thousand Three Hundred Eighty Two and Eighty Four Paise Only" */
export function amountInWords(paise: number): string {
    const abs = Math.abs(Math.round(paise));
    const rupees = Math.floor(abs / 100);
    const p = abs % 100;
    return `Indian Rupees ${integerToWords(rupees)}${p ? ` and ${belowHundred(p)} Paise` : ''} Only`;
}
