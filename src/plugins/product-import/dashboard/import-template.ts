import type * as XLSXModule from 'xlsx';

import {
    CLIENT_CATEGORY_TREE,
    SMALL_ANIMALS,
} from '../services/opn-category-map';

/**
 * The product import template offered to the client: the product master
 * layout (Brand, UPC/EAN Code, SKU, Product Title, ...) that
 * master-row-parser.ts reads, with every field the import saves. Used by the
 * dashboard's "Download template" button and by
 * scripts/generate-import-template.ts, which writes the same file to
 * templates/.
 */

export type ColumnNeed = 'Required' | 'Recommended' | 'Optional';

export type TemplateColumn = {
    header: string;
    need: ColumnNeed;
    // What to enter, for the Instructions sheet
    help: string;
    width: number;
};

export const TEMPLATE_FILE_NAME = 'PetsUpRight-Product-Import-Template.xlsx';

// L2 starts with one of these, e.g. "Dogs-Food"
const PET_LABELS: Record<string, string> = {
    Dog: 'Dogs',
    Cat: 'Cats',
    Bird: 'Birds',
    [SMALL_ANIMALS]: 'Small Animals',
    Fish: 'Fish',
    Horse: 'Horses',
};

export const TEMPLATE_COLUMNS: TemplateColumn[] = [
    {
        header: 'Brand',
        need: 'Required',
        help: 'Brand name, e.g. "Pedigree". Shown as a filter on the website.',
        width: 16,
    },
    {
        header: 'SKU',
        need: 'Required',
        help:
            'Product name WITHOUT the size, the same on every row of the ' +
            'product, e.g. "Pedigree Adult Dry Dog Food Chicken". Rows with ' +
            'the same Brand and SKU become one product with several sizes.',
        width: 40,
    },
    {
        header: 'Product Title',
        need: 'Required',
        help:
            'Full name of this size as shown to customers, e.g. "Pedigree ' +
            'Adult Dry Dog Food Chicken, 3 kg".',
        width: 50,
    },
    {
        header: 'Variant',
        need: 'Required',
        help:
            'The size or pack of this row, e.g. "3kg", "20L", "12 x 70g". ' +
            'Must be different for each row of the same product.',
        width: 14,
    },
    {
        header: 'MRP',
        need: 'Required',
        help:
            'Price in rupees including GST, numbers only, e.g. 1250. ' +
            '0 imports the size without selling it.',
        width: 10,
    },
    {
        header: 'L2',
        need: 'Required',
        help:
            'Pet and category, exactly as listed on the Categories sheet, ' +
            'e.g. "Dogs-Food" or "Cats-Clean & Hygiene". Decides where the ' +
            'product appears on the website.',
        width: 24,
    },
    {
        header: 'L3',
        need: 'Optional',
        help:
            'Subcategory from the Categories sheet, e.g. "Dry Food" or ' +
            '"Shampoo". Leave empty to show the product under the L2 ' +
            'category only.',
        width: 18,
    },
    {
        header: 'Product Images',
        need: 'Recommended',
        help:
            'Link to a Google Drive or Dropbox FOLDER containing the images ' +
            'of this size (JPEG or PNG), shared as "Anyone with the link". A ' +
            'link to a single image file also works. Images are imported in ' +
            'name order (1, 2, 3 ...; a file named "front" comes first) and ' +
            'the first one is the main image. When every size has its own ' +
            'folder, each size shows its own images.',
        width: 45,
    },
    {
        header: 'UPC/EAN Code',
        need: 'Recommended',
        help:
            'Barcode of this size, all digits, e.g. 4008429095115. Used to ' +
            'find the product again when the sheet is imported a second ' +
            'time. Format the column as Text or Number with 0 decimals so ' +
            'Excel does not show it as 4.00843E+12.',
        width: 18,
    },
    {
        header: 'Product Description',
        need: 'Recommended',
        help: 'Description shown on the product page. Same on every row of the product.',
        width: 50,
    },
    {
        header: 'Product Features',
        need: 'Optional',
        help:
            'Key points, one per line starting with "•". Same on every row ' +
            'of the product.',
        width: 50,
    },
    {
        header: 'Ingredients',
        need: 'Optional',
        help: 'Ingredients, for food and treats.',
        width: 40,
    },
    {
        header: 'Analytical Constituents',
        need: 'Optional',
        help: 'Protein, fat, fibre ..., for food and treats.',
        width: 30,
    },
    {
        header: 'Feeding Guidelines',
        need: 'Optional',
        help: 'Feeding or usage instructions.',
        width: 40,
    },
    {
        header: 'Life Stage',
        need: 'Optional',
        help:
            'e.g. Puppy, Kitten, Adult, Senior, All. Several separated by ' +
            'commas. Shown as a filter.',
        width: 14,
    },
    {
        header: 'Breed Size',
        need: 'Optional',
        help: 'e.g. Small, Medium, Large, All. Shown as a filter.',
        width: 12,
    },
    {
        header: 'Diet Type',
        need: 'Optional',
        help: 'Veg, Non Veg or Vegan. Shown as a filter.',
        width: 12,
    },
    {
        header: 'Gms',
        need: 'Optional',
        help: 'Weight of this size in grams, numbers only, e.g. 3000.',
        width: 9,
    },
    {
        header: 'Shipping Weight (g)',
        need: 'Recommended',
        help:
            'Actual packed weight of one variant in grams, including its packaging. ' +
            'Required for Shiprocket delivery.',
        width: 22,
    },
    {
        header: 'Packing',
        need: 'Optional',
        help: 'e.g. Bag, Pouch, Can, Bottle, Box. Shown as a filter.',
        width: 10,
    },
    {
        header: 'Casesize',
        need: 'Optional',
        help: 'Units per case, numbers only.',
        width: 9,
    },
    {
        header: 'Shelf Life (Days)',
        need: 'Optional',
        help: 'Shelf life in days, numbers only, e.g. 540.',
        width: 12,
    },
    {
        header: 'GST',
        need: 'Optional',
        help: 'GST rate, e.g. 18% (or 0.18).',
        width: 8,
    },
    {
        header: 'HSN',
        need: 'Optional',
        help: 'HSN code, e.g. 23091000.',
        width: 12,
    },
    {
        header: 'Item Code',
        need: 'Optional',
        help: 'Your own item code for this size.',
        width: 12,
    },
    {
        header: 'ASIN',
        need: 'Optional',
        help: 'Amazon ASIN of this size.',
        width: 12,
    },
    {
        header: 'Country of Origin',
        need: 'Optional',
        help: 'e.g. India, Thailand.',
        width: 14,
    },
    {
        header: 'Vendor',
        need: 'Optional',
        help: 'Supplier the product is bought from, e.g. "Mars Ind".',
        width: 14,
    },
    {
        header: 'Manufacturer Name',
        need: 'Optional',
        help: 'Manufacturer, if different from the vendor.',
        width: 22,
    },
    {
        header: 'Manufacturer Address',
        need: 'Optional',
        help: 'Manufacturer address.',
        width: 30,
    },
    {
        header: 'Package Length (cm)',
        need: 'Optional',
        help: 'Package length in cm, numbers only.',
        width: 10,
    },
    {
        header: 'Package Width (cm)',
        need: 'Optional',
        help: 'Package width in cm, numbers only.',
        width: 10,
    },
    {
        header: 'Package Height (cm)',
        need: 'Optional',
        help: 'Package height in cm, numbers only.',
        width: 10,
    },
    {
        header: 'Status',
        need: 'Optional',
        help:
            'Active (default) or Inactive. Inactive sizes are imported but ' +
            'not sold.',
        width: 10,
    },
];

// Example rows: a product with two sizes, each with its own image folder,
// and a product with one size
const SAMPLE_ROWS: Array<Record<string, string | number>> = [
    {
        Brand: 'Pedigree',
        SKU: 'Pedigree Adult Dry Dog Food Chicken & Vegetables',
        'Product Title': 'Pedigree Adult Dry Dog Food Chicken & Vegetables, 3 kg',
        Variant: '3kg',
        MRP: 899,
        L2: 'Dogs-Food',
        L3: 'Dry Food',
        'Product Images':
            'https://www.dropbox.com/scl/fo/EXAMPLE-FOLDER-3KG/EXAMPLE?rlkey=EXAMPLE&dl=0',
        'UPC/EAN Code': '8906002480011',
        'Product Description':
            'Complete and balanced food for adult dogs with real chicken and vegetables.',
        'Product Features':
            '• Real chicken as a source of protein\n• Supports healthy digestion\n• Omega 6 for a shiny coat',
        Ingredients: 'Cereals, chicken meal, vegetable oil, vegetables, vitamins and minerals',
        'Analytical Constituents': 'Protein 21%, Fat 10%, Fibre 5%, Moisture 12%',
        'Feeding Guidelines': 'Feed 2 to 3 times a day according to body weight. Keep fresh water available.',
        'Life Stage': 'Adult',
        'Breed Size': 'All',
        'Diet Type': 'Non Veg',
        Gms: 3000,
        Packing: 'Bag',
        Casesize: 4,
        'Shelf Life (Days)': 540,
        GST: '18%',
        HSN: '23091000',
        'Item Code': 'PED-ADL-CV-3',
        ASIN: '',
        'Country of Origin': 'India',
        Vendor: 'Mars Ind',
        'Manufacturer Name': 'Mars International India Pvt. Ltd.',
        'Manufacturer Address': 'Hyderabad, Telangana, India',
        'Package Length (cm)': 40,
        'Package Width (cm)': 10,
        'Package Height (cm)': 55,
        Status: 'Active',
    },
    {
        Brand: 'Pedigree',
        SKU: 'Pedigree Adult Dry Dog Food Chicken & Vegetables',
        'Product Title': 'Pedigree Adult Dry Dog Food Chicken & Vegetables, 10 kg',
        Variant: '10kg',
        MRP: 2650,
        L2: 'Dogs-Food',
        L3: 'Dry Food',
        'Product Images':
            'https://drive.google.com/drive/folders/EXAMPLE-FOLDER-10KG?usp=sharing',
        'UPC/EAN Code': '8906002480028',
        'Product Description':
            'Complete and balanced food for adult dogs with real chicken and vegetables.',
        'Product Features':
            '• Real chicken as a source of protein\n• Supports healthy digestion\n• Omega 6 for a shiny coat',
        Ingredients: 'Cereals, chicken meal, vegetable oil, vegetables, vitamins and minerals',
        'Analytical Constituents': 'Protein 21%, Fat 10%, Fibre 5%, Moisture 12%',
        'Feeding Guidelines': 'Feed 2 to 3 times a day according to body weight. Keep fresh water available.',
        'Life Stage': 'Adult',
        'Breed Size': 'All',
        'Diet Type': 'Non Veg',
        Gms: 10000,
        Packing: 'Bag',
        Casesize: 1,
        'Shelf Life (Days)': 540,
        GST: '18%',
        HSN: '23091000',
        'Item Code': 'PED-ADL-CV-10',
        'Country of Origin': 'India',
        Vendor: 'Mars Ind',
        Status: 'Active',
    },
    {
        Brand: 'Example Brand',
        SKU: 'Example Brand Oatmeal Dog Shampoo',
        'Product Title': 'Example Brand Oatmeal Dog Shampoo, 200 ml',
        Variant: '200ml',
        MRP: 349,
        L2: 'Dogs-Grooming',
        L3: 'Shampoo',
        'Product Images':
            'https://www.dropbox.com/scl/fo/EXAMPLE-SHAMPOO-FOLDER/EXAMPLE?rlkey=EXAMPLE&dl=0',
        'UPC/EAN Code': '8901234567890',
        'Product Description': 'Gentle oatmeal shampoo for dogs with sensitive skin.',
        'Feeding Guidelines': 'Wet the coat, apply, lather for 2 minutes and rinse well.',
        'Life Stage': 'All',
        Packing: 'Bottle',
        GST: '18%',
        HSN: '33051090',
        'Country of Origin': 'India',
        Status: 'Active',
    },
];

/** The allowed L2 and L3 values, from the website's category structure. */
export function templateCategories(): Array<{
    pet: string;
    l2: string;
    l3: string;
    onWebsite: string;
}> {
    const rows: ReturnType<typeof templateCategories> = [];

    for (const { pet, categories } of CLIENT_CATEGORY_TREE) {
        const petLabel = PET_LABELS[pet] ?? pet;

        for (const category of categories) {
            rows.push({
                pet: petLabel,
                l2: `${petLabel}-${category.name}`,
                l3: category.subcategories.join(', ') || '(none)',
                onWebsite: `${pet} › ${category.name}${category.subcategories.length ? ' › L3' : ''}`,
            });
        }
    }

    return rows;
}

/** The template workbook: Products (headers and examples), Instructions, Categories. */
export function buildTemplateWorkbook(
    XLSX: typeof XLSXModule,
): XLSXModule.WorkBook {
    const book = XLSX.utils.book_new();
    const headers = TEMPLATE_COLUMNS.map(column => column.header);

    const products = XLSX.utils.aoa_to_sheet([
        headers,
        ...SAMPLE_ROWS.map(row => headers.map(header => row[header] ?? '')),
    ]);
    products['!cols'] = TEMPLATE_COLUMNS.map(column => ({ wch: column.width }));
    products['!freeze'] = { xSplit: 0, ySplit: 1 };

    // Barcodes as text, so Excel keeps every digit
    const barcodeColumn = headers.indexOf('UPC/EAN Code');

    for (let row = 1; row <= SAMPLE_ROWS.length; row++) {
        const cell = products[XLSX.utils.encode_cell({ r: row, c: barcodeColumn })];

        if (cell) {
            cell.t = 's';
            cell.z = '@';
        }
    }

    const instructions = XLSX.utils.aoa_to_sheet([
        ['PetsUpRight product import: how to fill the Products sheet'],
        [],
        ['• One row per size (variant). Rows with the same Brand and SKU become one product.'],
        ['• Replace the example rows with your own; do not rename or remove the column headers.'],
        ['• Required columns must be filled on every row. Recommended columns should be filled. Optional columns can be empty.'],
        ['• Product Images: a Google Drive or Dropbox folder link containing the images (JPEG/PNG), shared as "Anyone with the link".'],
        ['• Importing a product that already exists (same Brand + SKU, or the same barcode) rewrites it from the sheet, images included.'],
        ['• Upload the file in the dashboard: Catalog › Products › "Import products" button › Choose Excel file › Validate and preview › Import.'],
        [],
        ['Column', 'Required?', 'What to enter'],
        ...TEMPLATE_COLUMNS.map(column => [column.header, column.need, column.help]),
    ]);
    instructions['!cols'] = [{ wch: 24 }, { wch: 13 }, { wch: 120 }];

    const categories = XLSX.utils.aoa_to_sheet([
        ['Pet', 'L2 (copy exactly)', 'L3 (optional subcategory)', 'Shown on the website as'],
        ...templateCategories().map(row => [row.pet, row.l2, row.l3, row.onWebsite]),
    ]);
    categories['!cols'] = [{ wch: 14 }, { wch: 34 }, { wch: 60 }, { wch: 50 }];

    XLSX.utils.book_append_sheet(book, products, 'Products');
    XLSX.utils.book_append_sheet(book, instructions, 'Instructions');
    XLSX.utils.book_append_sheet(book, categories, 'Categories');

    return book;
}
