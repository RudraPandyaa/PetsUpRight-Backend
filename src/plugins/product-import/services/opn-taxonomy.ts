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
    collectionPath: {
        code: 'collection-path',
        name: 'Collection Path',
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
