import { Injectable } from '@nestjs/common';
import {
    LanguageCode, ProductOptionGroupService, ProductOptionService,
    ProductService, ProductVariantService, RequestContext,
} from '@vendure/core';
import { ImportValidationService, ImportIssue } from './import-validation.service';
import { ImportRow, SpreadsheetParserService } from './spreadsheet-parser.service';

const match = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const code = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
type Result = { products: number; variants: number; issues: ImportIssue[] };

@Injectable()
export class ProductImportService {
    constructor(
        private readonly parser: SpreadsheetParserService,
        private readonly validation: ImportValidationService,
        private readonly products: ProductService,
        private readonly variants: ProductVariantService,
        private readonly groups: ProductOptionGroupService,
        private readonly options: ProductOptionService,
    ) {}

    private async inspect(ctx: RequestContext, raw: unknown): Promise<{ rows: ImportRow[]; result: Result }> {
        const rows = this.parser.parse(raw);
        const issues = this.validation.validate(rows);
        const seen = new Set<string>();
        for (const r of rows) {
            if (seen.has(r.productSlug)) continue;
            seen.add(r.productSlug);
            if (await this.products.findOneBySlug(ctx, r.productSlug))
                issues.push({ row: r.rowNumber, message: `Product slug ${r.productSlug} already exists` });
        }
        // Vendure's SKU filter also catches variants on other products.
        for (const r of rows) {
            if (!r.sku) continue;
            const existing = await this.variants.findAll(ctx, { take: 1, filter: { sku: { eq: r.sku } } });
            if (existing.totalItems) issues.push({ row: r.rowNumber, message: `SKU ${r.sku} already exists` });
        }
        return { rows, result: { products: seen.size, variants: rows.length, issues } };
    }
    async preview(ctx: RequestContext, raw: unknown): Promise<Result> {
        return (await this.inspect(ctx, raw)).result;
    }
    async import(ctx: RequestContext, raw: unknown): Promise<Result> {
        const { rows, result } = await this.inspect(ctx, raw);
        if (result.issues.length) return result;
        const batches = new Map<string, ImportRow[]>();
        for (const row of rows) batches.set(row.productSlug, [...(batches.get(row.productSlug) ?? []), row]);
        for (const [slug, productRows] of batches) {
            const first = productRows[0];
            const product = await this.products.create(ctx, {
                enabled: true,
                translations: [{ languageCode: ctx.languageCode ?? LanguageCode.en,
                    name: first.productName, slug, description: first.description }],
                customFields: first.petType ? { petType: first.petType } : undefined,
            });
            const optionIds = new Map<string, string | number>();
            const groupNames = first.options.map(o => o.group);
            for (const groupName of groupNames) {
                const candidates = await this.groups.findAll(ctx, { take: 1000 });
                let group = candidates.items.find(g => match(g.name, groupName));
                if (!group) group = await this.groups.create(ctx, {
                    code: code(groupName),
                    translations: [{ languageCode: ctx.languageCode ?? LanguageCode.en, name: groupName }],
                });
                await this.products.addOptionGroupToProduct(ctx, product.id, group.id);
                const optionNames = [...new Set(productRows.map(r => r.options.find(o => match(o.group, groupName))!.value))];
                for (const optionName of optionNames) {
                    const list = await this.options.findAll(ctx, { take: 1000 }, group.id);
                    let option = list.items.find(o => match(o.name, optionName));
                    if (!option) option = await this.options.create(ctx, group.id, {
                        code: code(optionName),
                        translations: [{ languageCode: ctx.languageCode ?? LanguageCode.en, name: optionName }],
                    });
                    optionIds.set(`${groupName.toLowerCase()}|${optionName.toLowerCase()}`, option.id);
                }
            }
            await this.variants.create(ctx, productRows.map(r => ({
                productId: product.id, enabled: true, sku: r.sku,
                price: Math.round(r.price * 100), stockOnHand: r.stock,
                optionIds: r.options.map(o => optionIds.get(`${o.group.toLowerCase()}|${o.value.toLowerCase()}`)!),
                translations: [{ languageCode: ctx.languageCode ?? LanguageCode.en,
                    name: [r.productName, ...r.options.map(o => o.value)].join(' ') }],
            })));
        }
        return result;
    }
}
