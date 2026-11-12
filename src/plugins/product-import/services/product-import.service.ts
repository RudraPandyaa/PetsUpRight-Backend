import { Inject, Injectable } from '@nestjs/common';
import {
    ID,
    LanguageCode,
    ProductOptionGroupService,
    ProductOptionService,
    ProductService,
    ProductVariant,
    ProductVariantService,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { In, IsNull } from 'typeorm';
import {
    ImageImportCache,
    OpnAssetService,
} from './opn-asset.service';
import { OpnTaxonomyService } from './opn-taxonomy.service';
import { mapPets } from './opn-category-map';
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
    // Products that already existed and were rewritten from the sheet
    updatedProducts: number;
    issues: ImportIssue[];
    logFile?: string;
};

// A row of an existing product that could not be applied to it
type RowProblem = { row: OPNImportRow; problem: string };

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
    ): Promise<Map<string, { productId: ID; reason: string }>> {
        // productGroupKey -> the existing product and how it was found
        const existingProducts = new Map<
            string,
            { productId: ID; reason: string }
        >();

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
                    existingProducts.set(groupKey, {
                        productId: existingProduct.id,
                        reason: `product slug ${slug} already exists`,
                    });
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
                    existingProducts.set(row.productGroupKey, {
                        productId: existingVariant.items[0].productId,
                        reason: `SKU ${row.sku} already exists`,
                    });
                }
            },
        );

        // Products imported earlier under another name or template are
        // found by a variant's barcode (UPC/EAN)
        const barcodeRows = rows.filter(
            row =>
                row.barcode &&
                !existingProducts.has(row.productGroupKey),
        );

        if (barcodeRows.length) {
            const variants = await this.connection
                .getRepository(ctx, ProductVariant)
                .find({
                    where: {
                        customFields: {
                            barcode: In(barcodeRows.map(row => row.barcode)),
                        },
                        deletedAt: IsNull(),
                    } as any,
                    select: ['id', 'productId', 'customFields'] as any,
                });

            for (const row of barcodeRows) {
                const variant = variants.find(
                    item =>
                        (item.customFields as any)?.barcode === row.barcode,
                );

                if (variant && !existingProducts.has(row.productGroupKey)) {
                    existingProducts.set(row.productGroupKey, {
                        productId: variant.productId,
                        reason: `barcode ${row.barcode} already exists`,
                    });
                }
            }
        }

        return existingProducts;
    }

    /**
     * Counts what would be imported. `products` and `variants` only count
     * rows without problems; rows with problems are listed in `issues` and
     * will be skipped by the import. `updatedProducts` of those products
     * already exist and would be rewritten.
     */
    async preview(
        ctx: RequestContext,
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

        const existing = await this.findExistingProducts(ctx, rows);

        const result = {
            products: products.size,
            variants: rows.length,
            updatedProducts: existing.size,
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
     * Imports the sheet one product at a time. New products are created;
     * products that already exist (same slug, SKU or barcode) are rewritten
     * from the sheet, images included. Rows with a problem and products that
     * fail to save are skipped. Everything is written to a log file in
     * import-logs/.
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
        const updated: CreatedProductLog[] = [];
        const affectedCollectionIds = new Set<ID>();
        const imageQueue = createTaskQueue(
            this.importOptions.imageConcurrency,
        );
        const imageCache: ImageImportCache = new Map();

        // Queued, not awaited: images download in the background while more
        // products are saved
        const queueImages = (
            productId: ID,
            productRows: OPNImportRow[],
        ) => {
            if (productRows.some(row => row.imageCells.length)) {
                imageQueue.add(() =>
                    this.importProductImages(
                        ctx,
                        productId,
                        productRows,
                        imageCache,
                        issues,
                    ),
                );
            }
        };

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
            const toUpdate: Array<{
                productId: ID;
                reason: string;
                rows: OPNImportRow[];
            }> = [];

            for (const [groupKey, productRows] of batches) {
                const existing = existingProducts.get(groupKey);

                if (existing) {
                    toUpdate.push({ ...existing, rows: productRows });
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

            // The client's whole category structure, so categories without
            // products (yet) exist on the storefront too
            for (const id of await this.taxonomy.ensureClientCategoryTree(
                ctx,
            )) {
                affectedCollectionIds.add(id);
            }

            // Products that already exist are rewritten from the sheet:
            // details, categories, filters, variants and images
            const readyUpdates: typeof toUpdate = [];

            for (const update of toUpdate) {
                try {
                    await this.taxonomy.prepareProduct(ctx, update.rows);
                    readyUpdates.push(update);
                } catch (error) {
                    this.taxonomy.resetCache();
                    issues.push(
                        productIssue(
                            update.rows,
                            'product-failed',
                            'Already exists, but its filters or collections ' +
                                `could not be created: ${errorText(error)}`,
                        ),
                    );
                }
            }

            await forEachWithConcurrency(
                readyUpdates,
                this.importOptions.productConcurrency,
                async ({ productId, rows: productRows }) => {
                    const first = productRows[0];
                    let outcome: {
                        collectionIds: ID[];
                        problems: RowProblem[];
                    };

                    try {
                        outcome = await this.connection.withTransaction(
                            ctx,
                            transactionCtx =>
                                this.updateProduct(
                                    transactionCtx,
                                    productId,
                                    productRows,
                                    languageCode,
                                ),
                        );
                    } catch (error) {
                        issues.push(
                            productIssue(
                                productRows,
                                'product-failed',
                                'Already exists, but could not be updated: ' +
                                    errorText(error),
                            ),
                        );

                        return;
                    }

                    updated.push({
                        productId,
                        productName: first.productName,
                        sheetName: first.sheetName,
                        rows: productRows.map(row => row.rowNumber),
                        variants: productRows.length,
                    });

                    for (const { row, problem } of outcome.problems) {
                        issues.push({
                            row: row.rowNumber,
                            message:
                                `[${row.sheetName}] ${row.productName}: ` +
                                problem,
                            kind: 'row-skipped',
                            sheetName: row.sheetName,
                            rows: [row.rowNumber],
                            productName: row.productName,
                            cells: sourceCells(row, ['sku']),
                            problem,
                        });
                    }

                    for (const collectionId of outcome.collectionIds) {
                        affectedCollectionIds.add(collectionId);
                    }

                    queueImages(productId, productRows);
                },
            );

            profiler.mark('existing products updated', {
                updated: updated.length,
            });

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

                    queueImages(product.productId, productRows);
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
                updated,
                issues,
                fatalError,
            });

            profiler.finish({
                created: created.length,
                updated: updated.length,
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
            updatedProducts: updated.length,
            issues,
            logFile,
        };
    }

    /**
     * Imports all images of a product from its rows' image links and makes
     * them the product's images (replacing earlier ones), the first one as
     * the featured image. When the sizes have their own image folders, each
     * variant also gets the first image of its folder. Every image that
     * fails is reported with the sheet, row, column and link it came from.
     */
    private async importProductImages(
        ctx: RequestContext,
        productId: ID,
        productRows: OPNImportRow[],
        cache: ImageImportCache,
        issues: ImportIssue[],
    ): Promise<void> {
        const productSlug = productRows[0].productSlug;

        // Every image link of every row of the product, once
        const linkByValue = new Map<
            string,
            { row: OPNImportRow; cell: OPNSourceCell }
        >();

        for (const row of productRows) {
            for (const cell of row.imageCells) {
                if (!linkByValue.has(cell.value)) {
                    linkByValue.set(cell.value, { row, cell });
                }
            }
        }

        const links = [...linkByValue.values()];
        const assetsByLink = new Map<string, ID[]>();

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

                assetsByLink.set(cell.value, imported.assetIds);

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

        // When every size has its own folder, the product shows the first
        // size's images (the folders mostly repeat each other) and each
        // variant gets its own folder's images
        const firstLinkAssets = assetsByLink.get(links[0].cell.value) ?? [];
        const productAssetIds =
            links.length > 1 && firstLinkAssets.length
                ? firstLinkAssets
                : assetIds;

        try {
            await this.products.update(ctx, {
                id: productId,
                assetIds: productAssetIds,
                featuredAssetId: productAssetIds[0],
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

            return;
        }

        // One image folder for the whole product: variants show the
        // product's images
        if (links.length < 2) {
            return;
        }

        try {
            const variants = await this.connection
                .getRepository(ctx, ProductVariant)
                .find({ where: { productId, deletedAt: IsNull() } });

            const updates = productRows.flatMap(row => {
                const variant = this.matchVariant(variants, row);
                const variantAssetIds = [
                    ...new Set(
                        row.imageCells.flatMap(
                            cell => assetsByLink.get(cell.value) ?? [],
                        ),
                    ),
                ];

                return variant && variantAssetIds.length
                    ? [
                          {
                              id: variant.id,
                              assetIds: variantAssetIds,
                              featuredAssetId: variantAssetIds[0],
                          },
                      ]
                    : [];
            });

            if (updates.length) {
                await this.variants.update(ctx, updates);
            }
        } catch (error) {
            reportFailure(
                links[0].row,
                links[0].cell,
                'Images were attached to the product, but not to its ' +
                    'sizes: ' +
                    (error instanceof Error
                        ? error.message
                        : 'unknown error'),
            );
        }
    }

    /** The variant of a product that a sheet row describes. */
    private matchVariant<
        T extends { sku: string; customFields?: unknown },
    >(variants: T[], row: OPNImportRow): T | undefined {
        return (
            variants.find(
                variant => normalize(variant.sku) === normalize(row.sku),
            ) ??
            (row.barcode
                ? variants.find(
                      variant =>
                          (variant.customFields as any)?.barcode ===
                          row.barcode,
                  )
                : undefined)
        );
    }

    // Product details stored in custom fields, from the product's rows
    private productCustomFields(productRows: OPNImportRow[]) {
        const first = (selector: (row: OPNImportRow) => string) =>
            firstValue(productRows, selector) || undefined;

        return {
            petType:
                uniqueValues(productRows.flatMap(row => mapPets(row))).join(
                    ', ',
                ) || undefined,
            isFood: productRows.some(row => row.isFood),
            ingredients: first(row => row.ingredients),
            usageAndFeeding: first(row => row.usageAndFeeding),
            keyPoints: first(row => row.keyPoints),
            analyticalConstituents: first(row => row.analyticalConstituents),
            countryOfOrigin: first(row => row.countryOfOrigin),
            manufacturerName: first(row => row.manufacturerName),
            manufacturerAddress: first(row => row.manufacturerAddress),
            supplierName: first(row => row.supplierName),
        };
    }

    // Variant details stored in custom fields, from its row
    private variantCustomFields(row: OPNImportRow) {
        return {
            itemCode: row.itemCode || undefined,
            barcode: row.barcode || undefined,
            asin: row.asin || undefined,
            unit: row.unit || undefined,
            weightInGrams: row.weightInGrams ?? undefined,
            packing: row.packing || undefined,
            hsnCode: row.hsnCode || undefined,
            gstPercentage: row.gstPercentage ?? undefined,
            shippingWeightGrams: row.shippingWeightGrams ?? undefined,
            casePack: row.casePack ?? undefined,
            shelfLifeYears: row.shelfLifeYears ?? undefined,
            packageLengthCm: row.packageLengthCm ?? undefined,
            packageWidthCm: row.packageWidthCm ?? undefined,
            packageHeightCm: row.packageHeightCm ?? undefined,
        };
    }

    /**
     * Rewrites a product that already exists from its sheet rows: name,
     * description, details, categories and filters, and its variants
     * (matched by SKU, barcode or size; sizes it does not have yet are
     * added). The slug stays, so links to the product keep working, and
     * variants not in the sheet are left as they are. Images are replaced
     * afterwards by importProductImages(). Runs inside the per-product
     * transaction started by import().
     */
    private async updateProduct(
        ctx: RequestContext,
        productId: ID,
        productRows: OPNImportRow[],
        languageCode: LanguageCode,
    ): Promise<{ collectionIds: ID[]; problems: RowProblem[] }> {
        const first = productRows[0];
        const problems: RowProblem[] = [];

        const taxonomy = await this.taxonomy.prepareProduct(ctx, productRows);

        const existing = await this.products.findOne(ctx, productId, [
            'optionGroups',
            'optionGroups.options',
        ]);

        if (!existing) {
            throw new Error(`Product ${productId} no longer exists`);
        }

        await this.products.update(ctx, {
            id: productId,
            enabled: true,
            facetValueIds: taxonomy.facetValueIds,
            translations: [
                {
                    languageCode,
                    name: first.productName,
                    slug: existing.slug,
                    description: firstValue(productRows, row => row.description),
                },
            ],
            customFields: this.productCustomFields(productRows),
        });

        const variants = await this.connection
            .getRepository(ctx, ProductVariant)
            .find({
                where: { productId, deletedAt: IsNull() },
                relations: ['options'],
            });

        // A product with one option group (e.g. Size) can be matched and
        // extended by option value
        const group =
            existing.optionGroups.length === 1
                ? existing.optionGroups[0]
                : undefined;

        const optionName = (option: { code: string; name?: string }) =>
            normalize(option.name ?? option.code);

        const usedVariantIds = new Set<ID>();
        const toUpdate: Parameters<ProductVariantService['update']>[1] = [];
        const toAdd: OPNImportRow[] = [];

        for (const row of productRows) {
            const free = variants.filter(
                variant => !usedVariantIds.has(variant.id),
            );
            const variant =
                this.matchVariant(free, row) ??
                (group && row.optionValue
                    ? free.find(item =>
                          item.options.some(
                              option =>
                                  optionName(option as any) ===
                                  normalize(row.optionValue),
                          ),
                      )
                    : undefined);

            if (!variant) {
                toAdd.push(row);
                continue;
            }

            usedVariantIds.add(variant.id);
            toUpdate.push({
                id: variant.id,
                enabled: row.price > 0 && row.active,
                price: Math.max(0, Math.round(row.price * 100)),
                translations: [
                    {
                        languageCode,
                        name: row.variantName || row.productName,
                    },
                ],
                customFields: this.variantCustomFields(row),
            });
        }

        if (toUpdate.length) {
            await this.variants.update(ctx, toUpdate);
        }

        if (!toAdd.length) {
            return { collectionIds: taxonomy.collectionIds, problems };
        }

        // New sizes need a value of the product's option group
        let sizeGroup = group;

        if (!sizeGroup && !existing.optionGroups.length && !variants.length) {
            const groupName = toAdd[0].optionGroup || 'Size';
            const created = await this.groups.create(ctx, {
                code: createCode(`${first.productSlug}-${groupName}`),
                translations: [{ languageCode, name: groupName }],
            });

            await this.products.addOptionGroupToProduct(
                ctx,
                productId,
                created.id,
            );
            sizeGroup = { ...created, options: [] } as any;
        }

        if (!sizeGroup) {
            for (const row of toAdd) {
                problems.push({
                    row,
                    problem:
                        `Size "${row.optionValue}" was not added: the ` +
                        'existing product has a different size structure. ' +
                        'Add this size in the dashboard.',
                });
            }

            return { collectionIds: taxonomy.collectionIds, problems };
        }

        const options = [...(sizeGroup.options ?? [])] as Array<{
            id: ID;
            code: string;
            name?: string;
        }>;

        for (const row of toAdd) {
            if (!row.optionValue) {
                problems.push({
                    row,
                    problem:
                        'Not added to the existing product: the row has ' +
                        'no size (Variant)',
                });
                continue;
            }

            let option = options.find(
                item => optionName(item) === normalize(row.optionValue),
            );

            if (!option) {
                option = await this.options.create(ctx, sizeGroup.id, {
                    code: createCode(row.optionValue),
                    translations: [{ languageCode, name: row.optionValue }],
                });
                options.push(option);
            }

            await this.variants.create(ctx, [
                {
                    productId,
                    enabled: row.price > 0 && row.active,
                    sku: row.sku,
                    price: Math.max(0, Math.round(row.price * 100)),
                    stockOnHand: row.stock,
                    optionIds: [option.id],
                    translations: [
                        {
                            languageCode,
                            name: row.variantName || row.productName,
                        },
                    ],
                    customFields: this.variantCustomFields(row),
                },
            ]);
        }

        return { collectionIds: taxonomy.collectionIds, problems };
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
                    customFields:
                        this.productCustomFields(productRows),
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
                    enabled: row.price > 0 && row.active,
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
                    customFields:
                        this.variantCustomFields(row),
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
