import { PluginCommonModule, Type, VendurePlugin } from '@vendure/core';
import { ProductImportResolver } from './api/product-import.resolver';
import { productImportSchema } from './api/product-import.schema';
import {
    PRODUCT_IMPORT_OPTIONS,
    ProductImportOptions,
    resolveImportOptions,
} from './constants';
import { ImportValidationService } from './services/import-validation.service';
import { ProductImportService } from './services/product-import.service';
import { SpreadsheetParserService } from './services/spreadsheet-parser.service';
import { OpnTaxonomyService } from './services/opn-taxonomy.service';
import { OpnAssetService } from './services/opn-asset.service';
@VendurePlugin({
    imports: [PluginCommonModule],
    providers: [
        {
            provide: PRODUCT_IMPORT_OPTIONS,
            useFactory: () => resolveImportOptions(ProductImportPlugin.options),
        },
        SpreadsheetParserService,
        ImportValidationService,
        ProductImportService,
        OpnTaxonomyService,
        OpnAssetService,
    ],
    adminApiExtensions: { schema: productImportSchema, resolvers: [ProductImportResolver] },
    dashboard: './dashboard/index.tsx',
    compatibility: '^3.7.0',
})
export class ProductImportPlugin {
    static options: ProductImportOptions = {};

    static init(options: ProductImportOptions = {}): Type<ProductImportPlugin> {
        this.options = options;
        return ProductImportPlugin;
    }
}
