import { Injectable } from '@nestjs/common';
import {
    ID,
    LanguageCode,
    ProductOptionGroupService,
    ProductOptionService,
    ProductService,
    ProductVariantService,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { OpnAssetService } from './opn-asset.service';
import { OpnTaxonomyService } from './opn-taxonomy.service';
import {
    ImportIssue,
    ImportValidationService,
} from './import-validation.service';
import type { OPNImportRow } from './opn-import.types';
import { SpreadsheetParserService } from './spreadsheet-parser.service';

type Result = {
    products: number;
    variants: number;
    issues: ImportIssue[];
};

const normalize = (value: string): string =>
    value.trim().toLowerCase();

const createCode = (value: string): string =>
    value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

const firstValue = (
    rows: OPNImportRow[],
    selector: (row: OPNImportRow) => string,
): string => {
    for (const row of rows) {
        const value = selector(row).trim();

        if (value) {
            return value;
        }
    }

    return '';
};

const uniqueValues = (values: string[]): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const value of values) {
        const trimmed = value.trim();
        const normalized = normalize(trimmed);

        if (trimmed && !seen.has(normalized)) {
            seen.add(normalized);
            result.push(trimmed);
        }
    }

    return result;
};

@Injectable()
export class ProductImportService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly parser: SpreadsheetParserService,
        private readonly validation: ImportValidationService,
        private readonly taxonomy: OpnTaxonomyService,
        private readonly assetImporter: OpnAssetService,
        private readonly products: ProductService,
        private readonly variants: ProductVariantService,
        private readonly groups: ProductOptionGroupService,
        private readonly options: ProductOptionService,
    ) {}

    private async inspect(
        ctx: RequestContext,
        raw: unknown,
    ): Promise<{
        rows: OPNImportRow[];
        result: Result;
    }> {
        const rows = this.parser.parseOPN(raw);
        const issues = this.validation.validateOPN(rows);

        const productSlugs = new Set(
            rows
                .map(row => row.productSlug)
                .filter(Boolean),
        );

        for (const slug of productSlugs) {
            const existingProduct =
                await this.products.findOneBySlug(ctx, slug);

            if (existingProduct) {
                const row = rows.find(
                    item => item.productSlug === slug,
                );

                issues.push({
                    row: row?.rowNumber ?? 0,
                    message:
                        `Product slug ${slug} already exists`,
                });
            }
        }

        for (const row of rows) {
            if (!row.sku) {
                continue;
            }

            const existingVariant =
                await this.variants.findAll(ctx, {
                    take: 1,
                    filter: {
                        sku: {
                            eq: row.sku,
                        },
                    },
                });

            if (existingVariant.totalItems > 0) {
                issues.push({
                    row: row.rowNumber,
                    message:
                        `[${row.sheetName}] SKU ${row.sku} ` +
                        'already exists',
                });
            }
        }

        return {
            rows,
            result: {
                products: productSlugs.size,
                variants: rows.length,
                issues,
            },
        };
    }

    async preview(
        _ctx: RequestContext,
        raw: unknown,
    ): Promise<Result> {
        const rows = this.parser.parseOPN(raw);
        const issues = this.validation.validateOPN(rows);

        const products = new Set(
            rows
                .map(row => row.productGroupKey)
                .filter(Boolean),
        );

        return {
            products: products.size,
            variants: rows.length,
            issues,
        };
    }

    async import(
        ctx: RequestContext,
        raw: unknown,
    ): Promise<Result> {
        const { rows, result } =
            await this.inspect(ctx, raw);

        if (result.issues.length > 0) {
            return result;
        }

        const batches =
            new Map<string, OPNImportRow[]>();

        for (const row of rows) {
            const existing =
                batches.get(row.productGroupKey) ?? [];

            existing.push(row);
            batches.set(row.productGroupKey, existing);
        }

        const languageCode =
            ctx.languageCode ?? LanguageCode.en;

        const transactionOutput =
            await this.connection.withTransaction(
                ctx,
                async transactionCtx => {
                    const affectedCollectionIds =
                        new Set<ID>();

                    const productImages: Array<{
                        productId: ID;
                        imageUrl: string;
                        fileBaseName: string;
                        rowNumber: number;
                        sheetName: string;
                    }> = [];

                    for (
                        const productRows of batches.values()
                    ) {
                        const first = productRows[0];

                        const taxonomy =
                            await this.taxonomy.prepareProduct(
                                transactionCtx,
                                productRows,
                            );

                        for (
                            const collectionId
                            of taxonomy.collectionIds
                        ) {
                            affectedCollectionIds.add(
                                collectionId,
                            );
                        }

                        const petTypes = uniqueValues(
                            productRows.flatMap(
                                row => row.petTypes,
                            ),
                        );

                        const product =
                            await this.products.create(
                                transactionCtx,
                                {
                                    enabled: true,
                                    facetValueIds:
                                        taxonomy.facetValueIds,
                                    translations: [
                                        {
                                            languageCode,
                                            name:
                                                first.productName,
                                            slug:
                                                first.productSlug,
                                            description:
                                                firstValue(
                                                    productRows,
                                                    row =>
                                                        row.description,
                                                ),
                                        },
                                    ],
                                    customFields: {
                                        petType:
                                            petTypes.join(', ') ||
                                            undefined,
                                        isFood:
                                            productRows.some(
                                                row =>
                                                    row.isFood,
                                            ),
                                        ingredients:
                                            firstValue(
                                                productRows,
                                                row =>
                                                    row.ingredients,
                                            ) || undefined,
                                        usageAndFeeding:
                                            firstValue(
                                                productRows,
                                                row =>
                                                    row.usageAndFeeding,
                                            ) || undefined,
                                        keyPoints:
                                            firstValue(
                                                productRows,
                                                row =>
                                                    row.keyPoints,
                                            ) || undefined,
                                        analyticalConstituents:
                                            firstValue(
                                                productRows,
                                                row =>
                                                    row
                                                        .analyticalConstituents,
                                            ) || undefined,
                                        countryOfOrigin:
                                            firstValue(
                                                productRows,
                                                row =>
                                                    row.countryOfOrigin,
                                            ) || undefined,
                                        manufacturerName:
                                            firstValue(
                                                productRows,
                                                row =>
                                                    row.manufacturerName,
                                            ) || undefined,
                                        manufacturerAddress:
                                            firstValue(
                                                productRows,
                                                row =>
                                                    row
                                                        .manufacturerAddress,
                                            ) || undefined,
                                        supplierName:
                                            firstValue(
                                                productRows,
                                                row =>
                                                    row.supplierName,
                                            ) || undefined,
                                    },
                                },
                            );

                        const rowsWithOptions =
                            productRows.filter(
                                row =>
                                    row.optionGroup &&
                                    row.optionValue,
                            );

                        const optionIds =
                            new Map<
                                string,
                                string | number
                            >();

                        const groupNames = uniqueValues(
                            rowsWithOptions.map(
                                row => row.optionGroup,
                            ),
                        );

                        for (const groupName of groupNames) {
                            const group =
                                await this.groups.create(
                                    transactionCtx,
                                    {
                                        code: createCode(
                                            `${first.productSlug}-${groupName}`,
                                        ),
                                        translations: [
                                            {
                                                languageCode,
                                                name: groupName,
                                            },
                                        ],
                                    },
                                );

                            await this.products
                                .addOptionGroupToProduct(
                                    transactionCtx,
                                    product.id,
                                    group.id,
                                );

                            const optionNames =
                                uniqueValues(
                                    rowsWithOptions
                                        .filter(
                                            row =>
                                                normalize(
                                                    row.optionGroup,
                                                ) ===
                                                normalize(
                                                    groupName,
                                                ),
                                        )
                                        .map(
                                            row =>
                                                row.optionValue,
                                        ),
                                );

                            for (
                                const optionName
                                of optionNames
                            ) {
                                const option =
                                    await this.options.create(
                                        transactionCtx,
                                        group.id,
                                        {
                                            code:
                                                createCode(
                                                    optionName,
                                                ),
                                            translations: [
                                                {
                                                    languageCode,
                                                    name:
                                                        optionName,
                                                },
                                            ],
                                        },
                                    );

                                optionIds.set(
                                    [
                                        normalize(
                                            groupName,
                                        ),
                                        normalize(
                                            optionName,
                                        ),
                                    ].join('|'),
                                    option.id,
                                );
                            }
                        }

                        await this.variants.create(
                            transactionCtx,
                            productRows.map(row => {
                                const variantOptionId =
                                    row.optionValue
                                        ? optionIds.get(
                                            [
                                                normalize(
                                                    row.optionGroup,
                                                ),
                                                normalize(
                                                    row.optionValue,
                                                ),
                                            ].join('|'),
                                        )
                                        : undefined;

                                return {
                                    productId: product.id,
                                    enabled: true,
                                    sku: row.sku,
                                    price: Math.round(
                                        row.price * 100,
                                    ),
                                    stockOnHand: row.stock,
                                    optionIds:
                                        variantOptionId !==
                                        undefined
                                            ? [
                                                variantOptionId,
                                            ]
                                            : [],
                                    translations: [
                                        {
                                            languageCode,
                                            name:
                                                row.variantName ||
                                                row.productName,
                                        },
                                    ],
                                    customFields: {
                                        barcode:
                                            row.barcode ||
                                            undefined,
                                        asin:
                                            row.asin ||
                                            undefined,
                                        unit:
                                            row.unit ||
                                            undefined,
                                        weightInGrams:
                                            row.weightInGrams ??
                                            undefined,
                                        packing:
                                            row.packing ||
                                            undefined,
                                        hsnCode:
                                            row.hsnCode ||
                                            undefined,
                                        gstPercentage:
                                            row.gstPercentage ??
                                            undefined,
                                        casePack:
                                            row.casePack ??
                                            undefined,
                                        shelfLifeYears:
                                            row.shelfLifeYears ??
                                            undefined,
                                        packageLengthCm:
                                            row.packageLengthCm ??
                                            undefined,
                                        packageWidthCm:
                                            row.packageWidthCm ??
                                            undefined,
                                        packageHeightCm:
                                            row.packageHeightCm ??
                                            undefined,
                                    },
                                };
                            }),
                        );

                        const imageUrl = firstValue(
                            productRows,
                            row => row.imageUrl,
                        );

                        if (imageUrl) {
                            productImages.push({
                                productId: product.id,
                                imageUrl,
                                fileBaseName:
                                    first.productSlug,
                                rowNumber:
                                    first.rowNumber,
                                sheetName:
                                    first.sheetName,
                            });
                        }
                    }

                    return {
                        collectionIds: [
                            ...affectedCollectionIds,
                        ],
                        productImages,
                    };
                },
            );

        await this.taxonomy.refreshCollections(
            ctx,
            transactionOutput.collectionIds,
        );

        for (
            const image
            of transactionOutput.productImages
        ) {
            const imported =
                await this.assetImporter.importImage(
                    ctx,
                    image.imageUrl,
                    image.fileBaseName,
                );

            if (imported.assetId !== undefined) {
                await this.products.update(ctx, {
                    id: image.productId,
                    assetIds: [imported.assetId],
                    featuredAssetId:
                        imported.assetId,
                });
            }

            if (imported.error) {
                result.issues.push({
                    row: image.rowNumber,
                    message:
                        `[${image.sheetName}] Product was ` +
                        `imported, but its image failed: ` +
                        imported.error,
                });
            }
        }

        return result;
    }
}