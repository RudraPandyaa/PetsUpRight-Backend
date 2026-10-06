export const OPN_COLUMN_ALIASES = {
    productName: [
        'Product Name',
        'OPN Product Title',
    ],

    sku: [
        'Item Code',
        'OPN Item Code',
        'SKU',
    ],

    brand: [
        'Brand Name',
        'Brand',
    ],

    barcode: [
        'Barcode',
        'EAN',
        'EAN Code',
    ],

    asin: [
        'ASIN',
    ],

    price: [
        'MRP',
        'Price',
    ],

    weightOrCount: [
        'Weight',
        'Count',
        'Count (Bags)',
        'Count (Wipes)',
    ],

    unit: [
        'Unit',
        'Unit (Dropdown)',
    ],

    weightInGrams: [
        'Kg Conversion in gram',
        'KG Conversion in Gram',
        'Weight in Grams',
    ],

    packing: [
        'Packing',
        'Packaging',
    ],

    countryOfOrigin: [
        'Country of Origin',
        'Country of Orgin',
    ],

    hsnCode: [
        'HSN Code',
        'HSN',
    ],

    gstPercentage: [
        'GST%',
        'GST %',
        'GST Percentage',
    ],

    petType: [
        'Pet Type',
    ],

    lifeStage: [
        'Breed Lifestage',
        'Breed Life Stage',
        'Life Stage',
    ],

    breedSize: [
        'Breed Size',
    ],

    primaryCategory: [
        'Primary Category',
    ],

    secondaryCategory: [
        'Secondary Category',
    ],

    tertiaryCategory: [
        'Tertiary Category',
    ],

    dietType: [
        'Veg / Non Veg / Vegan',
        'Veg/Non Veg/Vegan',
        'Diet Type',
    ],

    packageLengthCm: [
        'Packaging length (cm)',
        'Packaging Length (cm)',
        'Package Length (cm)',
    ],

    packageWidthCm: [
        'Packaging width (cm)',
        'Packaging Width (cm)',
        'Package Width (cm)',
    ],

    packageHeightCm: [
        'Packaging height (cm)',
        'Packaging Height (cm)',
        'Package Height (cm)',
    ],

    supplierName: [
        'Supplier Business Name',
        'Supplier Name',
    ],

    manufacturerName: [
        'Manufacturer Business Name',
        'Supplier / Manufacturer Business Name',
        'Supplier/Manufacturer Business Name',
    ],

    manufacturerAddress: [
        'Manufacturer Address',
    ],

    imageUrl: [
        'Product Picture URL',
        'Product Image URL',
        'Image URL',
    ],

    description: [
        'Product Description',
        'Description',
    ],

    keyPoints: [
        'Key Point',
        'Key Points',
        'Key Point(s)',
    ],

    ingredients: [
        'Ingredients',
    ],

    analyticalConstituents: [
        'Analytical Constituents',
        'Analytical Constitution',
    ],

    usageAndFeeding: [
        'Feeding Guidelines',
        'Usage And Feeding',
        'Usage & Feeding',
    ],

    casePack: [
        'Case Pack',
        'Case Pack Size',
    ],

    shelfLifeYears: [
        'Shelf Life in years',
        'Shelf Life (Years)',
        'Shelf Life',
    ],
} as const;

export type OPNColumnKey = keyof typeof OPN_COLUMN_ALIASES;