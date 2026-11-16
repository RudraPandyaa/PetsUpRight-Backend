import { defineDashboardExtension } from '@vendure/dashboard';

import { InvoiceSettingsPage } from './invoice-settings-page';
import { InvoicesPage } from './invoices-page';
import { OrderInvoicesBlock } from './order-invoices-block';

defineDashboardExtension({
    routes: [
        {
            path: '/invoices',
            loader: () => ({ breadcrumb: 'Invoices' }),
            navMenuItem: {
                id: 'invoices',
                title: 'Invoices',
                sectionId: 'sales',
            },
            component: InvoicesPage,
        },
        {
            path: '/invoice-settings',
            loader: () => ({ breadcrumb: 'Invoice settings' }),
            navMenuItem: {
                id: 'invoice-settings',
                title: 'Invoice Settings',
                sectionId: 'settings',
            },
            component: InvoiceSettingsPage,
        },
    ],
    pageBlocks: [
        {
            id: 'order-invoices',
            title: 'Invoices',
            location: {
                pageId: 'order-detail',
                column: 'side',
                position: { blockId: 'customer', order: 'after' },
            },
            component: OrderInvoicesBlock,
        },
    ],
});
