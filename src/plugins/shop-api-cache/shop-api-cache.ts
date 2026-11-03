import type { ApolloServerPlugin } from '@apollo/server';
import { Kind, OperationDefinitionNode } from 'graphql';

/**
 * Short-lived in-memory cache for public catalog queries on the Shop API.
 *
 * Every catalog query runs many small database queries one after another, so
 * with a remote database a product page takes seconds. Identical catalog
 * queries within the TTL are answered from memory instead.
 *
 * - Only queries whose root fields are all in CACHEABLE_FIELDS are cached, so
 *   cart, customer, order and checkout data always comes from the database.
 * - The key includes the session (bearer token or cookie) and channel, so
 *   prices that depend on the session's tax zone are never shared.
 * - Any mutation on either API (an order, a cart change, an admin edit)
 *   empties the whole cache.
 *
 * SHOP_API_CACHE_TTL_MS sets the TTL (default 60s); 0 turns the cache off.
 */
const CACHEABLE_FIELDS = new Set([
    '__typename',
    'activeChannel',
    'availableCountries',
    'cmsPageBySlug',
    'collection',
    'collections',
    'facet',
    'facets',
    'featuredProductReviews',
    'product',
    'productRating',
    'productRatings',
    'productReviews',
    'products',
    'search',
]);

const MAX_ENTRIES = 1000;

const ttlMs = Number(process.env.SHOP_API_CACHE_TTL_MS ?? 60_000);

const cache = new Map<string, { expires: number; result: any }>();

// Bumped by every mutation, so a query that was running while data changed
// does not store its now-stale result
let generation = 0;

function isCacheableQuery(operation: OperationDefinitionNode | undefined): boolean {
    if (!operation || operation.operation !== 'query') {
        return false;
    }

    return operation.selectionSet.selections.every(
        selection =>
            selection.kind === Kind.FIELD &&
            CACHEABLE_FIELDS.has(selection.name.value),
    );
}

function header(req: any, name: string): string {
    const value = req?.headers?.[name];
    return Array.isArray(value) ? value.join(',') : String(value ?? '');
}

export const shopApiCachePlugin: ApolloServerPlugin<any> = {
    async requestDidStart(requestContext) {
        const req = requestContext.contextValue?.req;
        const isShopApi = String(req?.originalUrl ?? '').startsWith('/shop-api');
        const startGeneration = generation;
        let cacheKey: string | undefined;

        return {
            async responseForOperation(context) {
                if (context.operation?.operation === 'mutation') {
                    generation++;
                    cache.clear();
                    return null;
                }

                if (ttlMs <= 0 || !isShopApi || !isCacheableQuery(context.operation)) {
                    return null;
                }

                cacheKey = JSON.stringify([
                    header(req, 'authorization'),
                    header(req, 'cookie'),
                    header(req, 'vendure-token'),
                    req?.query?.languageCode ?? '',
                    context.request.query,
                    context.request.operationName ?? '',
                    context.request.variables ?? {},
                ]);

                const hit = cache.get(cacheKey);

                if (!hit) {
                    return null;
                }

                if (hit.expires <= Date.now()) {
                    cache.delete(cacheKey);
                    return null;
                }

                return {
                    http: context.response.http,
                    body: { kind: 'single', singleResult: hit.result },
                };
            },

            async willSendResponse(context) {
                const { body } = context.response;

                if (
                    !cacheKey ||
                    generation !== startGeneration ||
                    body.kind !== 'single' ||
                    body.singleResult.errors?.length ||
                    cache.has(cacheKey)
                ) {
                    return;
                }

                if (cache.size >= MAX_ENTRIES) {
                    // Maps keep insertion order, so the first key is the oldest
                    const oldest = cache.keys().next().value;
                    if (oldest !== undefined) cache.delete(oldest);
                }

                cache.set(cacheKey, {
                    expires: Date.now() + ttlMs,
                    result: body.singleResult,
                });
            },
        };
    },
};
