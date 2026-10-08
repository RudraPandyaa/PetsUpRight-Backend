export const PRODUCT_IMPORT_OPTIONS = Symbol('PRODUCT_IMPORT_OPTIONS');

export type ProductImportOptions = {
    /**
     * How many products are created at the same time. Each one uses a
     * database connection for its transaction, so this is kept well below
     * the connection pool size (10).
     */
    productConcurrency?: number;
    /** How many products have their images downloaded at the same time. */
    imageConcurrency?: number;
};

export const DEFAULT_PRODUCT_CONCURRENCY = 3;
export const DEFAULT_IMAGE_CONCURRENCY = 3;
export const MAX_PRODUCT_CONCURRENCY = 6;
export const MAX_IMAGE_CONCURRENCY = 10;

const clamp = (
    value: number | undefined,
    fallback: number,
    max: number,
): number =>
    Number.isFinite(value) && (value as number) >= 1
        ? Math.min(Math.floor(value as number), max)
        : fallback;

export function resolveImportOptions(
    options: ProductImportOptions = {},
): Required<ProductImportOptions> {
    return {
        productConcurrency: clamp(
            options.productConcurrency,
            DEFAULT_PRODUCT_CONCURRENCY,
            MAX_PRODUCT_CONCURRENCY,
        ),
        imageConcurrency: clamp(
            options.imageConcurrency,
            DEFAULT_IMAGE_CONCURRENCY,
            MAX_IMAGE_CONCURRENCY,
        ),
    };
}
