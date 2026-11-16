import { AssetStorageStrategy } from '@vendure/core';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

/** cloudinary://API_KEY:API_SECRET@CLOUD_NAME -> its parts, or null if absent/invalid. */
function parseCloudinaryUrl(value: string | undefined) {
    const match = value?.trim().match(/^cloudinary:\/\/([^:@\s]+):([^@\s]+)@([^/?\s]+)/);
    if (!match) return null;
    return {
        apiKey: decodeURIComponent(match[1]),
        apiSecret: decodeURIComponent(match[2]),
        cloudName: match[3],
    };
}

export class CloudinaryAssetStorageStrategy implements AssetStorageStrategy {

    constructor() {
        // Either CLOUDINARY_URL (cloudinary://API_KEY:API_SECRET@CLOUD_NAME)
        // or the three separate variables. The separate variables win.
        const fromUrl = parseCloudinaryUrl(process.env.CLOUDINARY_URL);
        const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim() || fromUrl?.cloudName;
        const apiKey = process.env.CLOUDINARY_API_KEY?.trim() || fromUrl?.apiKey;
        const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim() || fromUrl?.apiSecret;

        if (!cloudName || !apiKey || !apiSecret) {
            throw new Error(
                'Cloudinary config missing: set CLOUDINARY_URL, or CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET',
            );
        }

        cloudinary.config({
            cloud_name: cloudName,
            api_key: apiKey,
            api_secret: apiSecret,
            secure: true,
        });
    }

    async writeFileFromBuffer(
        fileName: string,
        data: Buffer,
    ): Promise<string> {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: 'petsupright',
                    public_id: this.removeExtension(fileName),
                    resource_type: 'auto',
                    overwrite: true,
                },
                (error, result) => {
                    if (error) {
                        reject(error);
                        return;
                    }

                    if (!result) {
                        reject(new Error('Cloudinary upload failed'));
                        return;
                    }

                    resolve(result.secure_url);
                },
            );

            uploadStream.end(data);
        });
    }

    async writeFileFromStream(
        fileName: string,
        data: Readable,
    ): Promise<string> {
        const chunks: Buffer[] = [];

        for await (const chunk of data) {
            chunks.push(
                Buffer.isBuffer(chunk)
                    ? chunk
                    : Buffer.from(chunk),
            );
        }

        return this.writeFileFromBuffer(
            fileName,
            Buffer.concat(chunks),
        );
    }

    async readFileToBuffer(identifier: string): Promise<Buffer> {
        const response = await fetch(identifier);

        if (!response.ok) {
            throw new Error(
                `Failed to read Cloudinary asset: ${response.status} ${response.statusText}`,
            );
        }

        return Buffer.from(
            await response.arrayBuffer(),
        );
    }

    async readFileToStream(identifier: string): Promise<Readable> {
        const buffer =
            await this.readFileToBuffer(identifier);

        return Readable.from(buffer);
    }

    async deleteFile(identifier: string): Promise<void> {
        const publicId =
            this.getPublicIdFromUrl(identifier);

        await cloudinary.uploader.destroy(publicId, {
            resource_type: 'image',
        });
    }

    async fileExists(fileName: string): Promise<boolean> {
        try {
            const publicId =
                `petsupright/${this.removeExtension(fileName)}`;

            await cloudinary.api.resource(publicId);

            return true;
        } catch {
            return false;
        }
    }

    private removeExtension(fileName: string): string {
        return fileName
            .replace(/\.[^/.\\]+$/, '')
            .replace(/\\/g, '-')
            .replace(/\//g, '-')
            .replace(/\s+/g, '-')
            .replace(/[^a-zA-Z0-9_-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    }

    private getPublicIdFromUrl(url: string): string {
        const cleanUrl = url.split('?')[0];

        const uploadIndex =
            cleanUrl.indexOf('/upload/');

        if (uploadIndex === -1) {
            throw new Error(
                `Invalid Cloudinary URL: ${url}`,
            );
        }

        let publicId =
            cleanUrl.substring(
                uploadIndex + '/upload/'.length,
            );

        // Remove Cloudinary version, e.g. v178816...
        publicId = publicId.replace(/^v\d+\//, '');

        // Remove extension
        publicId = publicId.replace(/\.[^/.]+$/, '');

        return publicId;
    }
}