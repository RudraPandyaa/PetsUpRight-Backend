import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';
import { ProductImportService } from '../services/product-import.service';

@Resolver()
export class ProductImportResolver {
    constructor(private readonly imports: ProductImportService) {}
    @Query()
    @Allow(Permission.ReadCatalog)
    previewProductImport(@Ctx() ctx: RequestContext, @Args('rows') rows: unknown) {
        return this.imports.preview(ctx, rows);
    }
    @Mutation()
    @Allow(Permission.CreateCatalog, Permission.UpdateCatalog)
    // No @Transaction(): the service commits each product in its own
    // transaction so finished products are saved as the import runs.
    importProductsFromSheet(
        @Ctx() ctx: RequestContext,
        @Args('rows') rows: unknown,
        @Args('fileName', { nullable: true }) fileName?: string,
    ) {
        return this.imports.import(ctx, rows, fileName ?? undefined);
    }
}