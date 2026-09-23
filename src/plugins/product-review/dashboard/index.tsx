import { defineDashboardExtension } from '@vendure/dashboard';
import { ProductReviewsPage } from './product-reviews-page';

defineDashboardExtension({
    routes: [
        {
            path: '/product-reviews',

            loader: () => ({
                breadcrumb: 'Product reviews',
            }),

            navMenuItem: {
                id: 'product-reviews',
                title: 'Product Reviews',
                sectionId: 'catalog',
            },

            component: ProductReviewsPage,
        },
    ],
});