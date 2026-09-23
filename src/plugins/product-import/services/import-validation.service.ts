import { Injectable } from '@nestjs/common';
import { ImportRow } from './spreadsheet-parser.service';

export type ImportIssue = { row: number; message: string };
const norm = (s: string) => s.trim().toLowerCase();

@Injectable()
export class ImportValidationService {
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
