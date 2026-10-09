import { Inject, Injectable } from '@nestjs/common';
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
import {
    ImageImportCache,
    OpnAssetService,
} from './opn-asset.service';
import { OpnTaxonomyService } from './opn-taxonomy.service';
import {
    ImportIssue,
    ImportValidationService,
    rowKey,
    sourceCells,
} from './import-validation.service';
import type {
    OPNImportRow,
    OPNSourceCell,
} from './opn-import.types';
import { SpreadsheetParserService } from './spreadsheet-parser.service';
import { ImportProfiler } from './import-profiler';
import {
    createTaskQueue,
    forEachWithConcurrency,
} from './async-pool';
import {
    PRODUCT_IMPORT_OPTIONS,
    ProductImportOptions,
} from '../constants';
import {
    CreatedProductLog,
    writeImportLog,
} from './import-log.writer';
type Result = {
    products: number;
    variants: number;
    issues: ImportIssue[];
    logFile?: string;
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
        @Inject(PRODUCT_IMPORT_OPTIONS)
        private readonly importOptions: Required<ProductImportOptions>,
    ) {}

    /**
     * Parses and validates the sheet. Rows with a problem are left out of
     * `rows` (and reported in `issues`) so the rest of the sheet can still
     * be imported.
     */
    private validRows(raw: unknown): {
        rowsRead: number;
        rows: OPNImportRow[];
        issues: ImportIssue[];
    } {
        const allRows = this.parser.parseOPN(raw);
        const issues = this.validation.validateOPN(allRows);

        const problemRows = new Set(
            issues.map(issue =>
                rowKey({
                    sheetName: issue.sheetName ?? '',
                    rowNumber: issue.row,
                }),
            ),
        );

        return {
            rowsRead: allRows.length,
            rows: allRows.filter(
                row => !problemRows.has(rowKey(row)),
            ),
            issues,
        };
    }

    /**
     * Finds products of the sheet that already exist in the database. They
     * are skipped rather than blocking the import, so a partly finished
     * import can be run again.
     */
    private async findExistingProducts(
        ctx: RequestContext,
        rows: OPNImportRow[],
    ): Promise<Map<string, string>> {
        // productGroupKey -> reason the product is skipped
        const existingProducts = new Map<string, string>();

        const groupKeyBySlug = new Map<string, string>();

        for (const row of rows) {
            if (
                row.productSlug &&
                !groupKeyBySlug.has(row.productSlug)
            ) {
                groupKeyBySlug.set(
                    row.productSlug,
                    row.productGroupKey,
                );
            }
        }

        await forEachWithConcurrency(
            [...groupKeyBySlug],
            10,
            async ([slug, groupKey]) => {
                const existingProduct =
                    await this.products.findOneBySlug(
                        ctx,
                        slug,
                    );

                if (existingProduct) {
                    existingProducts.set(
                        groupKey,
                        `product slug ${slug} already exists`,
                    );
                }
            },
        );

        await forEachWithConcurrency(
            rows.filter(row => Boolean(row.sku)),
            10,
            async row => {
                if (existingProducts.has(row.productGroupKey)) {
                    return;
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
                    existingProducts.set(
                        row.productGroupKey,
                        `SKU ${row.sku} already exists`,
                    );
                }
            },
        );

        return existingProducts;
    }

    /**
     * Counts what would be imported. `products` and `variants` only count
     * rows without problems; rows with problems are listed in `issues` and
     * will be skipped by the import.
     */
    async preview(
        _ctx: RequestContext,
        raw: unknown,
    ): Promise<Result> {
        const profiler =
            new ImportProfiler('OPN preview');

        const { rowsRead, rows, issues } =
            this.validRows(raw);

        profiler.mark('spreadsheet parsed and validated', {
            rowsRead,
            validRows: rows.length,
            errors: issues.length,
        });

        const products = new Set(
            rows
                .map(row => row.productGroupKey)
                .filter(Boolean),
        );

        const result = {
            products: products.size,
            variants: rows.length,
            issues,
        };

        profiler.finish({
            products: result.products,
            variants: result.variants,
            errors: result.issues.length,
        });

        return result;
    }

    /**
     * Imports the sheet one product at a time. Rows with a problem, products
     * that already exist and products that fail to save are skipped; the
     * rest is imported. Everything is written to a log file in import-logs/.
     */
    async import(
        ctx: RequestContext,
        raw: unknown,
        fileName?: string,
    ): Promise<Result> {
        const profiler =
            new ImportProfiler('OPN import');

        const startedAt = new Date();
        const issues: ImportIssue[] = [];
        const created: CreatedProductLog[] = [];
        const affectedCollectionIds = new Set<ID>();
        const imageQueue = createTaskQueue(
            this.importOptions.imageConcurrency,
        );
        const imageCache: ImageImportCache = new Map();

        let rowsRead = 0;
        let fatalError: string | undefined;
        let logFile: string | undefined;

        try {
            const validation = this.validRows(raw);

            rowsRead = validation.rowsRead;
            issues.push(...validation.issues);

            const existingProducts =
                await this.findExistingProducts(
                    ctx,
                    validation.rows,
                );

            profiler.mark('inspection completed', {
                rowsRead,
                validRows: validation.rows.length,
                rowsSkipped: validation.issues.length,
                existingProducts: existingProducts.size,
            });

            const batches =
                new Map<string, OPNImportRow[]>();

            for (const row of validation.rows) {
                const existing =
                    batches.get(row.productGroupKey) ?? [];

                existing.push(row);
                batches.set(row.productGroupKey, existing);
            }

            const languageCode =
                ctx.languageCode ?? LanguageCode.en;

            const productIssue = (
                productRows: OPNImportRow[],
                kind: 'product-skipped' | 'product-failed',
                problem: string,
            ): ImportIssue => {
                const first = productRows[0];

                return {
                    row: first.rowNumber,
                    message:
                        `[${first.sheetName}] ${first.productName}: ` +
                        problem,
                    kind,
                    sheetName: first.sheetName,
                    rows: productRows.map(row => row.rowNumber),
                    productName: first.productName,
                    cells: sourceCells(first, ['productName']),
                    problem,
                };
            };

            const errorText = (error: unknown): string =>
                error instanceof Error
                    ? error.message
                    : 'unknown error';

            const toCreate: OPNImportRow[][] = [];

            for (const [groupKey, productRows] of batches) {
                const skipReason =
                    existingProducts.get(groupKey);

                if (skipReason) {
                    issues.push(
                        productIssue(
                            productRows,
                            'product-skipped',
                            `Already exists: ${skipReason}`,
                        ),
                    );
                } else {
                    toCreate.push(productRows);
                }
            }

            // Filters (facet values) and collections are shared between
            // products, so they are all created first, one product at a
            // time and committed straight away. The products can then be
            // created in parallel without two of them creating the same
            // filter or collection.
            this.taxonomy.resetCache();

            // Collections are refreshed once at the end instead of after
            // every product (resumed in the finally block below)
            this.taxonomy.pauseCollectionUpdates();

            const ready: OPNImportRow[][] = [];

            for (const productRows of toCreate) {
                try {
                    await this.taxonomy.prepareProduct(
                        ctx,
                        productRows,
                    );
                    ready.push(productRows);
                } catch (error) {
                    this.taxonomy.resetCache();
                    issues.push(
                        productIssue(
                            productRows,
                            'product-failed',
                            'Filters or collections could not be ' +
                                `created: ${errorText(error)}`,
                        ),
                    );
                }
            }

            profiler.mark('filters and collections prepared', {
                products: ready.length,
            });

            await forEachWithConcurrency(
                ready,
                this.importOptions.productConcurrency,
                async productRows => {
                    const first = productRows[0];

                    // Each product is committed on its own, so products
                    // that were saved stay saved if another one fails.
                    let product: {
                        productId: ID;
                        collectionIds: ID[];
                    };

                    try {
                        product =
                            await this.connection.withTransaction(
                                ctx,
                                transactionCtx =>
                                    this.createProduct(
                                        transactionCtx,
                                        productRows,
                                        languageCode,
                                    ),
                            );
                    } catch (error) {
                        issues.push(
                            productIssue(
                                productRows,
                                'product-failed',
                                `Could not be saved: ${errorText(error)}`,
                            ),
                        );

                        return;
                    }

                    created.push({
                        productId: product.productId,
                        productName: first.productName,
                        sheetName: first.sheetName,
                        rows: productRows.map(row => row.rowNumber),
                        variants: productRows.length,
                    });

                    for (const collectionId of product.collectionIds) {
                        affectedCollectionIds.add(collectionId);
                    }

                    // Every image link of every row of the product, once
                    const imageLinks = new Map<
                        string,
                        { row: OPNImportRow; cell: OPNSourceCell }
                    >();

                    for (const row of productRows) {
                        for (const cell of row.imageCells) {
                            if (!imageLinks.has(cell.value)) {
                                imageLinks.set(cell.value, {
                                    row,
                                    cell,
                                });
                            }
                        }
                    }

                    if (imageLinks.size) {
                        // Queued, not awaited: images download in the
                        // background while more products are created.
                        imageQueue.add(() =>
                            this.importProductImages(
                                ctx,
                                product.productId,
                                first.productSlug,
                                [...imageLinks.values()],
                                imageCache,
                                issues,
                            ),
                        );
                    }
                },
            );

            profiler.mark('products created', {
                created: created.length,
                productConcurrency:
                    this.importOptions.productConcurrency,
            });
        } catch (error) {
            // Reported instead of thrown so the products already saved and
            // the log file are still shown in the dashboard.
            fatalError =
                error instanceof Error
                    ? error.message
                    : String(error);

            issues.push({
                row: 0,
                message: `Import stopped early: ${fatalError}`,
            });
        } finally {
            await imageQueue.drain();

            this.taxonomy.resumeCollectionUpdates();

            await this.taxonomy
                .refreshCollections(
                    ctx,
                    [...affectedCollectionIds],
                )
                .catch(() => undefined);

            logFile = await writeImportLog({
                fileName,
                adminUserId: ctx.activeUserId,
                startedAt,
                finishedAt: new Date(),
                rowsRead,
                created,
                issues,
                fatalError,
            });

            profiler.finish({
                created: created.length,
                issues: issues.length,
                logFile,
                fatalError,
            });
        }

        return {
            products: created.length,
            variants: created.reduce(
                (total, product) => total + product.variants,
                0,
            ),
            issues,
            logFile,
        };
    }

    /**
     * Imports all images of a product from its image links and attaches
     * them, the first one as the featured image. Every image that fails is
     * reported with the sheet, row, column and link it came from.
     */
    private async importProductImages(
        ctx: RequestContext,
        productId: ID,
        productSlug: string,
        links: Array<{ row: OPNImportRow; cell: OPNSourceCell }>,
        cache: ImageImportCache,
        issues: ImportIssue[],
    ): Promise<void> {
        const reportFailure = (
            row: OPNImportRow,
            cell: OPNSourceCell,
            reason: string,
        ) => {
            issues.push({
                row: row.rowNumber,
                message:
                    `[${row.sheetName}] Product was ` +
                    `imported, but an image failed: ${reason}`,
                kind: 'image-failed',
                sheetName: row.sheetName,
                rows: [row.rowNumber],
                productName: row.productName,
                cells: [cell],
                problem: reason,
            });
        };

        const assetIds: ID[] = [];

        for (const { row, cell } of links) {
            try {
                const imported =
                    await this.assetImporter.importImagesFromLink(
                        ctx,
                        cell.value,
                        productSlug,
                        cache,
                    );

                for (const assetId of imported.assetIds) {
                    if (!assetIds.includes(assetId)) {
                        assetIds.push(assetId);
                    }
                }

                for (const failure of imported.errors) {
                    reportFailure(
                        row,
                        cell,
                        failure.file
                            ? `${failure.file}: ${failure.error}`
                            : failure.error,
                    );
                }
            } catch (error) {
                reportFailure(
                    row,
                    cell,
                    error instanceof Error
                        ? error.message
                        : 'unknown error',
                );
            }
        }

        if (!assetIds.length) {
            return;
        }

        try {
            await this.products.update(ctx, {
                id: productId,
                assetIds,
                featuredAssetId: assetIds[0],
            });
        } catch (error) {
            reportFailure(
                links[0].row,
                links[0].cell,
                'Images were uploaded but could not be attached ' +
                    'to the product: ' +
                    (error instanceof Error
                        ? error.message
                        : 'unknown error'),
            );
        }
    }

    /**
     * Creates one product with its option groups and variants. Runs inside
     * the per-product transaction started by import().
     */
    private async createProduct(
        ctx: RequestContext,
        productRows: OPNImportRow[],
        languageCode: LanguageCode,
    ): Promise<{
        productId: ID;
        collectionIds: ID[];
    }> {
        const first = productRows[0];
        const productProfiler = new ImportProfiler(
            `OPN product ${first.productSlug}`,
        );

        const taxonomy =
            await this.taxonomy.prepareProduct(
                ctx,
                productRows,
            );

        productProfiler.mark('taxonomy prepared', {
            facetValues: taxonomy.facetValueIds.length,
            collections: taxonomy.collectionIds.length,
        });

        const petTypes = uniqueValues(
            productRows.flatMap(
                row => row.petTypes,
            ),
        );

        const product =
            await this.products.create(
                ctx,
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

        productProfiler.mark('product created', {
            productId: product.id,
        });

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
                    ctx,
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
                    ctx,
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
                        ctx,
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

        productProfiler.mark(
            'option groups and values created',
            {
                groups: groupNames.length,
                options: optionIds.size,
            },
        );

        await this.variants.create(
            ctx,
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
                    enabled: row.price > 0,
                    sku: row.sku,
                    price: Math.max(
                        0,
                        Math.round(row.price * 100),
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
                        itemCode:
                            row.itemCode ||
                            undefined,
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

        productProfiler.mark('variants created', {
            variants: productRows.length,
        });

        productProfiler.finish({
            productId: product.id,
            variants: productRows.length,
        });

        return {
            productId: product.id,
            collectionIds: taxonomy.collectionIds,
        };
    }
}
