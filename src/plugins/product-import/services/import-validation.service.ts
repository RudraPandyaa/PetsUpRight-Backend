import { Injectable } from '@nestjs/common';
import { ImportRow } from './spreadsheet-parser.service';
import {
    OPN_COLUMN_ALIASES,
    type OPNColumnKey,
} from './opn-column-map';
import type {
    OPNImportRow,
    OPNSourceCell,
} from './opn-import.types';

export type ImportIssueKind =
    | 'row-skipped'
    | 'product-skipped'
    | 'product-failed'
    | 'image-failed';

export type ImportIssue = {
    row: number;
    message: string;
    // The fields below are only used for the import log file.
    kind?: ImportIssueKind;
    sheetName?: string;
    rows?: number[];
    productName?: string;
    cells?: OPNSourceCell[];
    problem?: string;
};

const norm = (s: string) => s.trim().toLowerCase();

/** Unique key of a workbook row, used to skip rows that have problems. */
export const rowKey = (row: {
    sheetName: string;
    rowNumber: number;
}): string => `${row.sheetName}#${row.rowNumber}`;

/**
 * The cells to show in the import log for the given fields. A field whose
 * column is missing from the sheet is shown with its expected column name.
 */
export const sourceCells = (
    row: OPNImportRow,
    fields: OPNColumnKey[],
): OPNSourceCell[] =>
    fields.map(
        field =>
            row.source[field] ?? {
                column:
                    `${OPN_COLUMN_ALIASES[field][0]} ` +
                    '(column not found)',
                value: '',
            },
    );

// Sheet column of each product-level value checked for conflicts
const DETAIL_FIELDS: Record<
    keyof OPNProductDetails,
    OPNColumnKey
> = {
    brand: 'brand',
    description: 'description',
    petTypes: 'petType',
    primaryCategory: 'primaryCategory',
    secondaryCategory: 'secondaryCategory',
    tertiaryCategory: 'tertiaryCategory',
};

type OPNProductDetails = {
    brand: string;
    description: string;
    petTypes: string;
    primaryCategory: string;
    secondaryCategory: string;
    tertiaryCategory: string;
};

const OPN_PRODUCT_DETAIL_KEYS: Array<
    keyof OPNProductDetails
> = [
    'brand',
    'petTypes',
    'primaryCategory',
    'secondaryCategory',
    'tertiaryCategory',
];

@Injectable()
export class ImportValidationService {
    validateOPN(rows: OPNImportRow[]): ImportIssue[] {
        const issues: ImportIssue[] = [];

        const skus = new Map<string, OPNImportRow>();
        // const barcodes = new Map<string, OPNImportRow>();
        const optionCombinations = new Set<string>();
        const productDetails =
            new Map<string, OPNProductDetails>();

        const addIssue = (
            row: OPNImportRow,
            message: string,
            fields: OPNColumnKey[] = [],
        ) => {
            issues.push({
                row: row.rowNumber,
                message: `[${row.sheetName}] ${message}`,
                kind: 'row-skipped',
                sheetName: row.sheetName,
                rows: [row.rowNumber],
                productName: row.productName,
                cells: sourceCells(row, fields),
                problem: message,
            });
        };

        for (const row of rows) {
            if (!row.productName) {
                addIssue(
                    row,
                    'Product Name is required',
                    ['productName'],
                );
            }

            if (!row.productGroupKey) {
                addIssue(
                    row,
                    'A product grouping key could not be generated',
                    ['brand', 'productName'],
                );
            }

            // if (!row.sku) {
            //     addIssue(
            //         row,
            //         'Item Code / SKU is required',
            //     );
            // }

            if (!row.sku) {
                addIssue(
                    row,
                    'A unique internal SKU could not be generated',
                    ['sku', 'weightOrCount', 'unit'],
                );
            }

            // if (
            //     !Number.isFinite(row.price) ||
            //     row.price <= 0
            // ) {
            //     addIssue(
            //         row,
            //         'MRP must be greater than zero',
            //     );
            // }

            if (
                !Number.isFinite(row.price) ||
                row.price < 0
            ) {
                addIssue(
                    row,
                    'MRP cannot be negative',
                    ['price'],
                );
            }

            if (
                row.gstPercentage !== null &&
                (
                    row.gstPercentage < 0 ||
                    row.gstPercentage > 100
                )
            ) {
                addIssue(
                    row,
                    'GST Percentage must be between 0 and 100',
                    ['gstPercentage'],
                );
            }

            const measurements = [
                ['Package length', row.packageLengthCm, 'packageLengthCm'],
                ['Package width', row.packageWidthCm, 'packageWidthCm'],
                ['Package height', row.packageHeightCm, 'packageHeightCm'],
                ['Weight in grams', row.weightInGrams, 'weightInGrams'],
                ['Case Pack', row.casePack, 'casePack'],
                ['Shelf Life', row.shelfLifeYears, 'shelfLifeYears'],
            ] as const;

            for (const [label, value, field] of measurements) {
                if (value !== null && value < 0) {
                    addIssue(
                        row,
                        `${label} cannot be negative`,
                        [field],
                    );
                }
            }

            const normalizedSku = norm(row.sku);

            if (normalizedSku) {
                const existingSku = skus.get(normalizedSku);

                if (existingSku) {
                    addIssue(
                        row,
                        `Duplicate SKU ${row.sku}; first found in ` +
                        `${existingSku.sheetName} row ` +
                        `${existingSku.rowNumber}`,
                        ['sku', 'weightOrCount', 'unit'],
                    );
                } else {
                    skus.set(normalizedSku, row);
                }
            }

            // const normalizedBarcode = norm(row.barcode);

            if (row.optionValue) {
                const combination = [
                    row.productGroupKey,
                    norm(row.optionGroup),
                    norm(row.optionValue),
                ].join('|');

                if (optionCombinations.has(combination)) {
                    addIssue(
                        row,
                        `Duplicate ${row.optionGroup} option ` +
                        `${row.optionValue} for the same product`,
                        ['productName', 'weightOrCount', 'unit'],
                    );
                } else {
                    optionCombinations.add(combination);
                }
            }

            const currentDetails: OPNProductDetails = {
                brand: norm(row.brand),
                description: norm(row.description),
                petTypes: [...row.petTypes]
                    .map(norm)
                    .sort()
                    .join('|'),
                primaryCategory:
                    norm(row.primaryCategory),
                secondaryCategory:
                    norm(row.secondaryCategory),
                tertiaryCategory:
                    norm(row.tertiaryCategory),
            };

            const previousDetails =
                productDetails.get(row.productGroupKey);

            if (!previousDetails) {
                productDetails.set(
                    row.productGroupKey,
                    currentDetails,
                );

                continue;
            }

            const conflictingFields =
                OPN_PRODUCT_DETAIL_KEYS.filter(key => {
                    const previousValue =
                        previousDetails[key];
                    const currentValue =
                        currentDetails[key];

                    return Boolean(
                        previousValue &&
                        currentValue &&
                        previousValue !== currentValue,
                    );
                });

            if (conflictingFields.length > 0) {
                addIssue(
                    row,
                    'Product-level values conflict for: ' +
                    conflictingFields.join(', ') +
                    ' (they differ from an earlier row of the ' +
                    'same product)',
                    conflictingFields.map(
                        field => DETAIL_FIELDS[field],
                    ),
                );
            }

            const mergedDetails = {
                ...previousDetails,
            };

            for (const key of OPN_PRODUCT_DETAIL_KEYS) {
                if (
                    !mergedDetails[key] &&
                    currentDetails[key]
                ) {
                    mergedDetails[key] =
                        currentDetails[key];
                }
            }

            productDetails.set(
                row.productGroupKey,
                mergedDetails,
            );
        }

        return issues;
    }
    validate(rows: ImportRow[]): ImportIssue[] {
        const issues: ImportIssue[] = [];
        const skus = new Set<string>();
        const combinations = new Set<string>();
        const productNames = new Map<string, string>();
        const groupShapes = new Map<string, string>();
        const productDetails = new Map<
            string,
            {
                isFood: boolean;
                ingredients: string;
                usageAndFeeding: string;
                specifications: string;
                petType: string;
                description: string;
            }
        >();
        for (const r of rows) {
            for (const key of ['productSlug', 'productName', 'sku'] as const) {
                if (!r[key]) issues.push({ row: r.rowNumber, message: `${key} is required` });
            }
            if (!Number.isFinite(r.price) || r.price < 0 || Math.round(r.price * 100) !== r.price * 100)
                issues.push({ row: r.rowNumber, message: 'price must be a nonnegative amount with at most two decimals' });
            if (!Number.isSafeInteger(r.stock) || r.stock < 0)
                issues.push({ row: r.rowNumber, message: 'stock must be a nonnegative integer' });
            if (r.petType && !['Dog', 'Cat', 'Bird', 'Hemster', 'Guinea Pig', 'Turtle', 'Rabbit', 'Fish', 'Horse'].includes(r.petType))
                issues.push({ row: r.rowNumber, message: 'petType must match an existing Pet Type choice' });
            if (skus.has(norm(r.sku))) issues.push({ row: r.rowNumber, message: `Duplicate SKU ${r.sku}` });
            skus.add(norm(r.sku));
            if (r.options.some(o => !o.group || !o.value)) issues.push({ row: r.rowNumber, message: 'Option group and value must both be filled' });
            const groups = r.options.map(o => norm(o.group));
            if (new Set(groups).size !== groups.length) issues.push({ row: r.rowNumber, message: 'Option group repeated on one row' });
            const slug = norm(r.productSlug);
            const currentDetails = {
                isFood: r.isFood,
                ingredients: r.ingredients.map(norm).join('|'),
                usageAndFeeding: norm(r.usageAndFeeding),
                specifications: norm(r.specifications),
                petType: norm(r.petType),
                description: norm(r.description),
            };

            const previousDetails = productDetails.get(slug);

            if (previousDetails) {
                if (
                    previousDetails.isFood !== currentDetails.isFood ||
                    previousDetails.ingredients !== currentDetails.ingredients ||
                    previousDetails.usageAndFeeding !== currentDetails.usageAndFeeding ||
                    previousDetails.specifications !== currentDetails.specifications ||
                    previousDetails.petType !== currentDetails.petType ||
                    previousDetails.description !== currentDetails.description
                ) {
                    issues.push({
                        row: r.rowNumber,
                        message:
                            'Product details must be identical for every variant of the same product',
                    });
                }
            } else {
                productDetails.set(slug, currentDetails);
            }

            if (!r.isFood && r.ingredients.length > 0) {
                issues.push({
                    row: r.rowNumber,
                    message: 'Ingredients can only be provided when isFood is Yes',
                });
            }

            if (!r.isFood && r.usageAndFeeding) {
                issues.push({
                    row: r.rowNumber,
                    message: 'Usage & Feeding can only be provided when isFood is Yes',
                });
            }
            if (productNames.has(slug) && productNames.get(slug) !== r.productName)
                issues.push({ row: r.rowNumber, message: 'Product name differs for the same slug' });
            productNames.set(slug, r.productName);
            const shape = [...groups].sort().join('|');
            if (groupShapes.has(slug) && groupShapes.get(slug) !== shape)
                issues.push({ row: r.rowNumber, message: 'Every variant of a product must use the same option groups' });
            groupShapes.set(slug, shape);
            const combination = slug + '|' + r.options.map(o => `${norm(o.group)}:${norm(o.value)}`).sort().join('|');
            if (combinations.has(combination)) issues.push({ row: r.rowNumber, message: 'Duplicate option combination' });
            combinations.add(combination);
        }
        return issues;
    }
}
