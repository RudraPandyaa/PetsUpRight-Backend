import {
    api,
    Button,
    Page,
    PageBlock,
    PageLayout,
    PageTitle,
    toast,
} from '@vendure/dashboard';
import { graphql } from '@/gql';
import { useState } from 'react';
import * as XLSX from 'xlsx';

const previewQuery = graphql(`query PreviewProductSheet($rows: JSON!) {
    previewProductImport(rows: $rows) {
        products
        variants
        issues { row message }
    }
}`);

const importMutation = graphql(`mutation ImportProductSheet($rows: JSON!, $fileName: String) {
    importProductsFromSheet(rows: $rows, fileName: $fileName) {
        products
        variants
        issues { row message }
        logFile
    }
}`);

type Result = {
    products: number;
    variants: number;
    issues: { row: number; message: string }[];
    logFile?: string | null;
};

type WorkbookRow = Record<string, unknown>;

function normalizeExcelHeader(value: unknown): string {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}

const productHeaderNames = new Set([
    'productname',
    'opnproductname',
    'opnproducttitle',
    'productdescription',
]);

const itemCodeHeaderNames = new Set([
    'itemcode',
    'opnitemcode',
    'sku',
    'productcode',
    'newopncode',
    'productcode3',
]);

const priceHeaderNames = new Set([
    'mrp',
    'price',
    'newmrp',
    'newmrpeffectivefromnov2024',
    'newreducemrp',
    'reducemrp',
]);

function isOPNHeaderRow(row: unknown[]): boolean {
    const cells = row.map(normalizeExcelHeader);

    return (
        cells.some(cell => productHeaderNames.has(cell)) &&
        cells.some(cell => itemCodeHeaderNames.has(cell)) &&
        // Any MRP column ("MRP", "New MRP", "Reduce MRP", ...) or "Price"
        cells.some(
            cell =>
                priceHeaderNames.has(cell) || cell.includes('mrp'),
        )
    );
}

function createUniqueHeaders(row: unknown[]): string[] {
    const counts = new Map<string, number>();

    return row.map((value, index) => {
        const original =
            String(value ?? '').trim() ||
            `__emptyColumn${index}`;

        const normalized =
            normalizeExcelHeader(original);

        const count =
            (counts.get(normalized) ?? 0) + 1;

        counts.set(normalized, count);

        return count === 1
            ? original
            : `${original}${count}`;
    });
}

function parseOPNSheet(
    sheet: XLSX.WorkSheet,
    sheetName: string,
): WorkbookRow[] {
    const matrix =
        XLSX.utils.sheet_to_json<unknown[]>(sheet, {
            header: 1,
            defval: '',
            raw: false,
        });

    const rows: WorkbookRow[] = [];
    let activeHeaders: string[] | null = null;

    matrix.forEach((cells, rowIndex) => {
        if (isOPNHeaderRow(cells)) {
            activeHeaders = createUniqueHeaders(cells);
            return;
        }

        if (!activeHeaders) {
            return;
        }

        const row: WorkbookRow = {};

        activeHeaders.forEach((header, columnIndex) => {
            if (!header.startsWith('__emptyColumn')) {
                row[header] = cells[columnIndex] ?? '';
            }
        });

        const containsData = Object.values(row).some(
            value => String(value ?? '').trim() !== '',
        );

        if (!containsData) {
            return;
        }

        rows.push({
            ...row,
            __sheetName: sheetName,
            __rowNumber: rowIndex + 1,
        });
    });

    return rows;
}

const headers = [
    'productSlug',
    'productName',
    'description',
    'petType',
    'isFood',
    'ingredients',
    'usageAndFeeding',
    'specifications',
    'sku',
    'price',
    'stock',
    ...Array.from({ length: 5 }, (_, index) => [
        `option${index + 1}Group`,
        `option${index + 1}Value`,
    ]).flat(),
];

function IssueList({ issues }: { issues: Result['issues'] }) {
    return (
        <>
            {issues.slice(0, 100).map((issue, index) => (
                <p key={`${issue.row}-${index}`}>
                    Row {issue.row}: {issue.message}
                </p>
            ))}

            {issues.length > 100 && (
                <p>Showing the first 100 of {issues.length} issues.</p>
            )}
        </>
    );
}

export function ImportProductsPage() {
    const [rows, setRows] = useState<Record<string, unknown>[]>([]);
    const [preview, setPreview] = useState<Result>();
    const [imported, setImported] = useState<Result>();
    const [busy, setBusy] = useState(false);
    const [fileName, setFileName] = useState('');

    function template() {
        const book = XLSX.utils.book_new();
        const sheet = XLSX.utils.aoa_to_sheet([
            headers,

            [
                'healthy-dog-food',
                'Healthy Chicken Dog Food',
                'Complete daily food for adult dogs',
                'Dog',
                'Yes',
                'Chicken | Rice | Carrot | Fish Oil',
                'Serve according to the dog weight chart. Provide fresh water.',
                'Net weight: 1kg; Suitable for adult dogs',
                'HDF-1KG-CHICKEN',
                599,
                20,
                'Weight',
                '1kg',
                'Flavour',
                'Chicken',
            ],

            [
                'healthy-dog-food',
                'Healthy Chicken Dog Food',
                'Complete daily food for adult dogs',
                'Dog',
                'Yes',
                'Chicken | Rice | Carrot | Fish Oil',
                'Serve according to the dog weight chart. Provide fresh water.',
                'Net weight: 1kg; Suitable for adult dogs',
                'HDF-2KG-CHICKEN',
                999,
                12,
                'Weight',
                '2kg',
                'Flavour',
                'Chicken',
            ],

            [
                'comfortable-dog-bed',
                'Comfortable Dog Bed',
                'Soft and washable bed for dogs',
                'Dog',
                'No',
                '',
                '',
                'Material: Cotton; Washable cover: Yes',
                'CDB-M-BLUE',
                1299,
                8,
                'Size',
                'Medium',
                'Colour',
                'Blue',
            ],
        ]);
        sheet['!cols'] = [
            { wch: 25 }, // productSlug
            { wch: 30 }, // productName
            { wch: 45 }, // description
            { wch: 15 }, // petType
            { wch: 10 }, // isFood
            { wch: 50 }, // ingredients
            { wch: 55 }, // usageAndFeeding
            { wch: 45 }, // specifications
            { wch: 25 }, // sku
            { wch: 12 }, // price
            { wch: 12 }, // stock
            ...Array.from({ length: 10 }, () => ({ wch: 20 })),
        ];

        XLSX.utils.book_append_sheet(book, sheet, 'Products');
        XLSX.writeFile(book, 'petsupright-products.xlsx');
    }

    async function load(file?: File) {
        if (!file) {
            return;
        }

        setRows([]);
        setPreview(undefined);
        setImported(undefined);
        setFileName('');

        try {
            if (!/\.xlsx$/i.test(file.name)) {
                throw new Error('Choose a valid .xlsx file');
            }

            if (file.size > 15_000_000) {
                throw new Error('Choose an .xlsx file under 15 MB');
            }

            const book = XLSX.read(
                await file.arrayBuffer(),
                { type: 'array' },
            );

            // const values = book.SheetNames.flatMap(sheetName => {
            //     const sheet = book.Sheets[sheetName];

            //     if (!sheet) {
            //         return [];
            //     }

            //     const sheetRows =
            //         XLSX.utils.sheet_to_json<
            //             Record<string, unknown>
            //         >(sheet, {
            //             defval: '',
            //             raw: false,
            //         });

            //     return sheetRows.map((row, index) => ({
            //         ...row,
            //         __sheetName: sheetName,
            //         __rowNumber: index + 2,
            //     }));
            // }).filter(row =>
            //     Object.entries(row).some(
            //         ([key, value]) =>
            //             !key.startsWith('__') &&
            //             String(value ?? '').trim() !== '',
            //     ),
            // );

            const values = book.SheetNames.flatMap(
            sheetName => {
                    const sheet = book.Sheets[sheetName];

                    return sheet
                        ? parseOPNSheet(sheet, sheetName)
                        : [];
                },
            );

            if (!values.length) {
                throw new Error(
                    'The workbook contains no product rows',
                );
            }

            if (values.length > 10_000) {
                throw new Error(
                    'The workbook contains more than 10,000 rows',
                );
            }

            setRows(values);
            setFileName(file.name);
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : 'Invalid workbook',
            );
        }
    }

    async function validate() {
        setBusy(true);

        try {
            const result = await api.query(previewQuery, { rows });
            setPreview(result.previewProductImport);
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : 'Validation failed',
            );
        } finally {
            setBusy(false);
        }
    }

    async function run() {
        setBusy(true);

        try {
            const response = await api.mutate(importMutation, {
                rows,
                fileName,
            });
            const result = response.importProductsFromSheet;

            // Products are saved one at a time and rows with problems are
            // skipped, so show what was created and what was not.
            toast.success(
                `Created ${result.products} products and ${result.variants} variants` +
                (result.issues.length
                    ? ` (${result.issues.length} issues, see below)`
                    : ''),
            );

            setImported(result);
            setPreview(undefined);
            setRows([]);
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : 'Import failed',
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <Page pageId="product-import">
            <PageTitle>Import products</PageTitle>

            <PageLayout>
                <PageBlock
                    column="main"
                    blockId="import-products"
                    title="Excel import"
                >
                    <div className="space-y-4">
                        <p>
                            One row per variant. Prices are in rupees. Products
                            are saved one by one. Rows with problems and
                            products whose slug or SKU already exists are
                            skipped, and a log file lists every skipped row.
                        </p>

                        <div className="flex flex-wrap items-center gap-3">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={template}
                            >
                                Download template
                            </Button>

                            <label className="relative inline-flex h-9 cursor-pointer items-center justify-center rounded-md bg-sky-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-sky-400">
                                Choose Excel file
                                <input
                                    type="file"
                                    accept=".xlsx"
                                    aria-label="Choose Excel file to import"
                                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                    onChange={event => {
                                        void load(event.target.files?.[0]);
                                        event.target.value = '';
                                    }}
                                />
                            </label>

                            <span
                                className="text-sm text-muted-foreground"
                                aria-live="polite"
                            >
                                {fileName || 'No file selected'}
                            </span>
                        </div>

                        <p>{rows.length} variant rows loaded</p>

                        <Button
                            type="button"
                            disabled={!rows.length || busy}
                            onClick={validate}
                        >
                            Validate and preview
                        </Button>

                        {preview && (
                            <div className="space-y-2">
                                <p>
                                    {preview.products} products and{' '}
                                    {preview.variants} variants can be
                                    imported. {preview.issues.length} rows
                                    have problems and will be skipped.
                                </p>

                                <IssueList issues={preview.issues} />

                                {preview.variants > 0 && (
                                    <Button
                                        type="button"
                                        disabled={busy}
                                        onClick={run}
                                    >
                                        {preview.issues.length
                                            ? 'Import products and skip rows with problems'
                                            : 'Import products'}
                                    </Button>
                                )}

                                {busy && (
                                    <p aria-live="polite">
                                        Working… products are saved one by
                                        one, so you can follow progress in
                                        the product list.
                                    </p>
                                )}
                            </div>
                        )}

                        {imported && (
                            <div className="space-y-2">
                                <p>
                                    Created {imported.products} products
                                    and {imported.variants} variants.{' '}
                                    {imported.issues.length} issues.
                                </p>

                                {imported.logFile && (
                                    <p>
                                        Full details (sheet, row, column,
                                        value) are in{' '}
                                        <code>{imported.logFile}</code> in
                                        the backend folder.
                                    </p>
                                )}

                                <IssueList issues={imported.issues} />
                            </div>
                        )}
                    </div>
                </PageBlock>
            </PageLayout>
        </Page>
    );
}