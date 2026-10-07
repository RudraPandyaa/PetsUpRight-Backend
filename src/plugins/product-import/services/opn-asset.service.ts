import { Injectable } from '@nestjs/common';
import {
    AssetService,
    ID,
    RequestContext,
} from '@vendure/core';
import { Readable } from 'node:stream';

type AssetImportResult = {
    assetId?: ID;
    error?: string;
};

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const extensionByMimeType: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
};

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

    async importImage(
        ctx: RequestContext,
        imageUrl: string,
        fileBaseName: string,
    ): Promise<AssetImportResult> {
        if (!imageUrl.trim()) {
            return {};
        }

        try {
            const url = this.validateUrl(
                imageUrl.trim(),
            );

            const response = await fetch(url, {
                redirect: 'error',
                signal: AbortSignal.timeout(15_000),
                headers: {
                    Accept: 'image/*',
                    'User-Agent':
                        'PetsUpRight-Catalog-Importer/1.0',
                },
            });

            if (!response.ok) {
                throw new Error(
                    `Image request returned HTTP ${response.status}`,
                );
            }

            const contentType = (
                response.headers.get('content-type') ?? ''
            )
                .split(';')[0]
                .trim()
                .toLowerCase();

            if (!contentType.startsWith('image/')) {
                throw new Error(
                    `URL returned ${contentType || 'unknown content type'}`,
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

            const urlExtension =
                url.pathname.match(
                    /\.(jpg|jpeg|png|webp|gif)$/i,
                )?.[0];

            const extension =
                urlExtension ??
                extensionByMimeType[contentType] ??
                '.jpg';

            const safeName =
                fileBaseName
                    .trim()
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-+|-+$/g, '') ||
                'product-image';

            const asset =
                await this.assets.createFromFileStream(
                    Readable.from(buffer),
                    `${safeName}${extension}`,
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
}