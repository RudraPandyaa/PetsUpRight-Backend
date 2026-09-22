import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext, Transaction } from '@vendure/core';
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
    @Transaction()
    importProductsFromSheet(@Ctx() ctx: RequestContext, @Args('rows') rows: unknown) {
        return this.imports.import(ctx, rows);
    }
}