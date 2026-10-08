import { ID, Logger } from '@vendure/core';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
    ImportIssue,
    ImportIssueKind,
} from './import-validation.service';

export type CreatedProductLog = {
    productId: ID;
    productName: string;
    sheetName: string;
    rows: number[];
    variants: number;
};

export type ImportLog = {
    fileName?: string;
    adminUserId?: ID;
    startedAt: Date;
    finishedAt: Date;
    rowsRead: number;
    created: CreatedProductLog[];
    issues: ImportIssue[];
    // Set when the import stopped because of an unexpected error
    fatalError?: string;
};

// Relative to the backend folder, which is the working directory of
// `npm run dev` and `npm run start`.
export const IMPORT_LOG_DIR = 'import-logs';

const SECTIONS: Array<{
    kind: ImportIssueKind;
    title: string;
    action: string;
}> = [
    {
        kind: 'row-skipped',
        title: 'Rows skipped because of a problem',
        action: 'Row was not imported. Fix it and import the sheet again.',
    },
    {
        kind: 'product-skipped',
        title: 'Products skipped because they already exist',
        action: 'Product was not changed.',
    },
    {
        kind: 'product-failed',
        title: 'Products that failed to save',
        action: 'Nothing was saved for this product.',
    },
    {
        kind: 'image-failed',
        title: 'Images that could not be added',
        action: 'Product was imported without this image.',
    },
];

const pad = (value: number): string =>
    String(value).padStart(2, '0');

const formatDate = (date: Date): string =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-` +
    `${pad(date.getDate())} ${pad(date.getHours())}:` +
    `${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

const formatDuration = (ms: number): string => {
    const seconds = Math.round(ms / 1000);

    return seconds >= 60
        ? `${Math.floor(seconds / 60)}m ${seconds % 60}s`
        : `${seconds}s`;
};

const heading = (text: string): string[] => [
    text,
    '-'.repeat(text.length),
];

const formatRows = (rows: number[]): string =>
    rows.length === 1
        ? String(rows[0])
        : rows.join(', ');

function formatIssue(
    issue: ImportIssue,
    index: number,
    action: string,
): string[] {
    const lines = [
        `${index + 1}.`,
        `   Sheet:    ${issue.sheetName ?? '(unknown)'}`,
        `   Row:      ${formatRows(issue.rows ?? [issue.row])}`,
    ];

    if (issue.productName) {
        lines.push(`   Product:  ${issue.productName}`);
    }

    for (const cell of issue.cells ?? []) {
        lines.push(
            `   Column:   ${cell.column} = "${cell.value}"`,
        );
    }

    lines.push(
        `   Problem:  ${issue.problem ?? issue.message}`,
        `   Action:   ${action}`,
        '',
    );

    return lines;
}

function render(log: ImportLog): string {
    const count = (kind: ImportIssueKind) =>
        log.issues.filter(issue => issue.kind === kind).length;

    const createdVariants = log.created.reduce(
        (total, product) => total + product.variants,
        0,
    );

    const lines: string[] = [
        'PetsUpRight product import log',
        '==============================',
        `File:       ${log.fileName || '(not given)'}`,
        `Admin user: ${log.adminUserId ?? '(unknown)'}`,
        `Started:    ${formatDate(log.startedAt)}`,
        `Finished:   ${formatDate(log.finishedAt)} ` +
            `(${formatDuration(
                log.finishedAt.getTime() -
                    log.startedAt.getTime(),
            )})`,
        '',
    ];

    if (log.fatalError) {
        lines.push(
            'IMPORT STOPPED EARLY because of an unexpected error:',
            `  ${log.fatalError}`,
            'Products listed under "Products created" were saved.',
            '',
        );
    }

    lines.push(
        ...heading('Summary'),
        `Rows read from the sheet:      ${log.rowsRead}`,
        `Rows skipped (problems):       ${count('row-skipped')}`,
        `Products created:              ${log.created.length} ` +
            `(${createdVariants} variants)`,
        `Products skipped (exist):      ${count('product-skipped')}`,
        `Products failed to save:       ${count('product-failed')}`,
        `Images that failed:            ${count('image-failed')}`,
        '',
    );

    for (const section of SECTIONS) {
        const issues = log.issues
            .filter(issue => issue.kind === section.kind)
            .sort(
                (a, b) =>
                    (a.sheetName ?? '').localeCompare(
                        b.sheetName ?? '',
                    ) || a.row - b.row,
            );

        if (!issues.length) {
            continue;
        }

        lines.push(
            ...heading(`${section.title} (${issues.length})`),
            '',
        );

        issues.forEach((issue, index) => {
            lines.push(
                ...formatIssue(issue, index, section.action),
            );
        });
    }

    if (log.created.length) {
        lines.push(
            ...heading(`Products created (${log.created.length})`),
        );

        for (const product of log.created) {
            lines.push(
                `[${product.sheetName}] row ` +
                    `${formatRows(product.rows)}: ` +
                    `${product.productName} ` +
                    `(${product.variants} variant` +
                    `${product.variants === 1 ? '' : 's'}, ` +
                    `product ID ${product.productId})`,
            );
        }

        lines.push('');
    }

    return lines.join('\n');
}

/**
 * Writes the import log to import-logs/ in the backend folder and returns
 * its path relative to that folder, or undefined if it could not be
 * written. A failure to write the log never fails the import.
 */
export async function writeImportLog(
    log: ImportLog,
): Promise<string | undefined> {
    const stamp = formatDate(log.startedAt)
        .replace(' ', '_')
        .replace(/:/g, '-');

    const relativePath = path.join(
        IMPORT_LOG_DIR,
        `import-${stamp}.txt`,
    );

    try {
        await mkdir(IMPORT_LOG_DIR, { recursive: true });
        await writeFile(relativePath, render(log), 'utf8');

        Logger.info(
            `Import log written to ${relativePath}`,
            'OPN Import',
        );

        return relativePath.replace(/\\/g, '/');
    } catch (error) {
        Logger.error(
            `Could not write import log: ${
                error instanceof Error
                    ? error.message
                    : String(error)
            }`,
            'OPN Import',
        );

        return undefined;
    }
}
