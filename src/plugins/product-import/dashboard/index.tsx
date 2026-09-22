import { Button, defineDashboardExtension } from '@vendure/dashboard';
import { useNavigate } from '@tanstack/react-router';
import { ProductCustomFields } from './product-custom-fields';
import { CombinationSelector } from './combination-selector';
import { ImportProductsPage } from './import-products-page';

defineDashboardExtension({
    routes: [
        {
            path: '/import-products',
            component: ImportProductsPage,
        },
    ],
    actionBarItems: [
        {
            id: 'product-import-button',
            pageId: 'product-list',
            position: { itemId: 'create-button', order: 'before' },
            requiresPermission: 'CreateCatalog',
            component: () => {
                const navigate = useNavigate();

                return (
                    <Button
                        variant="outline"
                        onClick={() => navigate({ to: '/import-products' })}
                    >
                        Import products
                    </Button>
                );
            },
        },
    ],
    pageBlocks: [
        {
            id: 'selected-variant-combinations',
            title: 'Product variants',
            location: {
                pageId: 'product-detail',
                column: 'main',
                position: {
                    blockId: 'generate-variants',
                    order: 'replace',
                },
            },
            shouldRender: context =>
                !!context.entity &&
                context.entity.variantList?.totalItems === 0 &&
                !!context.entity.optionGroups?.length,
            component: ({ context }) => (
                <CombinationSelector
                    productId={context.entity.id}
                    productName={context.entity.name}
                    groups={context.entity.optionGroups}
                />
            ),
        },
        {
            id: 'conditional-product-custom-fields',
            title: 'Product details',
            location: {
                pageId: 'product-detail',
                column: 'main',
                position: { blockId: 'custom-fields', order: 'replace' },
            },
            component: () => <ProductCustomFields />,
        },
    ],
});