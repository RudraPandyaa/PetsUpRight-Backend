import { AssetStorageStrategy } from '@vendure/core';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

export class CloudinaryAssetStorageStrategy implements AssetStorageStrategy {

    constructor() {
        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET,
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