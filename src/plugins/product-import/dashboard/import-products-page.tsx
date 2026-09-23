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

const importMutation = graphql(`mutation ImportProductSheet($rows: JSON!) {
    importProductsFromSheet(rows: $rows) {
        products
        variants
        issues { row message }
    }
}`);

type Result = {
    products: number;
    variants: number;
    issues: { row: number; message: string }[];
};

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

export function ImportProductsPage() {
    const [rows, setRows] = useState<Record<string, unknown>[]>([]);
    const [preview, setPreview] = useState<Result>();
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
        if (!file) return;

        setRows([]);
        setPreview(undefined);
        setFileName('');

        try {
            if (!/\.xlsx$/i.test(file.name) || file.size > 2_000_000) {
                throw new Error('Choose an .xlsx file under 2 MB');
            }

            const book = XLSX.read(await file.arrayBuffer(), { type: 'array' });
            const sheet = book.Sheets[book.SheetNames[0]];
            const values = XLSX.utils.sheet_to_json<Record<string, unknown>>(
                sheet,
                { defval: '' },
            );

            if (!values.length || values.length > 2000) {
                throw new Error('The first sheet must contain 1–2000 variants');
            }

            const columns = Object.keys(values[0]);

            if (headers.some(header => !columns.includes(header))) {
                throw new Error('Sheet columns do not match the template');
            }

            setRows(values);
            setFileName(file.name);
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : 'Invalid workbook',
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
            const response = await api.mutate(importMutation, { rows });
            const result = response.importProductsFromSheet;

            if (result.issues.length) {
                setPreview(result);
            } else {
                toast.success(
                    `Created ${result.products} products and ${result.variants} variants`,
                );
                setRows([]);
                setPreview(undefined);
                setFileName('');
            }
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
                            One row per variant. Prices are in rupees. Existing
                            SKUs and product slugs are rejected.
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
                                    {preview.products} products,{' '}
                                    {preview.variants} variants,{' '}
                                    {preview.issues.length} errors
                                </p>

                                {preview.issues.map((issue, index) => (
                                    <p key={index}>
                                        Row {issue.row}: {issue.message}
                                    </p>
                                ))}

                                {!preview.issues.length && (
                                    <Button
                                        type="button"
                                        disabled={busy}
                                        onClick={run}
                                    >
                                        Import products
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                </PageBlock>
            </PageLayout>
        </Page>
    );
}