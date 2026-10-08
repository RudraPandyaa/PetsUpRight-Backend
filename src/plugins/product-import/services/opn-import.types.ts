import type { OPNColumnKey } from './opn-column-map';

/** A cell as it appeared in the uploaded workbook. */
export type OPNSourceCell = {
    column: string;
    value: string;
};

export type OPNImportRow = {
    sheetName: string;
    rowNumber: number;

    // Original column header and cell text for each field, for import logs.
    source: Partial<Record<OPNColumnKey, OPNSourceCell>>;

    // Product grouping
    productGroupKey: string;
    productName: string;
    productSlug: string;
    description: string;

    // Product classification
    brand: string;
    petTypes: string[];
    lifeStages: string[];
    breedSizes: string[];
    dietTypes: string[];

    primaryCategory: string;
    secondaryCategory: string;
    tertiaryCategory: string;

    // Product content
    isFood: boolean;
    keyPoints: string;
    ingredients: string;
    analyticalConstituents: string;
    usageAndFeeding: string;

    countryOfOrigin: string;
    manufacturerName: string;
    manufacturerAddress: string;
    supplierName: string;

    // Variant identity
    itemCode: string;
    sku: string;
    barcode: string;
    asin: string;
    variantName: string;

    // Variant option
    optionGroup: 'Weight' | 'Count' | 'Size';
    optionValue: string;

    // Price and stock
    price: number;
    stock: number;

    // Variant measurements
    weightOrCount: number | null;
    unit: string;
    weightInGrams: number | null;
    packing: string;

    // Tax and operational fields
    hsnCode: string;
    gstPercentage: number | null;
    casePack: number | null;
    shelfLifeYears: number | null;

    // Package measurements
    packageLengthCm: number | null;
    packageWidthCm: number | null;
    packageHeightCm: number | null;

    imageUrl: string;
    // Every image link in the row (all image columns), in column order
    imageCells: OPNSourceCell[];
};