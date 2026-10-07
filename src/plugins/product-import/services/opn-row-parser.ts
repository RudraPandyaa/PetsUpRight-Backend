import {
    OPN_COLUMN_ALIASES,
    type OPNColumnKey,
} from './opn-column-map';
import type { OPNImportRow } from './opn-import.types';
import {
    createProductIdentity,
    createVariantOption,
    normalizeDietTypes,
    normalizeList,
    normalizePetTypes,
    normalizeText,
    optionalNumber,
} from './opn-normalization';

type RawRow = Record<string, unknown>;

function normalizeHeader(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}

function createHeaderMap(
    row: RawRow,
): Map<string, unknown> {
    const map = new Map<string, unknown>();

    for (const [key, value] of Object.entries(row)) {
        map.set(normalizeHeader(key), value);
    }

    return map;
}

function getValue(
    headerMap: Map<string, unknown>,
    key: OPNColumnKey,
): unknown {
    for (const alias of OPN_COLUMN_ALIASES[key]) {
        const normalizedAlias =
            normalizeHeader(alias);

        const exactValue =
            headerMap.get(normalizedAlias);

        if (normalizeText(exactValue)) {
            return exactValue;
        }

        for (const [header, value] of headerMap) {
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
                normalizeText(value)
            ) {
                return value;
            }
        }
    }

    return '';
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

    return data.map((value, index) => {
        const rawRow = value as RawRow;
        const headers = createHeaderMap(rawRow);

        const sheetName = getSheetName(rawRow);
        const rowNumber = getRowNumber(rawRow, index);

        const originalProductName = normalizeText(
            getValue(headers, 'productName'),
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

        const duplicateDescription = headers.get(
            `${normalizeHeader('Product Description')}1`,
        );

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

            sku: normalizeText(
                getValue(headers, 'sku'),
            ),
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
}