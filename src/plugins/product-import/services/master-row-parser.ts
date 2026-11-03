import type { OPNColumnKey } from './opn-column-map';
import type {
    OPNImportRow,
    OPNSourceCell,
} from './opn-import.types';
import {
    createProductIdentity,
    createVariantSku,
    normalizeText,
    optionalNumber,
} from './opn-normalization';

/**
 * The client's product master template (e.g. "MARS Petcare Master"): one row
 * per variant, rows of one product share the "SKU" column, which holds the
 * product name without its size. Columns:
 *
 * Vendor | Brand | UPC/EAN Code | SKU | Product Title | Product Description |
 * Product Features | Product Images | Gms | Variant | Casesize |
 * Shelf Life (Days) | L1 | L2 | MRP | GST | HSN | Status | STATUS RECHECKED
 *
 * L2 is "<pet>-<category>", e.g. "Cats-Litter" or "Dogs- Dry Food".
 * Product Images is a shared Dropbox (or Drive) folder per variant.
 */

type RawRow = Record<string, unknown>;

const normalizeHeader = (value: string): string =>
    value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

// Columns that only this template has, together
const TEMPLATE_HEADERS = ['producttitle', 'upceancode', 'l2'];

/** Whether a row (as sent by the dashboard) comes from the master template. */
export function isMasterTemplateRow(row: RawRow): boolean {
    const headers = new Set(Object.keys(row).map(normalizeHeader));
    return TEMPLATE_HEADERS.every(header => headers.has(header));
}

type Cell = { column: string; value: string };

function readCells(row: RawRow): Map<string, Cell> {
    const cells = new Map<string, Cell>();

    for (const [column, value] of Object.entries(row)) {
        if (!column.startsWith('__')) {
            cells.set(normalizeHeader(column), {
                column: column.trim(),
                value: normalizeText(value),
            });
        }
    }

    return cells;
}

/**
 * Pet and category from L2, in the form the category mapping expects (see
 * opn-category-map.ts): "Cats-Litter" is Cat / Clean & Hygiene / Cat Litter,
 * "Dogs- Dry Food" is Dog / Food / Dry Food, "Dog Treats + Others" is
 * Dog / Food / Treats.
 */
function categoryFromL2(l2: string, title: string): {
    petTypes: string[];
    primaryCategory: string;
    secondaryCategory: string;
    tertiaryCategory: string;
} {
    const text = l2.toLowerCase();
    const petText = /^\s*(dogs?|puppy|puppies)\b/.test(text)
        ? 'dog'
        : /^\s*(cats?|kittens?)\b/.test(text)
          ? 'cat'
          : title.toLowerCase();

    const petTypes: string[] = [];

    if (/\b(dogs?|puppy|puppies)\b/.test(petText)) petTypes.push('Dog');
    if (/\b(cats?|kittens?)\b/.test(petText)) petTypes.push('Cat');

    if (/litter/.test(text)) {
        return {
            petTypes,
            primaryCategory: 'Cleaning & Hygiene',
            secondaryCategory: '',
            tertiaryCategory: 'Litter',
        };
    }

    if (/treat/.test(text)) {
        return {
            petTypes,
            primaryCategory: 'Treats',
            secondaryCategory: '',
            tertiaryCategory: '',
        };
    }

    return {
        petTypes,
        primaryCategory: /food|dry|wet/.test(text) ? 'Food' : '',
        secondaryCategory: /\bdry\b/.test(text)
            ? 'Dry'
            : /\bwet\b/.test(text)
              ? 'Wet'
              : '',
        tertiaryCategory: '',
    };
}

/** One row of the master template as an import row. */
export function parseMasterRow(
    raw: RawRow,
    index: number,
): OPNImportRow {
    const cells = readCells(raw);
    const cell = (header: string): Cell | undefined =>
        cells.get(normalizeHeader(header));
    const text = (header: string): string => cell(header)?.value ?? '';
    const integer = (header: string): number | null => {
        const value = optionalNumber(text(header));
        return value === null ? null : Math.round(value);
    };

    const sheetName = normalizeText(raw.__sheetName);
    const rowNumberValue = Number(raw.__rowNumber);
    const rowNumber =
        Number.isSafeInteger(rowNumberValue) && rowNumberValue > 0
            ? rowNumberValue
            : index + 2;

    const brand = text('Brand') || sheetName;
    const title = text('Product Title');

    // "SKU" is the product name shared by all its sizes
    const identity = createProductIdentity(brand, text('SKU') || title);

    const weightInGrams = integer('Gms');
    const variant =
        text('Variant') ||
        (weightInGrams !== null ? `${weightInGrams} g` : '');

    // A barcode that reached us as "4.00843E+12" has lost digits; it is left
    // out rather than stored wrong or matched against another product
    const barcodeText = text('UPC/EAN Code');
    const barcode = /^\d+(\.\d+)?e[+-]?\d+$/i.test(barcodeText)
        ? ''
        : barcodeText;
    const shelfLifeDays = optionalNumber(text('Shelf Life (Days)'));
    const l2 = text('L2');
    const categories = categoryFromL2(l2, title);
    const description = text('Product Description');

    // Rows marked anything but active are imported, but not sold
    const statuses = [text('Status'), text('STATUS RECHECKED')]
        .map(value => value.toLowerCase())
        .filter(Boolean);
    const active = statuses.every(value => value === 'active');

    const images = cell('Product Images');
    const imageCells: OPNSourceCell[] = (images?.value ?? '')
        .split(/\s+/)
        .filter(value => /^https?:\/\//i.test(value))
        .map(value => ({ column: images?.column ?? 'Product Images', value }));

    // Original cells, for the import log
    const source: Partial<Record<OPNColumnKey, OPNSourceCell>> = {};
    const sourceColumns: Array<[OPNColumnKey, string]> = [
        ['productName', 'SKU'],
        ['brand', 'Brand'],
        ['barcode', 'UPC/EAN Code'],
        ['sku', 'Variant'],
        ['price', 'MRP'],
        ['weightInGrams', 'Gms'],
        ['casePack', 'Casesize'],
        ['shelfLifeYears', 'Shelf Life (Days)'],
        ['petType', 'L2'],
        ['primaryCategory', 'L2'],
        ['hsnCode', 'HSN'],
        ['gstPercentage', 'GST'],
        ['description', 'Product Description'],
        ['keyPoints', 'Product Features'],
        ['imageUrl', 'Product Images'],
        ['supplierName', 'Vendor'],
    ];

    for (const [key, header] of sourceColumns) {
        const found = cell(header);

        if (found) {
            source[key] = found;
        }
    }

    return {
        sheetName,
        rowNumber,
        source,

        productGroupKey: identity.productGroupKey,
        productName: identity.productName,
        productSlug: identity.productSlug,
        description,

        brand,
        petTypes: categories.petTypes,
        lifeStages: [],
        breedSizes: [],
        dietTypes: [],

        primaryCategory: categories.primaryCategory,
        secondaryCategory: categories.secondaryCategory,
        tertiaryCategory: categories.tertiaryCategory,

        isFood: /food|treat/i.test(l2),
        keyPoints: text('Product Features'),
        ingredients: '',
        analyticalConstituents: '',
        usageAndFeeding: '',

        countryOfOrigin: '',
        manufacturerName: text('Vendor'),
        manufacturerAddress: '',
        supplierName: text('Vendor'),

        itemCode: '',
        sku: createVariantSku(
            identity.productGroupKey,
            barcode,
            'Size',
            variant,
            rowNumber,
        ),
        barcode,
        asin: '',
        variantName: title || [identity.productName, variant].join(' '),

        optionGroup: 'Size',
        optionValue: variant,

        price: optionalNumber(text('MRP')) ?? 0,
        stock: 0,
        active,

        weightOrCount: null,
        unit: '',
        weightInGrams,
        packing: '',

        hsnCode: text('HSN'),
        gstPercentage: optionalNumber(text('GST')),
        casePack: integer('Casesize'),
        shelfLifeYears:
            shelfLifeDays === null
                ? null
                : Math.round((shelfLifeDays / 365) * 100) / 100,

        packageLengthCm: null,
        packageWidthCm: null,
        packageHeightCm: null,

        imageUrl: imageCells[0]?.value ?? '',
        imageCells,
    };
}
