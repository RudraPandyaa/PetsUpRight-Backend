import {
    PluginCommonModule,
    VendurePlugin,
} from '@vendure/core';
import {
    adminApiExtensions,
    shopApiExtensions,
} from './api/product-review.schema';
import { ProductReviewAdminResolver } from './api/product-review-admin.resolver';
import { ProductReviewShopResolver } from './api/product-review-shop.resolver';
import { ProductReview } from './entities/product-review.entity';
import { ProductReviewService } from './services/product-review.service';

@VendurePlugin({
    imports: [PluginCommonModule],

    entities: [
        ProductReview,
    ],

    providers: [
        ProductReviewService,
    ],

    shopApiExtensions: {
        schema: shopApiExtensions,
        resolvers: [
            ProductReviewShopResolver,
        ],
    },

    adminApiExtensions: {
        schema: adminApiExtensions,
        resolvers: [
            ProductReviewAdminResolver,
        ],
    },

    dashboard: './dashboard/index.tsx',

    compatibility: '^3.0.0',
})
export class ProductReviewPlugin {}