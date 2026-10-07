import { Injectable } from '@nestjs/common';
import { ImportRow } from './spreadsheet-parser.service';
import type { OPNImportRow } from './opn-import.types';
export type ImportIssue = { row: number; message: string };
const norm = (s: string) => s.trim().toLowerCase();

@Injectable()
export class ImportValidationService {
    validateOPN(rows: OPNImportRow[]): ImportIssue[] {
        const issues: ImportIssue[] = [];

        const skus = new Map<string, OPNImportRow>();
        const barcodes = new Map<string, OPNImportRow>();
        const optionCombinations = new Set<string>();
        const productDetails = new Map<string, string>();

        const addIssue = (
            row: OPNImportRow,
            message: string,
        ) => {
            issues.push({
                row: row.rowNumber,
                message: `[${row.sheetName}] ${message}`,
            });
        };

        for (const row of rows) {
            if (!row.productName) {
                addIssue(row, 'Product Name is required');
            }

            if (!row.productGroupKey) {
                addIssue(
                    row,
                    'A product grouping key could not be generated',
                );
            }

            if (!row.sku) {
                addIssue(
                    row,
                    'Item Code / SKU is required',
                );
            }

            if (
                !Number.isFinite(row.price) ||
                row.price <= 0
            ) {
                addIssue(
                    row,
                    'MRP must be greater than zero',
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
                );
            }

            const measurements = [
                ['Package length', row.packageLengthCm],
                ['Package width', row.packageWidthCm],
                ['Package height', row.packageHeightCm],
                ['Weight in grams', row.weightInGrams],
                ['Case Pack', row.casePack],
                ['Shelf Life', row.shelfLifeYears],
            ] as const;

            for (const [label, value] of measurements) {
                if (value !== null && value < 0) {
                    addIssue(
                        row,
                        `${label} cannot be negative`,
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
                    );
                } else {
                    skus.set(normalizedSku, row);
                }
            }

            const normalizedBarcode = norm(row.barcode);

            if (normalizedBarcode) {
                const existingBarcode =
                    barcodes.get(normalizedBarcode);

                if (existingBarcode) {
                    addIssue(
                        row,
                        `Duplicate barcode ${row.barcode}; ` +
                        `first found in ` +
                        `${existingBarcode.sheetName} row ` +
                        `${existingBarcode.rowNumber}`,
                    );
                } else {
                    barcodes.set(normalizedBarcode, row);
                }
            }

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
                    );
                } else {
                    optionCombinations.add(combination);
                }
            }

            const productSignature = JSON.stringify({
                brand: norm(row.brand),
                description: norm(row.description),
                petTypes: [...row.petTypes]
                    .map(norm)
                    .sort(),
                primaryCategory:
                    norm(row.primaryCategory),
                secondaryCategory:
                    norm(row.secondaryCategory),
                tertiaryCategory:
                    norm(row.tertiaryCategory),
            });

            const previousSignature =
                productDetails.get(row.productGroupKey);

            if (
                previousSignature &&
                previousSignature !== productSignature
            ) {
                addIssue(
                    row,
                    'Product-level details differ between ' +
                    'variants grouped into the same product',
                );
            } else {
                productDetails.set(
                    row.productGroupKey,
                    productSignature,
                );
            }
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
