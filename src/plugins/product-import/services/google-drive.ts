/**
 * Helpers for Google Drive links in the product sheet. Folders must be shared
 * as "Anyone with the link". No API key is used: folders are listed through
 * Drive's public embedded folder view, and files are downloaded through the
 * public download URL.
 */

import {
    isRetryable,
    RetryableHttpError,
    withRetry,
} from './async-pool';

export type DriveLink =
    | { kind: 'folder'; id: string }
    | { kind: 'file'; id: string }
    // open?id=... links are used for both files and folders
    | { kind: 'file-or-folder'; id: string };

export type DriveFolderFile = {
    id: string;
    name: string;
    // e.g. "image/jpeg"; empty if Drive did not show it
    mimeType: string;
};

const DRIVE_HOSTS = new Set([
    'drive.google.com',
    'docs.google.com',
]);

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

// Subfolders deeper than this are not opened
const MAX_FOLDER_DEPTH = 2;

/** Recognises Drive folder and file links; other URLs return undefined. */
export function parseDriveLink(value: string): DriveLink | undefined {
    let url: URL;

    try {
        url = new URL(value.trim());
    } catch {
        return undefined;
    }

    if (!DRIVE_HOSTS.has(url.hostname.toLowerCase())) {
        return undefined;
    }

    const folder = url.pathname.match(
        /\/folders\/([A-Za-z0-9_-]+)/,
    );

    if (folder) {
        return { kind: 'folder', id: folder[1] };
    }

    const file = url.pathname.match(
        /\/(?:file\/)?d\/([A-Za-z0-9_-]+)/,
    );

    if (file) {
        return { kind: 'file', id: file[1] };
    }

    // uc?id=... is always a file; open?id=... may be a file or a folder
    const id = url.searchParams.get('id');

    if (id && /^[A-Za-z0-9_-]+$/.test(id)) {
        return url.pathname.startsWith('/uc')
            ? { kind: 'file', id }
            : { kind: 'file-or-folder', id };
    }

    return undefined;
}

/** Public URL that downloads the file itself (after a redirect). */
export function driveDownloadUrl(fileId: string): string {
    return (
        'https://drive.google.com/uc?export=download&id=' +
        encodeURIComponent(fileId)
    );
}

const decodeHtml = (value: string): string =>
    value
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#(\d+);/g, (_, code) =>
            String.fromCharCode(Number(code)),
        )
        .trim();

function parseFolderPage(html: string): DriveFolderFile[] {
    const files: DriveFolderFile[] = [];

    // Each file or subfolder is a <div class="flip-entry" id="entry-ID">
    // with its type in an icon URL (".../type/image/jpeg") and its name in
    // <div class="flip-entry-title">.
    const entries = html.split('class="flip-entry"').slice(1);

    for (const entry of entries) {
        const id = entry.match(/id="entry-([A-Za-z0-9_-]+)"/)?.[1];

        if (!id) {
            continue;
        }

        const name = decodeHtml(
            entry.match(
                /class="flip-entry-title">([^<]*)</,
            )?.[1] ?? '',
        );

        const isFolder =
            /\/drive\/folders\//.test(
                entry.match(/<a href="([^"]+)"/)?.[1] ?? '',
            );

        const mimeType = isFolder
            ? FOLDER_MIME_TYPE
            : entry.match(
                  /\/type\/([a-z]+\/[A-Za-z0-9.+-]+)/,
              )?.[1] ?? '';

        files.push({ id, name, mimeType });
    }

    return files;
}

/**
 * Lists the files of a public Drive folder, including files in its
 * subfolders, in the order Drive shows them.
 */
export async function listDriveFolder(
    folderId: string,
    depth = 0,
): Promise<DriveFolderFile[]> {
    const { response, html } = await withRetry(
        async () => {
            const response = await fetch(
                'https://drive.google.com/embeddedfolderview?id=' +
                    encodeURIComponent(folderId),
                {
                    signal: AbortSignal.timeout(15_000),
                    headers: {
                        'User-Agent':
                            'PetsUpRight-Catalog-Importer/1.0',
                    },
                },
            );

            // Google answers 429 when requests come too fast
            if (response.status === 429 || response.status >= 500) {
                throw new RetryableHttpError(
                    `Drive returned HTTP ${response.status}`,
                );
            }

            return { response, html: await response.text() };
        },
        isRetryable,
    );

    // The "flip-entries" list is rendered even for an empty folder; private
    // or missing folders return an error or a sign-in page instead.
    if (!response.ok || !html.includes('class="flip-entries"')) {
        throw new Error(
            'Drive folder could not be opened. Make sure it is ' +
                'shared as "Anyone with the link" ' +
                `(HTTP ${response.status})`,
        );
    }

    const result: DriveFolderFile[] = [];

    for (const file of parseFolderPage(html)) {
        if (file.mimeType !== FOLDER_MIME_TYPE) {
            result.push(file);
        } else if (depth < MAX_FOLDER_DEPTH) {
            result.push(
                ...(await listDriveFolder(file.id, depth + 1)),
            );
        }
    }

    return result;
}

/** True for JPEG and PNG files, judged by Drive's type or the file name. */
export function isJpegOrPng(file: DriveFolderFile): boolean {
    if (file.mimeType) {
        return (
            file.mimeType === 'image/jpeg' ||
            file.mimeType === 'image/png'
        );
    }

    return /\.(jpe?g|png)$/i.test(file.name);
}
