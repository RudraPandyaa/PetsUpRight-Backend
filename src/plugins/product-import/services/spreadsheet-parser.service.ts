import { Injectable } from '@nestjs/common';

export type ImportRow = {
    rowNumber: number;
    productSlug: string;
    productName: string;
    description: string;
    petType: string;

    isFood: boolean;
    ingredients: string[];
    usageAndFeeding: string;
    specifications: string;

    sku: string;
    price: number;
    stock: number;

    options: {
        group: string;
        value: string;
    }[];
};

@Injectable()
export class SpreadsheetParserService {
    parse(data: unknown): ImportRow[] {
        if (!Array.isArray(data) || data.length === 0 || data.length > 2000) {
            throw new Error('Upload 1–2000 variant rows');
        }

        return data.map((value, index) => {
            const rowNumber = index + 2;
            const row = value as Record<string, unknown>;

            const str = (key: string): string => {
                return String(row?.[key] ?? '').trim();
            };

            const bool = (key: string): boolean => {
                const fieldValue = str(key).toLowerCase();

                if (['yes', 'true', '1'].includes(fieldValue)) {
                    return true;
                }

                if (['no', 'false', '0'].includes(fieldValue)) {
                    return false;
                }

                throw new Error(
                    `Row ${rowNumber}: ${key} must contain Yes or No`,
                );
            };

            const options: ImportRow['options'] = [];

            for (let i = 1; i <= 5; i++) {
                const group = str(`option${i}Group`);
                const optionValue = str(`option${i}Value`);

                if (group || optionValue) {
                    options.push({
                        group,
                        value: optionValue,
                    });
                }
            }

            return {
                rowNumber,

                productSlug: str('productSlug'),
                productName: str('productName'),
                description: str('description'),
                petType: str('petType'),

                isFood: bool('isFood'),

                ingredients: str('ingredients')
                    .split('|')
                    .map(ingredient => ingredient.trim())
                    .filter(Boolean),

                usageAndFeeding: str('usageAndFeeding'),
                specifications: str('specifications'),

                sku: str('sku'),
                price: Number(row.price),
                stock: Number(row.stock),

                options,
            };
        });
    }
}