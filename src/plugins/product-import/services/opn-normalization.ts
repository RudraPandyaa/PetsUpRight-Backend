import {
    DIET_TYPE_ALIASES,
    PET_TYPE_ALIASES,
} from './opn-taxonomy';

export function normalizeText(value: unknown): string {
    return String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim();
}

export function slugify(value: string): string {
    return normalizeText(value)
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export function optionalNumber(
    value: unknown,
): number | null {
    const text = normalizeText(value)
        .replace(/[₹,%]/g, '')
        .replace(/,/g, '');

    if (!text) {
        return null;
    }

    const result = Number(text);

    return Number.isFinite(result) ? result : null;
}

function splitValues(value: unknown): string[] {
    return normalizeText(value)
        .split(/\s*(?:\||,|&|\/)\s*/g)
        .map(item => normalizeText(item))
        .filter(Boolean);
}

export function normalizePetTypes(
    value: unknown,
): string[] {
    return [
        ...new Set(
            splitValues(value).map(item => {
                const key = item.toLowerCase();

                return PET_TYPE_ALIASES[key] ?? item;
            }),
        ),
    ];
}

export function normalizeDietTypes(
    value: unknown,
): string[] {
    return [
        ...new Set(
            splitValues(value).map(item => {
                const key = item.toLowerCase();

                return DIET_TYPE_ALIASES[key] ?? item;
            }),
        ),
    ];
}

export function normalizeList(
    value: unknown,
): string[] {
    return [
        ...new Set(
            splitValues(value),
        ),
    ];
}

export function createVariantOption(
    weightOrCount: number | null,
    unitValue: unknown,
): {
    group: 'Weight' | 'Count' | 'Size';
    value: string;
} {
    const unit = normalizeText(unitValue);
    const normalizedUnit = unit.toLowerCase();

    const countUnits = [
        'qty',
        'count',
        'piece',
        'pieces',
        'pc',
        'pcs',
        'bags',
        'wipes',
    ];

    const group = countUnits.includes(normalizedUnit)
        ? 'Count'
        : weightOrCount !== null
          ? 'Weight'
          : 'Size';

    const value = [
        weightOrCount !== null ? String(weightOrCount) : '',
        unit,
    ]
        .filter(Boolean)
        .join(' ');

    return {
        group,
        value,
    };
}

export function removeVariantSuffix(
    productName: string,
): string {
    const cleaned = normalizeText(productName);

    return cleaned
        .replace(
            /\s*[-–(]?\s*\d+(?:\.\d+)?\s*(?:kg|g|gm|gram|grams|ml|l|ltr|litre|litres|qty|count|pc|pcs|piece|pieces|bag|bags|wipe|wipes)\s*\)?\s*$/i,
            '',
        )
        .trim();
}

export function createProductIdentity(
    brand: string,
    productName: string,
): {
    productGroupKey: string;
    productName: string;
    productSlug: string;
} {
    const baseName =
        removeVariantSuffix(productName) ||
        normalizeText(productName);

    const groupKey = slugify(
        `${normalizeText(brand)}-${baseName}`,
    );

    return {
        productGroupKey: groupKey,
        productName: baseName,
        productSlug: groupKey,
    };
}