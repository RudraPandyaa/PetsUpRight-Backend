export const OPN_COLUMN_ALIASES = {
    productName: [
        'Product Name',
        'OPN Product Name',
        'OPN Product Title',
        'Product Description',
    ],

    genericName: [
        'Generic Name',
        'Product Type',
    ],

    sku: [
        'Item Code',
        'OPN Item Code',
        'SKU',
        'Product Code',
        'Product Code 3',
        'New OPN Code',
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

    // All of these are the MRP. When a sheet has several, the first one in
    // this list with a value wins, so newer prices come first. Any other
    // column whose name contains "MRP" is also used (see opn-row-parser.ts).
    price: [
        'NEW Reduce mrp',
        'Reduce MRP',
        'New MRP effective from Nov 2024',
        'New MRP',
        'MRP',
        'Price',
    ],

    weightOrCount: [
        'Weight',
        'Count',
        'Count (Bags)',
        'Count (Wipes)',
        'Count (Bags/Wipes)',
        'Pack size in Kgs',
    ],

    unit: [
        'Unit',
        'Unit (Dropdown)',
        'Unit (Drop down)',
    ],

    weightInGrams: [
        'Kg Conversion in gram',
        'Kg  Conversion in gram',
        'KG Conversion in Gram',
        'Weight in Grams',
    ],

    packing: [
        'Packing',
        'Packing (Drop down)',
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
        'Pet Type (Drop down)',
    ],

    lifeStage: [
        'Breed Lifestage',
        'Breed Lifestage (Drop down)',
        'Breed Life Stage',
        'Life Stage',
    ],

    breedSize: [
        'Breed Size',
        'Breed Size (Drop down)',
    ],

    primaryCategory: [
        'Primary Category',
        'Primary Category (Drop down)',
    ],

    secondaryCategory: [
        'Secondary Category',
        'Secondary Category (Drop down)',
        'Dry/Wet',
    ],

    tertiaryCategory: [
        'Tertiary Category',
        'Tertiary Category (Drop down)',
    ],

    dietType: [
        'Veg / Non Veg / Vegan',
        'Veg / Non Veg / Vegan (Drop down)',
        'Veg/Non Veg/Vegan',
        'Veg/ Non-Veg',
        'Diet Type',
    ],

    packageLengthCm: [
        'Packaging length (cm)',
        'Packaging Length (cm)',
        'Package Length (cm)',
        'Packaging Length (in cms)',
        'Length (in cms)',
        'length',
        'Length',
    ],

    packageWidthCm: [
        'Packaging width (cm)',
        'Packaging Width (cm)',
        'Package Width (cm)',
        'Packaging Width (in cms)',
        'Width (in cms)',
        'Width',
    ],

    packageHeightCm: [
        'Packaging height (cm)',
        'Packaging Height (cm)',
        'Package Height (cm)',
        'Packaging Height (in cms)',
        'Height (in cms)',
        'Height',
    ],

    supplierName: [
        'Supplier Business Name',
        'Supplier Name',
        'Supplier / Manufacturer Business  Name',
    ],

    manufacturerName: [
        'Manufacturer Business Name',
        'Supplier / Manufacturer Business Name',
        'Supplier / Manufacturer Business  Name',
        'Supplier/Manufacturer Business Name',
    ],

    manufacturerAddress: [
        'Manufacturer Address',
    ],

    imageUrl: [
        'Product Picture URL',
        'Product Picture(URL)',
        'Product Picture 1 (URL)',
        'Product Image URL',
        'Image URL',
        'Image',
        'Images',
    ],

    description: [
        'Product Description',
        'Description',
    ],

    keyPoints: [
        'Key Point',
        'Key Points',
        'Key Point(s)',
        'Bullet Point',
        'Item Highlight',
    ],

    ingredients: [
        'Ingredients',
    ],

    analyticalConstituents: [
        'Analytical Constituents',
        'Analytical Constitution',
        'Analytical',
    ],

    usageAndFeeding: [
        'Feeding Guidelines',
        'Usage And Feeding',
        'Usage & Feeding',
        'Application Guidelines (How to Use)',
    ],

    casePack: [
        'Case Pack',
        'Case Pack Size',
    ],

    shelfLifeYears: [
        'Shelf Life in years',
        'Shelf Life (Years)',
        'Shelf Life',
        'Shelf Life in Months',
    ],
} as const;

export type OPNColumnKey = keyof typeof OPN_COLUMN_ALIASES;