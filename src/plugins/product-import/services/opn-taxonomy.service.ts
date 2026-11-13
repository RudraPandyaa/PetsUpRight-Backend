import { Injectable } from '@nestjs/common';
import {
    CollectionService,
    Facet,
    FacetService,
    FacetValueService,
    ID,
    LanguageCode,
    RequestContext,
} from '@vendure/core';

import {
    allCategoryPaths,
    CategoryPath,
    categoryPathLevels,
    mapPets,
    mapRowToCategoryPaths,
} from './opn-category-map';
import type { OPNImportRow } from './opn-import.types';
import { OPN_FACETS } from './opn-taxonomy';

type FacetDefinition = {
    code: string;
    name: string;
};

type ProductTaxonomy = {
    facetValueIds: ID[];
    collectionIds: ID[];
};

const normalize = (value: string): string =>
    value.trim().toLowerCase();

const unique = (values: string[]): string[] => {
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
export class OpnTaxonomyService {
    private readonly facetCache = new Map<string, Facet>();
    private readonly facetValueCache = new Map<string, ID>();
    private readonly loadedFacetValues =
        new Set<string>();
    private readonly collectionCache = new Map<string, ID>();

    constructor(
        private readonly facets: FacetService,
        private readonly facetValues: FacetValueService,
        private readonly collections: CollectionService,
    ) {}

    /**
     * Forgets cached facet, facet value and collection IDs. Call it before an
     * import and after a product's transaction rolls back, because the cache
     * may then hold IDs of rows that were never committed.
     */
    resetCache(): void {
        this.facetCache.clear();
        this.facetValueCache.clear();
        this.loadedFacetValues.clear();
        this.collectionCache.clear();
    }

    private language(ctx: RequestContext): LanguageCode {
        return ctx.languageCode ?? LanguageCode.en;
    }

    private scopeKey(
        ctx: RequestContext,
        value: string,
    ): string {
        return `${String(ctx.channelId)}:${value}`;
    }

    private async ensureFacet(
        ctx: RequestContext,
        definition: FacetDefinition,
        isPrivate = false,
    ): Promise<Facet> {
        const cacheKey = this.scopeKey(
            ctx,
            definition.code,
        );

        const cached = this.facetCache.get(cacheKey);

        if (cached) {
            return cached;
        }

        let facet = await this.facets.findByCode(
            ctx,
            definition.code,
            this.language(ctx),
        );

        if (!facet) {
            facet = await this.facets.create(ctx, {
                code: definition.code,
                isPrivate,
                translations: [
                    {
                        languageCode: this.language(ctx),
                        name: definition.name,
                    },
                ],
            });
        }

        this.facetCache.set(cacheKey, facet);

        return facet;
    }

    private async ensureFacetValue(
        ctx: RequestContext,
        definition: FacetDefinition,
        value: string,
        valueCode?: string,
        isPrivate = false,
    ): Promise<ID | undefined> {
        const name = value.trim();

        if (!name) {
            return undefined;
        }

        const code =
            valueCode?.trim() ||
            name
                .toLowerCase()
                .replace(/&/g, 'and')
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');

        if (!code) {
            return undefined;
        }

        const cacheKey = this.scopeKey(
            ctx,
            `${definition.code}:${code}`,
        );

        const cached =
            this.facetValueCache.get(cacheKey);

        if (cached !== undefined) {
            return cached;
        }

        const facet = await this.ensureFacet(
            ctx,
            definition,
            isPrivate,
        );

        const facetCacheKey = this.scopeKey(
            ctx,
            definition.code,
        );

        if (!this.loadedFacetValues.has(facetCacheKey)) {
            const existingValues =
                await this.facetValues.findByFacetId(
                    ctx,
                    facet.id,
                );

            for (const existingValue of existingValues) {
                const codeKey = this.scopeKey(
                    ctx,
                    `${definition.code}:${normalize(
                        existingValue.code,
                    )}`,
                );

                const nameKey = this.scopeKey(
                    ctx,
                    `${definition.code}:${normalize(
                        existingValue.name,
                    )}`,
                );

                this.facetValueCache.set(
                    codeKey,
                    existingValue.id,
                );

                this.facetValueCache.set(
                    nameKey,
                    existingValue.id,
                );
            }

            this.loadedFacetValues.add(facetCacheKey);
        }

        const existingId =
            this.facetValueCache.get(cacheKey);

        if (existingId !== undefined) {
            return existingId;
        }

        let facetValue;

        if (!facetValue) {
            facetValue = await this.facetValues.create(
                ctx,
                facet,
                {
                    code,
                    translations: [
                        {
                            languageCode:
                                this.language(ctx),
                            name,
                        },
                    ],
                },
            );
        }

        this.facetValueCache.set(
            cacheKey,
            facetValue.id,
        );

        return facetValue.id;
    }

    private async ensureCollection(
        ctx: RequestContext,
        code: string,
        name: string,
        facetValueId: ID,
        parentId?: ID,
    ): Promise<ID> {
        const cacheKey = this.scopeKey(ctx, code);
        const cached =
            this.collectionCache.get(cacheKey);

        if (cached !== undefined) {
            return cached;
        }

        const existing =
            await this.collections.findOneBySlug(ctx, code);

        if (existing) {
            this.collectionCache.set(
                cacheKey,
                existing.id,
            );

            return existing.id;
        }

        const collection =
            await this.collections.create(ctx, {
                parentId,
                inheritFilters: false,
                isPrivate: false,
                filters: [
                    {
                        code: 'facet-value-filter',
                        arguments: [
                            {
                                name: 'facetValueIds',
                                value: JSON.stringify([
                                    String(facetValueId),
                                ]),
                            },
                            {
                                name: 'containsAny',
                                value: 'false',
                            },
                            {
                                name: 'combineWithAnd',
                                value: 'true',
                            },
                        ],
                    },
                ],
                translations: [
                    {
                        languageCode:
                            this.language(ctx),
                        name,
                        slug: code,
                        description: '',
                    },
                ],
            });

        this.collectionCache.set(
            cacheKey,
            collection.id,
        );

        return collection.id;
    }

    async prepareProduct(
        ctx: RequestContext,
        rows: OPNImportRow[],
    ): Promise<ProductTaxonomy> {
        const facetValueIds = new Set<ID>();
        const collectionIds = new Set<ID>();

        const addFacetValues = async (
            definition: FacetDefinition,
            values: string[],
        ) => {
            for (const value of unique(values)) {
                const id = await this.ensureFacetValue(
                    ctx,
                    definition,
                    value,
                );

                if (id !== undefined) {
                    facetValueIds.add(id);
                }
            }
        };

        await addFacetValues(
            OPN_FACETS.brand,
            rows.map(row => row.brand),
        );

        // The client's pet sections ("Small Animal" becomes "Hamster /
        // Guinea Pig / Turtle / Rabbit", "All" becomes Dog and Cat)
        await addFacetValues(
            OPN_FACETS.petType,
            rows.flatMap(row => mapPets(row)),
        );

        await addFacetValues(
            OPN_FACETS.lifeStage,
            rows.flatMap(row => row.lifeStages),
        );

        await addFacetValues(
            OPN_FACETS.breedSize,
            rows.flatMap(row => row.breedSizes),
        );

        await addFacetValues(
            OPN_FACETS.dietType,
            rows.flatMap(row => row.dietTypes),
        );

        await addFacetValues(
            OPN_FACETS.packingType,
            rows.map(row => row.packing),
        );

        // Place the product in the client's category structure
        for (const row of rows) {
            for (const path of mapRowToCategoryPaths(row)) {
                const placed = await this.ensureCategoryPath(
                    ctx,
                    path,
                );

                placed.facetValueIds.forEach(id =>
                    facetValueIds.add(id),
                );
                placed.collectionIds.forEach(id =>
                    collectionIds.add(id),
                );
            }
        }

        return {
            facetValueIds: [...facetValueIds],
            collectionIds: [...collectionIds],
        };
    }

    /**
     * Creates (or finds) the collections of a category path, pet first. Each
     * collection shows the products that carry its private "Collection Path"
     * facet value, so a product is given the facet values of every level.
     */
    private async ensureCategoryPath(
        ctx: RequestContext,
        path: CategoryPath,
    ): Promise<ProductTaxonomy> {
        const facetValueIds: ID[] = [];
        const collectionIds: ID[] = [];
        let parentId: ID | undefined;

        for (const level of categoryPathLevels(path)) {
            const facetValueId = await this.ensureFacetValue(
                ctx,
                OPN_FACETS.collectionPath,
                level.breadcrumb,
                level.code,
                true,
            );

            if (facetValueId === undefined) {
                break;
            }

            parentId = await this.ensureCollection(
                ctx,
                level.code,
                level.name,
                facetValueId,
                parentId,
            );

            facetValueIds.push(facetValueId);
            collectionIds.push(parentId);
        }

        return { facetValueIds, collectionIds };
    }

    /**
     * Creates every collection of the client's category structure, including
     * categories that have no products yet, so the storefront menu matches
     * the client's sitemap. Returns the collection IDs.
     */
    async ensureClientCategoryTree(
        ctx: RequestContext,
    ): Promise<ID[]> {
        const collectionIds = new Set<ID>();

        for (const path of allCategoryPaths()) {
            const placed = await this.ensureCategoryPath(ctx, path);
            placed.collectionIds.forEach(id => collectionIds.add(id));
        }

        return [...collectionIds];
    }

    /**
     * While paused, saving a product no longer queues a job that re-checks
     * every collection. A bulk import would otherwise queue one such job per
     * product. Resume afterwards and call refreshCollections() once.
     */
    pauseCollectionUpdates(): void {
        this.collections.setApplyAllFiltersOnProductUpdates(false);
    }

    resumeCollectionUpdates(): void {
        this.collections.setApplyAllFiltersOnProductUpdates(true);
    }

    async refreshCollections(
        ctx: RequestContext,
        collectionIds: ID[],
    ): Promise<void> {
        if (!collectionIds.length) {
            return;
        }

        await this.collections.triggerApplyFiltersJob(
            ctx,
            {
                collectionIds: unique(
                    collectionIds.map(String),
                ),
            },
        );
    }
}