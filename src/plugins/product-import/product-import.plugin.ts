import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { ProductImportResolver } from './api/product-import.resolver';
import { productImportSchema } from './api/product-import.schema';
import { ImportValidationService } from './services/import-validation.service';
import { ProductImportService } from './services/product-import.service';
import { SpreadsheetParserService } from './services/spreadsheet-parser.service';

@VendurePlugin({
    imports: [PluginCommonModule],
    providers: [SpreadsheetParserService, ImportValidationService, ProductImportService],
    adminApiExtensions: { schema: productImportSchema, resolvers: [ProductImportResolver] },
    dashboard: './dashboard/index.tsx',
    compatibility: '^3.7.0',
})
export class ProductImportPlugin {}