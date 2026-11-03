import { inflateRawSync } from 'node:zlib';

export type ZipEntry = {
    // Path inside the archive, e.g. "1.png" or "Front/1.png"
    name: string;
    data: Buffer;
};

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;

/**
 * Reads the files of a ZIP archive, e.g. a Dropbox folder downloaded as a
 * ZIP. Supports stored and deflated entries, which is what Dropbox and
 * common tools produce; folders and other compression methods are skipped.
 * `maxEntryBytes` skips files larger than that.
 */
export function readZipEntries(
    archive: Buffer,
    maxEntryBytes: number,
): ZipEntry[] {
    // The end record sits in the last 22 bytes plus an optional comment
    let end = -1;

    for (
        let offset = archive.length - 22;
        offset >= Math.max(0, archive.length - 22 - 0xffff);
        offset--
    ) {
        if (archive.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) {
            end = offset;
            break;
        }
    }

    if (end < 0) {
        throw new Error('Not a ZIP archive');
    }

    const entryCount = archive.readUInt16LE(end + 10);
    let offset = archive.readUInt32LE(end + 16);
    const entries: ZipEntry[] = [];

    for (let index = 0; index < entryCount; index++) {
        if (archive.readUInt32LE(offset) !== CENTRAL_DIRECTORY_ENTRY) {
            throw new Error('The ZIP archive is damaged');
        }

        const method = archive.readUInt16LE(offset + 10);
        const compressedSize = archive.readUInt32LE(offset + 20);
        const size = archive.readUInt32LE(offset + 24);
        const nameLength = archive.readUInt16LE(offset + 28);
        const extraLength = archive.readUInt16LE(offset + 30);
        const commentLength = archive.readUInt16LE(offset + 32);
        const localHeader = archive.readUInt32LE(offset + 42);
        const name = archive
            .subarray(offset + 46, offset + 46 + nameLength)
            .toString('utf8');

        offset += 46 + nameLength + extraLength + commentLength;

        if (
            name.endsWith('/') ||
            size === 0 ||
            size > maxEntryBytes ||
            (method !== 0 && method !== 8)
        ) {
            continue;
        }

        if (archive.readUInt32LE(localHeader) !== LOCAL_FILE_HEADER) {
            throw new Error('The ZIP archive is damaged');
        }

        // The local header's name and extra field can differ in length
        // from the central directory's
        const dataStart =
            localHeader +
            30 +
            archive.readUInt16LE(localHeader + 26) +
            archive.readUInt16LE(localHeader + 28);

        const raw = archive.subarray(dataStart, dataStart + compressedSize);

        entries.push({
            name,
            data: method === 0 ? Buffer.from(raw) : inflateRawSync(raw),
        });
    }

    return entries;
}
