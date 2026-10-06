import type { OPNImportRow } from './opn-import.types';

export const OPN_FACETS = {
    brand: {
        code: 'brand',
        name: 'Brand',
    },
    petType: {
        code: 'pet-type',
        name: 'Pet Type',
    },
    lifeStage: {
        code: 'life-stage',
        name: 'Life Stage',
    },
    breedSize: {
        code: 'breed-size',
        name: 'Breed Size',
    },
    dietType: {
        code: 'diet-type',
        name: 'Diet Type',
    },
    packingType: {
        code: 'packing-type',
        name: 'Packing Type',
    },
} as const;

export const PET_TYPE_ALIASES: Record<string, string> = {
    dog: 'Dog',
    dogs: 'Dog',
    cat: 'Cat',
    cats: 'Cat',
    bird: 'Bird',
    birds: 'Bird',
    fish: 'Fish',
    rabbit: 'Rabbit',
    rabbits: 'Rabbit',
    hamster: 'Hamster',
    hemster: 'Hamster',
    'guinea pig': 'Guinea Pig',
    turtle: 'Turtle',
    horse: 'Horse',
};

export const DIET_TYPE_ALIASES: Record<string, string> = {
    veg: 'Veg',
    vegetarian: 'Veg',
    'non veg': 'Non Veg',
    'non-veg': 'Non Veg',
    nonveg: 'Non Veg',
    vegan: 'Vegan',
};

export type CollectionPath = {
    petType: string;
    primary: string;
    secondary: string;
    tertiary: string;
};

export function getCollectionPaths(
    row: OPNImportRow,
): CollectionPath[] {
    return row.petTypes.map(petType => ({
        petType,
        primary: row.primaryCategory,
        secondary: row.secondaryCategory,
        tertiary: row.tertiaryCategory,
    }));
}

export function getCollectionCodes(path: CollectionPath): string[] {
    const slug = (value: string) =>
        value
            .trim()
            .toLowerCase()
            .replace(/&/g, 'and')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');

    const pet = slug(path.petType);
    const primary = slug(path.primary);
    const secondary = slug(path.secondary);
    const tertiary = slug(path.tertiary);

    const codes: string[] = [];

    if (pet) {
        codes.push(pet);
    }

    if (pet && primary) {
        codes.push(`${pet}-${primary}`);
    }

    if (pet && primary && secondary) {
        codes.push(`${pet}-${primary}-${secondary}`);
    }

    if (pet && primary && secondary && tertiary) {
        codes.push(
            `${pet}-${primary}-${secondary}-${tertiary}`,
        );
    }

    return codes;
}   