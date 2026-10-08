import { Injectable } from '@nestjs/common';
import {
    AssetService,
    ID,
    RequestContext,
} from '@vendure/core';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';

import {
    DriveFolderFile,
    driveDownloadUrl,
    isJpegOrPng,
    listDriveFolder,
    parseDriveLink,
} from './google-drive';
import {
    isRetryable,
    RetryableHttpError,
    withRetry,
} from './async-pool';

type AssetImportResult = {
    assetId?: ID;
    error?: string;
};

/** Result of importing every image behind one link of the sheet. */
export type LinkImportResult = {
    assetIds: ID[];
    // `file` is the Drive file name for images from a folder
    errors: Array<{ file?: string; error: string }>;
};

/**
 * Shared by all products of one import, so an image used by several
 * products (or a folder linked from several rows) is downloaded and stored
 * only once.
 */
export type ImageImportCache = Map<string, Promise<AssetImportResult>>;

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 5;

const extensionByMimeType: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
};

/** The image type of a file, judged by its first bytes. */
function detectImageType(buffer: Buffer): string | undefined {
    if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
        return 'image/jpeg';
    }

    if (
        buffer
            .subarray(0, 8)
            .equals(
                Buffer.from([
                    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
                ]),
            )
    ) {
        return 'image/png';
    }

    if (buffer.subarray(0, 4).toString('ascii') === 'GIF8') {
        return 'image/gif';
    }

    if (
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
        return 'image/webp';
    }

    return undefined;
}

const safeFileName = (value: string): string =>
    value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 160) || 'product-image';

/**
 * File name for an imported image: a shortened product slug plus a part
 * that is unique per image (Drive file ID, or a hash of the URL), so images
 * never overwrite each other in Cloudinary.
 */
const imageFileName = (
    productSlug: string,
    uniquePart: string,
): string =>
    `${productSlug.slice(0, 80).replace(/-+$/, '')}-${uniquePart}`;

@Injectable()
export class OpnAssetService {
    constructor(
        private readonly assets: AssetService,
    ) {}

    private validateUrl(value: string): URL {
        const url = new URL(value);

        if (
            url.protocol !== 'https:' &&
            url.protocol !== 'http:'
        ) {
            throw new Error(
                'Only HTTP and HTTPS image URLs are supported',
            );
        }

        const hostname = url.hostname.toLowerCase();

        const blockedHostname =
            hostname === 'localhost' ||
            hostname.endsWith('.localhost') ||
            hostname.endsWith('.local') ||
            hostname === '127.0.0.1' ||
            hostname === '0.0.0.0' ||
            hostname === '::1' ||
            hostname.startsWith('10.') ||
            hostname.startsWith('192.168.') ||
            hostname.startsWith('169.254.');

        const secondOctet = Number(
            hostname.split('.')[1],
        );

        const private172 =
            hostname.startsWith('172.') &&
            secondOctet >= 16 &&
            secondOctet <= 31;

        if (blockedHostname || private172) {
            throw new Error(
                'Private or local image URLs are not allowed',
            );
        }

        return url;
    }

    /**
     * Fetches a URL, following redirects one at a time so that every hop
     * is checked against private and local addresses. Drive downloads
     * always redirect to the actual file.
     */
    private async fetchFollowingRedirects(
        value: string,
    ): Promise<{ response: Response; url: URL }> {
        let url = this.validateUrl(value);

        for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
            const response = await fetch(url, {
                redirect: 'manual',
                signal: AbortSignal.timeout(15_000),
                headers: {
                    Accept: 'image/*',
                    'User-Agent':
                        'PetsUpRight-Catalog-Importer/1.0',
                },
            });

            const location = response.headers.get('location');

            if (
                response.status >= 300 &&
                response.status < 400 &&
                location
            ) {
                url = this.validateUrl(
                    new URL(location, url).toString(),
                );

                continue;
            }

            return { response, url };
        }

        throw new Error('Too many redirects');
    }

    /**
     * Downloads one image and stores it as a Vendure asset (in Cloudinary).
     * With `onlyJpegOrPng`, other image types are rejected.
     */
    async importImage(
        ctx: RequestContext,
        imageUrl: string,
        fileBaseName: string,
        onlyJpegOrPng = false,
    ): Promise<AssetImportResult> {
        if (!imageUrl.trim()) {
            return {};
        }

        try {
            const { response, url } = await withRetry(
                async () => {
                    const result =
                        await this.fetchFollowingRedirects(
                            imageUrl.trim(),
                        );
                    const { status } = result.response;

                    // Google answers 429 when downloading too fast
                    if (status === 429 || status >= 500) {
                        throw new RetryableHttpError(
                            `Image request returned HTTP ${status}`,
                        );
                    }

                    return result;
                },
                isRetryable,
            );

            if (!response.ok) {
                throw new Error(
                    `Image request returned HTTP ${response.status}`,
                );
            }

            const declaredLength = Number(
                response.headers.get('content-length') ?? 0,
            );

            if (
                declaredLength > MAX_IMAGE_BYTES
            ) {
                throw new Error(
                    'Image is larger than 10 MB',
                );
            }

            const buffer = Buffer.from(
                await response.arrayBuffer(),
            );

            if (buffer.length > MAX_IMAGE_BYTES) {
                throw new Error(
                    'Image is larger than 10 MB',
                );
            }

            const contentType = (
                response.headers.get('content-type') ?? ''
            )
                .split(';')[0]
                .trim()
                .toLowerCase();

            // Only real image files are stored, judged by the file's bytes
            // rather than its name or header: Drive may send images as
            // application/octet-stream, and a link may point to a PDF or
            // a web page instead.
            const imageType = detectImageType(buffer);

            if (!imageType) {
                const fromGoogle =
                    /(^|\.)google(usercontent)?\.com$/i.test(
                        url.hostname,
                    );

                throw new Error(
                    fromGoogle && contentType === 'text/html'
                        ? 'Drive did not return an image. The file ' +
                              'may not be shared as "Anyone with the ' +
                              'link", may not be an image, or Drive\'s ' +
                              'download limit was reached'
                        : `Not an image (${contentType || 'unknown type'}); ` +
                              'only JPEG, PNG, WebP and GIF are imported',
                );
            }

            if (
                onlyJpegOrPng &&
                imageType !== 'image/jpeg' &&
                imageType !== 'image/png'
            ) {
                throw new Error(
                    `File is ${imageType}; only JPEG and PNG are imported`,
                );
            }

            const urlExtension =
                url.pathname.match(
                    /\.(jpg|jpeg|png|webp|gif)$/i,
                )?.[0];

            const extension =
                extensionByMimeType[imageType] ??
                urlExtension ??
                '.jpg';

            const asset =
                await this.assets.createFromFileStream(
                    Readable.from(buffer),
                    `${safeFileName(fileBaseName)}${extension}`,
                    ctx,
                );

            if ('errorCode' in asset) {
                return {
                    error:
                        asset.message ??
                        'Vendure rejected the image',
                };
            }

            return {
                assetId: asset.id,
            };
        } catch (error) {
            return {
                error:
                    error instanceof Error
                        ? error.message
                        : 'Unknown image import error',
            };
        }
    }

    private importCached(
        ctx: RequestContext,
        cache: ImageImportCache,
        cacheKey: string,
        imageUrl: string,
        fileBaseName: string,
        onlyJpegOrPng: boolean,
    ): Promise<AssetImportResult> {
        let result = cache.get(cacheKey);

        if (!result) {
            result = this.importImage(
                ctx,
                imageUrl,
                fileBaseName,
                onlyJpegOrPng,
            );
            cache.set(cacheKey, result);
        }

        return result;
    }

    /**
     * Imports every image behind one link from the sheet:
     * - Drive folder: its JPEG and PNG files (subfolders included), with
     *   files named "front" first
     * - Drive file link: that file
     * - any other link: the image it points to
     */
    async importImagesFromLink(
        ctx: RequestContext,
        link: string,
        productSlug: string,
        cache: ImageImportCache,
    ): Promise<LinkImportResult> {
        const result: LinkImportResult = {
            assetIds: [],
            errors: [],
        };

        const add = (
            imported: AssetImportResult,
            file?: string,
        ) => {
            if (imported.assetId !== undefined) {
                result.assetIds.push(imported.assetId);
            }

            if (imported.error) {
                result.errors.push({
                    file,
                    error: imported.error,
                });
            }
        };

        const drive = parseDriveLink(link);

        if (!drive) {
            add(
                await this.importCached(
                    ctx,
                    cache,
                    link,
                    link,
                    imageFileName(
                        productSlug,
                        createHash('sha1')
                            .update(link)
                            .digest('hex')
                            .slice(0, 12),
                    ),
                    false,
                ),
            );

            return result;
        }

        let files: DriveFolderFile[] | undefined;

        if (drive.kind === 'file-or-folder') {
            // Drive's folder view opens for a file ID too, but shows no
            // entries, so an empty result means it is a file
            files = await listDriveFolder(drive.id).catch(
                () => undefined,
            );

            if (!files?.length) {
                files = undefined;
            }
        }

        if (
            drive.kind === 'file' ||
            (drive.kind === 'file-or-folder' && !files)
        ) {
            add(
                await this.importCached(
                    ctx,
                    cache,
                    `drive:${drive.id}`,
                    driveDownloadUrl(drive.id),
                    imageFileName(productSlug, drive.id),
                    false,
                ),
            );

            return result;
        }

        try {
            files ??= await listDriveFolder(drive.id);
        } catch (error) {
            result.errors.push({
                error:
                    error instanceof Error
                        ? error.message
                        : 'Drive folder could not be opened',
            });

            return result;
        }

        const images = files
            .filter(isJpegOrPng)
            .sort(
                (a, b) =>
                    Number(/front/i.test(b.name)) -
                        Number(/front/i.test(a.name)) ||
                    a.name.localeCompare(b.name, undefined, {
                        numeric: true,
                    }),
            );

        if (!images.length) {
            result.errors.push({
                error:
                    `Drive folder has no JPEG or PNG files ` +
                    `(${files.length} other files)`,
            });

            return result;
        }

        // One at a time, so a product's images keep their order
        for (const file of images) {
            add(
                await this.importCached(
                    ctx,
                    cache,
                    `drive:${file.id}`,
                    driveDownloadUrl(file.id),
                    imageFileName(productSlug, file.id),
                    true,
                ),
                file.name,
            );
        }

        return result;
    }
}
