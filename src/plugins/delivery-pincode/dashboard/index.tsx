import { defineDashboardExtension } from '@vendure/dashboard';
import { DeliverablePincodesPage } from './deliverable-pincodes-page';

defineDashboardExtension({
    routes: [
        {
            path: '/deliverable-pincodes',

            loader: () => ({
                breadcrumb: 'Manual delivery pincodes',
            }),

            navMenuItem: {
                id: 'deliverable-pincodes',
                title: 'Manual Delivery Pincodes',
                sectionId: 'settings',
            },

            component: DeliverablePincodesPage,
        },
    ],
});
