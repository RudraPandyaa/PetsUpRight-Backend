import {
    OPN_COLUMN_ALIASES,
    type OPNColumnKey,
} from './opn-column-map';
import type {
    OPNImportRow,
    OPNSourceCell,
} from './opn-import.types';
import {
    createProductIdentity,
    createVariantOption,
    normalizeDietTypes,
    normalizeList,
    normalizePetTypes,
    normalizeText,
    optionalNumber,
    createVariantSku,
} from './opn-normalization';

type RawRow = Record<string, unknown>;

function normalizeHeader(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}

type HeaderCell = {
    // Header exactly as written in the workbook
    header: string;
    value: unknown;
};

function createHeaderMap(
    row: RawRow,
): Map<string, HeaderCell> {
    const map = new Map<string, HeaderCell>();

    for (const [key, value] of Object.entries(row)) {
        map.set(normalizeHeader(key), {
            header: key,
            value,
        });
    }

    return map;
}

function findCell(
    headerMap: Map<string, HeaderCell>,
    key: OPNColumnKey,
): HeaderCell | undefined {
    for (const alias of OPN_COLUMN_ALIASES[key]) {
        const normalizedAlias =
            normalizeHeader(alias);

        const exactCell =
            headerMap.get(normalizedAlias);

        if (normalizeText(exactCell?.value)) {
            return exactCell;
        }

        for (const [header, cell] of headerMap) {
            const isDuplicateHeader =
                header === normalizedAlias ||
                (
                    header.startsWith(normalizedAlias) &&
                    /^\d+$/.test(
                        header.slice(
                            normalizedAlias.length,
                        ),
                    )
                );

            if (
                isDuplicateHeader &&
                normalizeText(cell.value)
            ) {
                return cell;
            }
        }
    }

    return undefined;
}

function getValue(
    headerMap: Map<string, HeaderCell>,
    key: OPNColumnKey,
): unknown {
    return findCell(headerMap, key)?.value ?? '';
}

// Product name columns other than "Product Description"
const DEDICATED_NAME_HEADERS = OPN_COLUMN_ALIASES.productName
    .map(normalizeHeader)
    .filter(header => header !== normalizeHeader('Product Description'));

/**
 * "Product Description" is only used as the product name in sheets that
 * have no dedicated name column. Otherwise an empty name cell would turn
 * the description into the name of a new product.
 */
function getProductNameCell(
    headerMap: Map<string, HeaderCell>,
): HeaderCell | undefined {
    const dedicated = [...headerMap.entries()].filter(
        ([header]) => DEDICATED_NAME_HEADERS.includes(header),
    );

    if (!dedicated.length) {
        return findCell(headerMap, 'productName');
    }

    return (
        dedicated.find(([, cell]) =>
            normalizeText(cell.value),
        ) ?? dedicated[0]
    )[1];
}

function createSource(
    headerMap: Map<string, HeaderCell>,
): Partial<Record<OPNColumnKey, OPNSourceCell>> {
    const source: Partial<
        Record<OPNColumnKey, OPNSourceCell>
    > = {};

    for (const key of Object.keys(
        OPN_COLUMN_ALIASES,
    ) as OPNColumnKey[]) {
        const cell =
            key === 'productName'
                ? getProductNameCell(headerMap)
                : findCell(headerMap, key);

        if (cell) {
            source[key] = {
                column: cell.header,
                value: normalizeText(cell.value),
            };
        }
    }

    return source;
}

function integerOrNull(
    value: unknown,
): number | null {
    const parsed = optionalNumber(value);

    if (parsed === null) {
        return null;
    }

    return Math.round(parsed);
}

function getSheetName(row: RawRow): string {
    return normalizeText(row.__sheetName);
}

function getRowNumber(
    row: RawRow,
    index: number,
): number {
    const value = Number(row.__rowNumber);

    return Number.isSafeInteger(value) && value > 0
        ? value
        : index + 2;
}

function inferPetTypes(
    explicitPetType: unknown,
    productName: string,
    description: string,
    genericName: string,
): string[] {
    const explicit = normalizePetTypes(explicitPetType);

    if (explicit.length) {
        return explicit;
    }

    const inferFromText = (value: string): string[] => {
        const text = value.toLowerCase();
        const types: string[] = [];

        const add = (type: string) => {
            if (!types.includes(type)) {
                types.push(type);
            }
        };

        if (/\b(dog|dogs|puppy|puppies|canine)\b/.test(text)) {
            add('Dog');
        }

        if (/\b(cat|cats|kitten|kittens|feline)\b/.test(text)) {
            add('Cat');
        }

        if (
            /\b(bird|birds|avian|parrot|parrots|pigeon|pigeons|budgie|budgies|cockatiel|cockatiels|canary|canaries)\b/.test(
                text,
            )
        ) {
            add('Bird');
        }

        if (/\b(hamster|hamsters)\b/.test(text)) {
            // Keep the existing spelling used in Vendure configuration.
            add('Hemster');
        }

        if (/\b(guinea pig|guinea pigs)\b/.test(text)) {
            add('Guinea Pig');
        }

        if (/\b(rabbit|rabbits|bunny|bunnies)\b/.test(text)) {
            add('Rabbit');
        }

        if (/\b(fish|aquarium|aquatic)\b/.test(text)) {
            add('Fish');
        }

        if (/\b(turtle|turtles|tortoise|tortoises)\b/.test(text)) {
            add('Turtle');
        }

        if (/\b(horse|horses|equine)\b/.test(text)) {
            add('Horse');
        }

        return types;
    };

    // Product-specific text is more trustworthy than Generic Name.
    const productTypes = inferFromText(
        `${productName} ${description}`,
    );

    if (productTypes.length) {
        return productTypes;
    }

    return inferFromText(genericName);
}

function isRepeatedHeaderRow(
    row: OPNImportRow,
): boolean {
    const productName =
        row.productName.trim().toLowerCase();
    const itemCode =
        row.itemCode.trim().toLowerCase();
    const barcode =
        row.barcode.trim().toLowerCase();
    const optionValue =
        row.optionValue.trim().toLowerCase();

    let matches = 0;

    if (
        productName === 'product name' ||
        productName === 'opn product name' ||
        productName === 'opn product title' ||
        productName === 'product description'
    ) {
        matches++;
    }

    if (
        itemCode === 'item code' ||
        itemCode === 'opn item code' ||
        itemCode === 'sku' ||
        itemCode === 'product code' ||
        itemCode === 'new opn code' ||
        itemCode === 'product code 3'
    ){
        matches++;
    }

    if (
        barcode === 'barcode' ||
        barcode === 'ean' ||
        barcode === 'ean code'
    ) {
        matches++;
    }

    if (
        optionValue === 'unit' ||
        optionValue === 'unit (drop down)' ||
        optionValue === 'unit (dropdown)'
    ) {
        matches++;
    }

    return matches >= 2;
}

function createRowSignature(
    row: OPNImportRow,
): string {
    const {
        sheetName: _sheetName,
        rowNumber: _rowNumber,
        source: _source,
        ...content
    } = row;

    return JSON.stringify(content);
}

export function parseOPNRows(
    data: unknown,
): OPNImportRow[] {
    if (!Array.isArray(data) || data.length === 0) {
        throw new Error(
            'The workbook contains no product rows',
        );
    }

    if (data.length > 10_000) {
        throw new Error(
            'The workbook contains more than 10,000 rows',
        );
    }

    const rows = data.map((value, index) => {
        const rawRow = value as RawRow;
        const headers = createHeaderMap(rawRow);

        const sheetName = getSheetName(rawRow);
        const rowNumber = getRowNumber(rawRow, index);

        const originalProductName = normalizeText(
            getProductNameCell(headers)?.value,
        );

        const brand =
            normalizeText(getValue(headers, 'brand')) ||
            sheetName;

        const identity = createProductIdentity(
            brand,
            originalProductName,
        );

        const weightOrCount = optionalNumber(
            getValue(headers, 'weightOrCount'),
        );

        const unit = normalizeText(
            getValue(headers, 'unit'),
        );

        const option = createVariantOption(
            weightOrCount,
            unit,
        );

        const itemCode = normalizeText(
            getValue(headers, 'sku'),
        );

        const generatedSku = createVariantSku(
            identity.productGroupKey,
            itemCode,
            option.group,
            option.value,
            rowNumber,
        );

        const duplicateDescription = headers.get(
            `${normalizeHeader('Product Description')}1`,
        )?.value;

        const description =
            normalizeText(duplicateDescription) ||
            normalizeText(
                getValue(headers, 'description'),
            );

        const genericName = normalizeText(
            getValue(headers, 'genericName'),
        );

        const ingredients = normalizeText(
            getValue(headers, 'ingredients'),
        );

        const primaryCategory = normalizeText(
            getValue(headers, 'primaryCategory'),
        );

        const secondaryCategory = normalizeText(
            getValue(headers, 'secondaryCategory'),
        );

        const tertiaryCategory = normalizeText(
            getValue(headers, 'tertiaryCategory'),
        );

        const categoryText = [
            primaryCategory,
            secondaryCategory,
            tertiaryCategory,
        ]
            .join(' ')
            .toLowerCase();

        const supplierName = normalizeText(
            getValue(headers, 'supplierName'),
        );

        const manufacturerName =
            normalizeText(
                getValue(headers, 'manufacturerName'),
            ) || supplierName;

        const variantName = [
            identity.productName,
            option.value,
        ]
            .filter(Boolean)
            .join(' ');

        return {
            sheetName,
            rowNumber,
            source: createSource(headers),

            productGroupKey:
                identity.productGroupKey,
            productName: identity.productName,
            productSlug: identity.productSlug,
            description,

            brand,
            petTypes: inferPetTypes(
                getValue(headers, 'petType'),
                originalProductName,
                description,
                genericName,
            ),
            lifeStages: normalizeList(
                getValue(headers, 'lifeStage'),
            ),
            breedSizes: normalizeList(
                getValue(headers, 'breedSize'),
            ),
            dietTypes: normalizeDietTypes(
                getValue(headers, 'dietType'),
            ),

            primaryCategory,
            secondaryCategory,
            tertiaryCategory,

            isFood:
                categoryText.includes('food') ||
                Boolean(ingredients),

            keyPoints: normalizeText(
                getValue(headers, 'keyPoints'),
            ),
            ingredients,
            analyticalConstituents: normalizeText(
                getValue(
                    headers,
                    'analyticalConstituents',
                ),
            ),
            usageAndFeeding: normalizeText(
                getValue(headers, 'usageAndFeeding'),
            ),

            countryOfOrigin: normalizeText(
                getValue(headers, 'countryOfOrigin'),
            ),
            manufacturerName,
            manufacturerAddress: normalizeText(
                getValue(
                    headers,
                    'manufacturerAddress',
                ),
            ),
            supplierName,

            itemCode,
            sku: generatedSku,

            barcode: normalizeText(
                getValue(headers, 'barcode'),
            ),
            asin: normalizeText(
                getValue(headers, 'asin'),
            ),
            variantName,

            optionGroup: option.group,
            optionValue: option.value,

            price:
                optionalNumber(
                    getValue(headers, 'price'),
                ) ?? 0,

            // Workbook currently has no stock column.
            stock: 0,

            weightOrCount,
            unit,
            weightInGrams: integerOrNull(
                getValue(headers, 'weightInGrams'),
            ),
            packing: normalizeText(
                getValue(headers, 'packing'),
            ),

            hsnCode: normalizeText(
                getValue(headers, 'hsnCode'),
            ),
            gstPercentage: optionalNumber(
                getValue(headers, 'gstPercentage'),
            ),
            casePack: integerOrNull(
                getValue(headers, 'casePack'),
            ),
            shelfLifeYears: optionalNumber(
                getValue(headers, 'shelfLifeYears'),
            ),

            packageLengthCm: optionalNumber(
                getValue(headers, 'packageLengthCm'),
            ),
            packageWidthCm: optionalNumber(
                getValue(headers, 'packageWidthCm'),
            ),
            packageHeightCm: optionalNumber(
                getValue(headers, 'packageHeightCm'),
            ),

            imageUrl: normalizeText(
                getValue(headers, 'imageUrl'),
            ),
        };
    });
    const meaningfulRows = rows.filter(row => {
        const hasProductIdentity =
            Boolean(row.productName) ||
            Boolean(row.itemCode);

        const hasPrice =
            Number.isFinite(row.price) &&
            row.price > 0;

        return (
            (hasProductIdentity || hasPrice) &&
            !isRepeatedHeaderRow(row)
        );
    });

    const signatures = new Set<string>();

    return meaningfulRows.filter(row => {
        const signature = createRowSignature(row);

        if (signatures.has(signature)) {
            return false;
        }

        signatures.add(signature);
        return true;
    });
}