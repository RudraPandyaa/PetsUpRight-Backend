/** GST state codes (first two digits of a GSTIN). */
const GST_STATES: Array<[string, string, string[]]> = [
    ['01', 'Jammu and Kashmir', ['jammu & kashmir', 'j&k']],
    ['02', 'Himachal Pradesh', []],
    ['03', 'Punjab', []],
    ['04', 'Chandigarh', []],
    ['05', 'Uttarakhand', ['uttaranchal']],
    ['06', 'Haryana', []],
    ['07', 'Delhi', ['new delhi', 'nct of delhi']],
    ['08', 'Rajasthan', []],
    ['09', 'Uttar Pradesh', ['up']],
    ['10', 'Bihar', []],
    ['11', 'Sikkim', []],
    ['12', 'Arunachal Pradesh', []],
    ['13', 'Nagaland', []],
    ['14', 'Manipur', []],
    ['15', 'Mizoram', []],
    ['16', 'Tripura', []],
    ['17', 'Meghalaya', []],
    ['18', 'Assam', []],
    ['19', 'West Bengal', []],
    ['20', 'Jharkhand', []],
    ['21', 'Odisha', ['orissa']],
    ['22', 'Chhattisgarh', ['chattisgarh']],
    ['23', 'Madhya Pradesh', ['mp']],
    ['24', 'Gujarat', []],
    ['26', 'Dadra and Nagar Haveli and Daman and Diu', ['daman and diu', 'dadra and nagar haveli', 'daman & diu']],
    ['27', 'Maharashtra', []],
    ['29', 'Karnataka', []],
    ['30', 'Goa', []],
    ['31', 'Lakshadweep', []],
    ['32', 'Kerala', []],
    ['33', 'Tamil Nadu', ['tamilnadu']],
    ['34', 'Puducherry', ['pondicherry']],
    ['35', 'Andaman and Nicobar Islands', ['andaman & nicobar islands']],
    ['36', 'Telangana', []],
    ['37', 'Andhra Pradesh', []],
    ['38', 'Ladakh', []],
];

const normalize = (value: string) =>
    value.toLowerCase().replace(/&/g, 'and').replace(/[^a-z]/g, '');

/** Returns the official name and code, or the input with an empty code if unknown. */
export function resolveGstState(input: string | null | undefined): { name: string; code: string } {
    const key = normalize(input ?? '');
    if (!key) return { name: '', code: '' };
    for (const [code, name, aliases] of GST_STATES) {
        if (normalize(name) === key || aliases.some(alias => normalize(alias) === key)) {
            return { name, code };
        }
    }
    return { name: String(input).trim(), code: '' };
}

export function isSameState(a: string, b: string): boolean {
    const first = resolveGstState(a);
    const second = resolveGstState(b);
    if (first.code && second.code) return first.code === second.code;
    return normalize(first.name) === normalize(second.name);
}

export const GST_STATE_NAMES = GST_STATES.map(([, name]) => name);
