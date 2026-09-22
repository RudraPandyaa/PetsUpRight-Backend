import { Injectable } from '@nestjs/common';

export type ImportRow = {
    rowNumber: number;
    productSlug: string;
    productName: string;
    description: string;
    petType: string;
    sku: string;
    price: number;
    stock: number;
    options: { group: string; value: string }[];
};

@Injectable()
export class SpreadsheetParserService {
    parse(data: unknown): ImportRow[] {
        if (!Array.isArray(data) || data.length === 0 || data.length > 2000) {
            throw new Error('Upload 1–2000 variant rows');
        }
        return data.map((value, index) => {
            const r = value as Record<string, unknown>;
            const str = (key: string) => String(r?.[key] ?? '').trim();
            const options: ImportRow['options'] = [];
            for (let i = 1; i <= 5; i++) {
                const group = str(`option${i}Group`);
                const optionValue = str(`option${i}Value`);
                if (group || optionValue) options.push({ group, value: optionValue });
            }
            return {
                rowNumber: index + 2,
                productSlug: str('productSlug'), productName: str('productName'),
                description: str('description'), petType: str('petType'),
                sku: str('sku'), price: Number(r.price), stock: Number(r.stock), options,
            };
        });
    }
}
