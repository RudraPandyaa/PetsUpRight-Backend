import type { OPNImportRow } from './opn-import.types';

/**
 * The client's product category structure (PetsUpright "Product Category
 * Structure — Website Sitemap"): pet → category → subcategory. Every
 * collection on the storefront is created from this tree, and products are
 * placed in it by mapRowToCategoryPaths().
 */
export const SMALL_ANIMALS = 'Hamster / Guinea Pig / Turtle / Rabbit';

type CategoryDefinition = {
    name: string;
    subcategories: string[];
};

type PetDefinition = {
    pet: string;
    categories: CategoryDefinition[];
};

const DOG_AND_CAT_COMMON: CategoryDefinition[] = [
    { name: 'Food', subcategories: ['Dry Food', 'Wet Food', 'Treats'] },
    {
        name: 'Grooming',
        subcategories: ['Grooming Products', 'Shampoo', 'Conditioner', 'Dry Bath'],
    },
    { name: 'Health & Wellness', subcategories: ['Health Supplement'] },
    { name: 'Toys', subcategories: ['Soft Toys', 'Hard Toys'] },
    { name: 'Clothing & Accessories', subcategories: ['Clothing'] },
    { name: 'Walking Essentials', subcategories: ['Leash', 'Collar', 'Harness'] },
];

export const CLIENT_CATEGORY_TREE: PetDefinition[] = [
    {
        pet: 'Dog',
        categories: [
            ...DOG_AND_CAT_COMMON,
            { name: 'Housing', subcategories: ['Cage', 'Play Den', 'House', 'Beds'] },
            { name: 'Feeding Essentials', subcategories: ['Bowls', 'Bowl Stand'] },
            {
                name: 'Clean & Hygiene',
                subcategories: ['Pads', 'Diapers', 'Training Pads'],
            },
        ],
    },
    {
        pet: 'Cat',
        categories: [
            ...DOG_AND_CAT_COMMON,
            { name: 'Housing', subcategories: ['Cage', 'House', 'Beds'] },
            { name: 'Feeding Essentials', subcategories: ['Bowl', 'Bowl Stand'] },
            {
                name: 'Clean & Hygiene',
                subcategories: [
                    'Pads',
                    'Diapers',
                    'Training Pads',
                    'Cat Litter',
                    'Litter Tray',
                ],
            },
        ],
    },
    {
        pet: 'Bird',
        categories: [
            { name: 'Food', subcategories: ['Dry Food'] },
            { name: 'Health & Wellness', subcategories: ['Health Supplement'] },
            { name: 'Toys', subcategories: [] },
            { name: 'Walking Essentials', subcategories: ['Leash'] },
            { name: 'Feeding Essentials', subcategories: ['Bowl', 'Bowl Stand'] },
        ],
    },
    {
        pet: SMALL_ANIMALS,
        categories: [
            { name: 'Food', subcategories: ['Dry Food'] },
            { name: 'Health & Wellness', subcategories: ['Health Supplement'] },
            { name: 'Walking Essentials', subcategories: ['Leash'] },
            { name: 'Feeding Essentials', subcategories: ['Bowls'] },
        ],
    },
    {
        pet: 'Fish',
        categories: [{ name: 'Food', subcategories: [] }],
    },
    {
        pet: 'Horse',
        categories: [{ name: 'Grooming', subcategories: ['Shampoo', 'Serum'] }],
    },
];

/** One place in the tree: a pet, optionally a category and a subcategory. */
export type CategoryPath = {
    pet: string;
    category?: string;
    subcategory?: string;
};

/** A collection on the path, from the pet down. */
export type CategoryLevel = {
    // Collection slug and code of the facet value it filters on
    code: string;
    name: string;
    // e.g. "Dog / Food / Dry Food"
    breadcrumb: string;
};

const slug = (value: string): string =>
    value
        .trim()
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

// "Bowl" and "Bowls" are the same subcategory for matching purposes
const matchKey = (value: string): string =>
    slug(value).replace(/s$/, '');

export function categoryPathLevels(path: CategoryPath): CategoryLevel[] {
    const names = [path.pet, path.category, path.subcategory].filter(
        (name): name is string => Boolean(name),
    );

    return names.map((name, index) => ({
        code: names
            .slice(0, index + 1)
            .map(slug)
            .join('-'),
        name,
        breadcrumb: names.slice(0, index + 1).join(' / '),
    }));
}

/** Every pet, category and subcategory of the client tree. */
export function allCategoryPaths(): CategoryPath[] {
    const paths: CategoryPath[] = [];

    for (const { pet, categories } of CLIENT_CATEGORY_TREE) {
        paths.push({ pet });

        for (const category of categories) {
            paths.push({ pet, category: category.name });

            for (const subcategory of category.subcategories) {
                paths.push({
                    pet,
                    category: category.name,
                    subcategory,
                });
            }
        }
    }

    return paths;
}

/** Codes of every collection in the client tree. */
export function allCategoryCodes(): Set<string> {
    return new Set(
        allCategoryPaths().flatMap(path =>
            categoryPathLevels(path).map(level => level.code),
        ),
    );
}

const PET_ALIASES: Array<[RegExp, string[]]> = [
    [/^(dog|dogs|puppy|puppies)$/, ['Dog']],
    [/^(cat|cats|kitten|kittens)$/, ['Cat']],
    [/^(bird|birds|avian|parrot|parrots|pigeon|pigeons)$/, ['Bird']],
    [/^(fish|fishes)$/, ['Fish']],
    [/^(horse|horses)$/, ['Horse']],
    [
        /^(small animals?|hamsters?|hemsters?|guinea pigs?|rabbits?|turtles?|tortoises?|rodents?)$/,
        [SMALL_ANIMALS],
    ],
    // "All" pets: the categories that exist for both dogs and cats
    [/^(all|all pets)$/, ['Dog', 'Cat']],
];

/**
 * The client's pet sections for a row, from the sheet's pet type (e.g.
 * "Small Animal" and "Tortoise" become "Hamster / Guinea Pig / Turtle /
 * Rabbit"). Rows without a pet type from the Tetra (aquatics) sheet go to
 * Fish.
 */
export function mapPets(row: OPNImportRow): string[] {
    const pets: string[] = [];

    for (const petType of row.petTypes) {
        const key = petType.trim().toLowerCase();
        const match = PET_ALIASES.find(([pattern]) => pattern.test(key));

        for (const pet of match?.[1] ?? []) {
            if (!pets.includes(pet)) {
                pets.push(pet);
            }
        }
    }

    if (
        !pets.length &&
        /tetra|aqua/i.test(`${row.sheetName} ${row.brand}`)
    ) {
        pets.push('Fish');
    }

    return pets;
}

type Candidate = {
    category: string;
    subcategory?: string;
};

/**
 * Where a row belongs, regardless of pet, most specific first. Based on the
 * sheet's Primary / Secondary / Tertiary Category, and on the product name
 * when those are missing or too general.
 */
function categoryCandidates(row: OPNImportRow): Candidate[] {
    const name = row.productName.toLowerCase();
    const primary = row.primaryCategory.trim().toLowerCase();
    const secondary = row.secondaryCategory.trim().toLowerCase();
    const tertiary = row.tertiaryCategory.trim().toLowerCase();
    const text = `${name} ${tertiary}`;

    // Pouches, broth and gravy are wet food when the sheet gives no form
    const isWet =
        secondary === 'wet' ||
        (!secondary && /pouch|in broth|in jelly|gravy|\bcans?\b|\bwet\b/.test(name));

    const foodByForm = (): Candidate =>
        isWet
            ? { category: 'Food', subcategory: 'Wet Food' }
            : secondary === 'dry'
              ? { category: 'Food', subcategory: 'Dry Food' }
              : { category: 'Food' };

    // Clean & Hygiene
    if (/litter tray|litter box/.test(text)) {
        return [{ category: 'Clean & Hygiene', subcategory: 'Litter Tray' }];
    }

    if (tertiary === 'litter' || /\blitter\b/.test(name)) {
        return [{ category: 'Clean & Hygiene', subcategory: 'Cat Litter' }];
    }

    if (/training pad/.test(text)) {
        return [{ category: 'Clean & Hygiene', subcategory: 'Training Pads' }];
    }

    if (/diaper/.test(text)) {
        return [{ category: 'Clean & Hygiene', subcategory: 'Diapers' }];
    }

    if (/\b(pee|puppy|absorbent) pads?\b|\bpads?\b.*\b(pee|urine)/.test(text)) {
        return [{ category: 'Clean & Hygiene', subcategory: 'Pads' }];
    }

    // Grooming
    if (/\bwipes?\b/.test(text)) {
        return [{ category: 'Grooming', subcategory: 'Grooming Products' }];
    }

    if (
        primary === 'cleaning & hygiene' ||
        ['floor cleaner', 'stain remover', 'freshener'].includes(tertiary) ||
        /poop|waste bag|floor cleaner|stain remover|magnetic cleaner|aquarium cleaner/.test(name)
    ) {
        return [{ category: 'Clean & Hygiene' }];
    }

    if (tertiary === 'dry bath' || /dry bath/.test(name)) {
        return [{ category: 'Grooming', subcategory: 'Dry Bath' }];
    }

    if (
        primary === 'grooming' ||
        /shampoo|conditioner|serum|grooming|perfume|soap bar|paw butter|ear clean/.test(name)
    ) {
        const grooming: Candidate[] = [];

        if (/shampoo/.test(text)) {
            grooming.push({ category: 'Grooming', subcategory: 'Shampoo' });
        }

        if (/conditioner/.test(text)) {
            grooming.push({ category: 'Grooming', subcategory: 'Conditioner' });
        }

        if (/serum/.test(text)) {
            grooming.push({ category: 'Grooming', subcategory: 'Serum' });
        }

        return grooming.length
            ? grooming
            : [{ category: 'Grooming', subcategory: 'Grooming Products' }];
    }

    // Health & Wellness
    if (
        primary === 'supplements' ||
        (!primary &&
            /supplement|vitamin|omega|joint|dental|probiotic/.test(name))
    ) {
        return [
            { category: 'Health & Wellness', subcategory: 'Health Supplement' },
        ];
    }

    // Food
    if (primary === 'treats' || /\btreats?\b/.test(name)) {
        return [{ category: 'Food', subcategory: 'Treats' }, foodByForm()];
    }

    if (
        primary === 'food' ||
        // Hay (e.g. Timothy Hay) is food for rabbits and guinea pigs
        (!primary && (/\bfood\b|kibble|\bhay\b/.test(name) || Boolean(secondary)))
    ) {
        return [foodByForm()];
    }

    // Accessories, by name (none in the current sheet)
    if (/\btoys?\b/.test(name)) {
        return [
            {
                category: 'Toys',
                subcategory: /plush|soft/.test(name) ? 'Soft Toys' : 'Hard Toys',
            },
        ];
    }

    if (/\bleash|\blead\b/.test(name)) {
        return [{ category: 'Walking Essentials', subcategory: 'Leash' }];
    }

    if (/\bcollar/.test(name)) {
        return [{ category: 'Walking Essentials', subcategory: 'Collar' }];
    }

    if (/harness/.test(name)) {
        return [{ category: 'Walking Essentials', subcategory: 'Harness' }];
    }

    if (/bowl stand|feeder stand/.test(name)) {
        return [{ category: 'Feeding Essentials', subcategory: 'Bowl Stand' }];
    }

    if (/\bbowls?\b|feeder/.test(name)) {
        return [{ category: 'Feeding Essentials', subcategory: 'Bowl' }];
    }

    if (/\bcage\b/.test(name)) {
        return [{ category: 'Housing', subcategory: 'Cage' }];
    }

    if (/play ?den|playpen/.test(name)) {
        return [{ category: 'Housing', subcategory: 'Play Den' }];
    }

    if (/\bbeds?\b/.test(name)) {
        return [{ category: 'Housing', subcategory: 'Beds' }];
    }

    if (/\bhouse\b|kennel/.test(name)) {
        return [{ category: 'Housing', subcategory: 'House' }];
    }

    if (/t-shirt|jacket|sweater|hoodie|raincoat|clothing/.test(name)) {
        return [{ category: 'Clothing & Accessories', subcategory: 'Clothing' }];
    }

    return [];
}

/**
 * Fits the candidates to what the pet's section offers: the subcategory if
 * the pet has it, otherwise the category alone, otherwise just the pet.
 */
function fitToPet(pet: string, candidates: Candidate[]): CategoryPath[] {
    const definition = CLIENT_CATEGORY_TREE.find(entry => entry.pet === pet);

    if (!definition) {
        return [];
    }

    const findCategory = (name: string) =>
        definition.categories.find(category => category.name === name);

    const exact: CategoryPath[] = [];

    for (const candidate of candidates) {
        const category = findCategory(candidate.category);
        const subcategory = candidate.subcategory
            ? category?.subcategories.find(
                  sub => matchKey(sub) === matchKey(candidate.subcategory as string),
              )
            : undefined;

        if (category && subcategory) {
            exact.push({ pet, category: category.name, subcategory });
        }
    }

    // Shampoo & Conditioner goes into both; otherwise the first match wins
    if (exact.length) {
        return candidates[0].category === 'Grooming' ? exact : [exact[0]];
    }

    for (const candidate of candidates) {
        const category = findCategory(candidate.category);

        if (category) {
            return [{ pet, category: category.name }];
        }
    }

    return [{ pet }];
}

/** Every place in the client tree where the row's product belongs. */
export function mapRowToCategoryPaths(row: OPNImportRow): CategoryPath[] {
    const candidates = categoryCandidates(row);

    return mapPets(row).flatMap(pet => fitToPet(pet, candidates));
}
