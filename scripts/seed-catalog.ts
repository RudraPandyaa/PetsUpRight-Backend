import {
    AssetService,
    bootstrapWorker,
    FacetService,
    FacetValueService,
    LanguageCode,
    ProductService,
    ProductVariantService,
    RequestContextService,
    TransactionalConnection,
    User,
} from '@vendure/core';

import fs from 'fs';
import path from 'path';

import { config } from '../src/vendure-config';

type SeedProduct = {
    name: string;
    slug: string;
    sku: string;
    price: number;
    stock: number;
    petType: 'dog' | 'cat';
    category: string;
    brand: string;
    image: string;
    description: string;
};

const products: SeedProduct[] = [

    // =========================
    // DRY FOOD
    // =========================

    {
        name: 'Grain-Free Kibble',
        slug: 'grain-free-kibble',
        sku: 'DOG-FOOD-001',
        price: 800,
        stock: 50,
        petType: 'dog',
        category: 'Dry Food',
        brand: 'Fresh Kisses',
        image: 'dry-food.png',
        description: 'Premium grain-free dry food for adult dogs.',
    },

    {
        name: 'Chicken & Rice Formula',
        slug: 'chicken-rice-formula',
        sku: 'DOG-FOOD-002',
        price: 950,
        stock: 40,
        petType: 'dog',
        category: 'Dry Food',
        brand: 'Fresh Kisses',
        image: 'dry-food.png',
        description: 'Balanced chicken and rice dry food for everyday nutrition.',
    },

    {
        name: 'Salmon & Sweet Potato Food',
        slug: 'salmon-sweet-potato-food',
        sku: 'DOG-FOOD-003',
        price: 1200,
        stock: 35,
        petType: 'dog',
        category: 'Dry Food',
        brand: 'Fresh Kisses',
        image: 'dry-food.png',
        description: 'Salmon and sweet potato dry food with quality ingredients.',
    },

    // =========================
    // FURNITURE
    // =========================

    {
        name: 'Modern Cat Tower',
        slug: 'modern-cat-tower',
        sku: 'FURN-001',
        price: 3499,
        stock: 15,
        petType: 'cat',
        category: 'Furniture',
        brand: 'Pawfect',
        image: 'furniture.png',
        description: 'Multi-level cat tower for climbing, resting and scratching.',
    },

    {
        name: 'Indoor Cat Activity Tree',
        slug: 'indoor-cat-activity-tree',
        sku: 'FURN-002',
        price: 3999,
        stock: 12,
        petType: 'cat',
        category: 'Furniture',
        brand: 'Pawfect',
        image: 'furniture.png',
        description: 'Comfortable indoor activity furniture for cats.',
    },

    {
        name: 'Compact Cat Scratching Tower',
        slug: 'compact-cat-scratching-tower',
        sku: 'FURN-003',
        price: 2999,
        stock: 18,
        petType: 'cat',
        category: 'Furniture',
        brand: 'Pawfect',
        image: 'furniture.png',
        description: 'Compact scratching and resting tower for indoor cats.',
    },

    // =========================
    // COLLARS
    // =========================

    {
        name: 'Classic Red Dog Collar',
        slug: 'classic-red-dog-collar',
        sku: 'COLLAR-001',
        price: 499,
        stock: 60,
        petType: 'dog',
        category: 'Collars',
        brand: 'Pawfect',
        image: 'collars.png',
        description: 'Comfortable adjustable nylon collar for daily use.',
    },

    {
        name: 'Adjustable Comfort Collar',
        slug: 'adjustable-comfort-collar',
        sku: 'COLLAR-002',
        price: 599,
        stock: 45,
        petType: 'dog',
        category: 'Collars',
        brand: 'Pawfect',
        image: 'collars.png',
        description: 'Soft padded adjustable collar with durable buckle.',
    },

    {
        name: 'Reflective Walking Collar',
        slug: 'reflective-walking-collar',
        sku: 'COLLAR-003',
        price: 699,
        stock: 35,
        petType: 'dog',
        category: 'Collars',
        brand: 'Pawfect',
        image: 'collars.png',
        description: 'Reflective collar designed for safer evening walks.',
    },

    // =========================
    // LEASHES
    // =========================

    {
        name: 'Classic Nylon Dog Leash',
        slug: 'classic-nylon-dog-leash',
        sku: 'LEASH-001',
        price: 649,
        stock: 50,
        petType: 'dog',
        category: 'Leashes',
        brand: 'Pawfect',
        image: 'leashes.png',
        description: 'Strong nylon leash with comfortable padded handle.',
    },

    {
        name: 'Padded Walking Leash',
        slug: 'padded-walking-leash',
        sku: 'LEASH-002',
        price: 749,
        stock: 40,
        petType: 'dog',
        category: 'Leashes',
        brand: 'Pawfect',
        image: 'leashes.png',
        description: 'Soft padded walking leash for comfortable daily walks.',
    },

    {
        name: 'Reflective Dog Leash',
        slug: 'reflective-dog-leash',
        sku: 'LEASH-003',
        price: 849,
        stock: 30,
        petType: 'dog',
        category: 'Leashes',
        brand: 'Pawfect',
        image: 'leashes.png',
        description: 'Reflective leash with durable swivel clasp.',
    },

    // =========================
    // BEDS
    // =========================

    {
        name: 'Orthopedic Comfort Pet Bed',
        slug: 'orthopedic-comfort-pet-bed',
        sku: 'BED-001',
        price: 1899,
        stock: 25,
        petType: 'dog',
        category: 'Beds',
        brand: 'Pawfect',
        image: 'beds.png',
        description: 'Soft orthopedic bed designed for comfortable resting.',
    },

    {
        name: 'Plush Donut Pet Bed',
        slug: 'plush-donut-pet-bed',
        sku: 'BED-002',
        price: 1699,
        stock: 30,
        petType: 'dog',
        category: 'Beds',
        brand: 'Pawfect',
        image: 'beds.png',
        description: 'Plush round pet bed with soft cushioned sides.',
    },

    {
        name: 'Cozy Bolster Pet Bed',
        slug: 'cozy-bolster-pet-bed',
        sku: 'BED-003',
        price: 2199,
        stock: 20,
        petType: 'dog',
        category: 'Beds',
        brand: 'Pawfect',
        image: 'beds.png',
        description: 'Comfortable bolster bed with supportive raised edges.',
    },

    // =========================
    // CARRIER
    // =========================

    {
        name: 'Soft-Sided Pet Carrier',
        slug: 'soft-sided-pet-carrier',
        sku: 'CARRIER-001',
        price: 1799,
        stock: 25,
        petType: 'cat',
        category: 'Carrier',
        brand: 'Pawfect',
        image: 'carrier.png',
        description: 'Lightweight soft-sided carrier with mesh ventilation.',
    },

    {
        name: 'Travel Pet Carrier',
        slug: 'travel-pet-carrier',
        sku: 'CARRIER-002',
        price: 1999,
        stock: 20,
        petType: 'dog',
        category: 'Carrier',
        brand: 'Pawfect',
        image: 'carrier.png',
        description: 'Comfortable travel carrier with reinforced straps.',
    },

    {
        name: 'Ventilated Pet Carrier',
        slug: 'ventilated-pet-carrier',
        sku: 'CARRIER-003',
        price: 2299,
        stock: 18,
        petType: 'cat',
        category: 'Carrier',
        brand: 'Pawfect',
        image: 'carrier.png',
        description: 'Ventilated pet carrier suitable for short journeys.',
    },

    // =========================
    // TOYS
    // =========================

    {
        name: 'Rubber Dental Chew Toy',
        slug: 'rubber-dental-chew-toy',
        sku: 'TOY-001',
        price: 399,
        stock: 70,
        petType: 'dog',
        category: 'Toys',
        brand: 'Pawfect',
        image: 'toys.png',
        description: 'Durable textured rubber chew toy for dogs.',
    },

    {
        name: 'Interactive Treat Toy',
        slug: 'interactive-treat-toy',
        sku: 'TOY-002',
        price: 499,
        stock: 60,
        petType: 'dog',
        category: 'Toys',
        brand: 'Pawfect',
        image: 'toys.png',
        description: 'Interactive toy designed to hold treats and encourage play.',
    },

    {
        name: 'Durable Dumbbell Dog Toy',
        slug: 'durable-dumbbell-dog-toy',
        sku: 'TOY-003',
        price: 549,
        stock: 50,
        petType: 'dog',
        category: 'Toys',
        brand: 'Pawfect',
        image: 'toys.png',
        description: 'Durable dumbbell-shaped toy for chewing and play.',
    },

    // =========================
    // GROOMING
    // =========================

    {
        name: 'Complete Pet Grooming Kit',
        slug: 'complete-pet-grooming-kit',
        sku: 'GROOM-001',
        price: 999,
        stock: 35,
        petType: 'dog',
        category: 'Grooming',
        brand: 'Pawfect',
        image: 'grooming.png',
        description: 'Complete grooming kit with brush, comb and nail clipper.',
    },

    {
        name: 'Pet Coat Care Kit',
        slug: 'pet-coat-care-kit',
        sku: 'GROOM-002',
        price: 849,
        stock: 40,
        petType: 'cat',
        category: 'Grooming',
        brand: 'Pawfect',
        image: 'grooming.png',
        description: 'Essential grooming tools for maintaining a healthy coat.',
    },

    {
        name: 'Professional Grooming Set',
        slug: 'professional-grooming-set',
        sku: 'GROOM-003',
        price: 1199,
        stock: 25,
        petType: 'dog',
        category: 'Grooming',
        brand: 'Pawfect',
        image: 'grooming.png',
        description: 'Professional-style grooming accessories for home use.',
    },

    // =========================
    // TREATS
    // =========================

    {
        name: 'Crunchy Bone Dog Treats',
        slug: 'crunchy-bone-dog-treats',
        sku: 'TREAT-001',
        price: 349,
        stock: 80,
        petType: 'dog',
        category: 'Treats',
        brand: 'Fresh Kisses',
        image: 'treats.png',
        description: 'Crunchy bone-shaped treats for everyday rewards.',
    },

    {
        name: 'Chicken Training Treats',
        slug: 'chicken-training-treats',
        sku: 'TREAT-002',
        price: 399,
        stock: 70,
        petType: 'dog',
        category: 'Treats',
        brand: 'Fresh Kisses',
        image: 'treats.png',
        description: 'Small chicken-flavoured treats ideal for training.',
    },

    {
        name: 'Daily Reward Biscuits',
        slug: 'daily-reward-biscuits',
        sku: 'TREAT-003',
        price: 299,
        stock: 90,
        petType: 'dog',
        category: 'Treats',
        brand: 'Fresh Kisses',
        image: 'treats.png',
        description: 'Crunchy biscuits suitable for daily rewards.',
    },
];

async function seedCatalog() {

    const worker = await bootstrapWorker(config);

    const app = worker.app;

    const connection =
        app.get(TransactionalConnection);

    const requestContextService =
        app.get(RequestContextService);

    const productService =
        app.get(ProductService);

    const productVariantService =
        app.get(ProductVariantService);

    const assetService =
        app.get(AssetService);

    const facetService =
        app.get(FacetService);

    const facetValueService =
        app.get(FacetValueService);

    // ---------------------------------------
    // Superadmin context
    // ---------------------------------------

    const superadminIdentifier =
        config.authOptions?.superadminCredentials?.identifier;

    if (!superadminIdentifier) {
        throw new Error(
            'SUPERADMIN_USERNAME is not configured',
        );
    }

    const superAdminUser =
        await connection.rawConnection
            .getRepository(User)
            .findOne({
                where: {
                    identifier:
                        superadminIdentifier,
                },
                relations: {
                    roles: {
                        channels: true,
                    },
                },
            });

    if (!superAdminUser) {
        throw new Error(
            'Superadmin user not found',
        );
    }

    const ctx =
        await requestContextService.create({
            apiType: 'admin',
            user: superAdminUser,
            languageCode: LanguageCode.en,
        });

    // ---------------------------------------
    // Find facets
    // ---------------------------------------

    const facets =
        await facetService.findAll(
            ctx,
            {
                take: 100,
            },
        );

    const categoryFacet =
        facets.items.find(
            facet =>
                facet.code === 'category',
        );

    const brandFacet =
        facets.items.find(
            facet =>
                facet.code === 'brand',
        );

    if (!categoryFacet) {
        throw new Error(
            'Facet "category" not found',
        );
    }

    if (!brandFacet) {
        throw new Error(
            'Facet "brand" not found',
        );
    }

    const categoryValues =
        await facetValueService.findByFacetId(
            ctx,
            categoryFacet.id,
        );

    const brandValues =
        await facetValueService.findByFacetId(
            ctx,
            brandFacet.id,
        );

    // ---------------------------------------
    // Seed products
    // ---------------------------------------

    for (const item of products) {

        console.log(
            `\nProcessing: ${item.name}`,
        );

        // Avoid duplicates
        const existing =
            await productService.findOneBySlug(
                ctx,
                item.slug,
            );

        if (existing) {
            console.log(
                `Skipping existing product: ${item.slug}`,
            );
            continue;
        }

        const categoryFacetValue =
        categoryValues.find(
            value =>
                value.name === item.category,
        );

        if (!categoryFacetValue) {
            throw new Error(
                `Category facet value not found: ${item.category}`,
            );
        }

        const brandFacetValue =
        brandValues.find(
            value =>
                value.name === item.brand,
        );

        if (!brandFacetValue) {

            console.log(
                `Brand "${item.brand}" not found. Skipping product.`,
            );

            continue;
        }

        // -----------------------------------
        // Upload image
        // -----------------------------------

        const imagePath =
            path.join(
                process.cwd(),
                'seed-data',
                'images',
                item.image,
            );

        if (!fs.existsSync(imagePath)) {
            throw new Error(
                `Image not found: ${imagePath}`,
            );
        }

        const stream =
            fs.createReadStream(imagePath);

        const assetResult =
            await assetService.createFromFileStream(
                stream,
                imagePath,
                ctx,
            );

        if (
            'errorCode' in assetResult
        ) {
            throw new Error(
                `Asset upload failed for ${item.image}: ${assetResult.message}`,
            );
        }

        // -----------------------------------
        // Product
        // -----------------------------------

        const product =
            await productService.create(
                ctx,
                {
                    enabled: true,

                    translations: [
                        {
                            languageCode:
                                LanguageCode.en,

                            name:
                                item.name,

                            slug:
                                item.slug,

                            description:
                                item.description,
                        },
                    ],

                    facetValueIds: [
                        categoryFacetValue.id,
                        brandFacetValue.id,
                    ],

                    featuredAssetId:
                        assetResult.id,

                    assetIds: [
                        assetResult.id,
                    ],

                    customFields: {
                        petType:
                            item.petType,
                    },
                },
            );

        // -----------------------------------
        // Variant
        // -----------------------------------

        await productVariantService.create(
            ctx,
            [
                {
                    productId:
                        product.id,

                    enabled: true,

                    translations: [
                        {
                            languageCode:
                                LanguageCode.en,

                            name:
                                item.name,
                        },
                    ],

                    sku:
                        item.sku,

                    // Vendure stores money
                    // in minor units.
                    price:
                        item.price * 100,

                    stockOnHand:
                        item.stock,

                    trackInventory:
                        'TRUE',

                    featuredAssetId:
                        assetResult.id,

                    assetIds: [
                        assetResult.id,
                    ],
                },
            ],
        );

        console.log(
            `Created: ${item.name}`,
        );
    }

    console.log(
        '\nCatalog seeding complete ✅',
    );

    await worker.app.close();
}

seedCatalog()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(
            '\nCatalog seed failed ❌',
        );
        console.error(error);
        process.exit(1);
    });