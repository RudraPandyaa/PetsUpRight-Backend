/**
 * Helpers for Dropbox links in the product sheet. Links must be shared as
 * "Anyone with the link". No API key is used: a shared folder downloads as
 * a ZIP of its files (dl=1), and a shared file downloads directly (raw=1).
 */

export type DropboxLink =
    // `downloadUrl` returns the folder as a ZIP archive
    | { kind: 'folder'; downloadUrl: string }
    // `downloadUrl` returns the file itself
    | { kind: 'file'; downloadUrl: string };

const DROPBOX_HOSTS = new Set(['dropbox.com', 'www.dropbox.com']);

/** Recognises Dropbox folder and file links; other URLs return undefined. */
export function parseDropboxLink(value: string): DropboxLink | undefined {
    let url: URL;

    try {
        url = new URL(value.trim());
    } catch {
        return undefined;
    }

    if (!DROPBOX_HOSTS.has(url.hostname.toLowerCase())) {
        return undefined;
    }

    // Shared folders: /scl/fo/<id>/<key>?rlkey=... and the older /sh/<id>/...
    const isFolder = /^\/(scl\/fo|sh)\//.test(url.pathname);

    // rlkey (the share key) must stay; only the download mode changes
    url.searchParams.delete('dl');
    url.searchParams.delete('raw');

    if (isFolder) {
        url.searchParams.set('dl', '1');
        return { kind: 'folder', downloadUrl: url.toString() };
    }

    url.searchParams.set('raw', '1');
    return { kind: 'file', downloadUrl: url.toString() };
}

/**
 * Order of a folder's images: files named "front" first, then by name with
 * numbers in numeric order ("2.png" before "10.png").
 */
export function compareImageNames(a: string, b: string): number {
    return (
        Number(/front/i.test(b)) - Number(/front/i.test(a)) ||
        a.localeCompare(b, undefined, { numeric: true })
    );
}
