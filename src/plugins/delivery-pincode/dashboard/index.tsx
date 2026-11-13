import { defineDashboardExtension } from '@vendure/dashboard';
import { DeliverablePincodesPage } from './deliverable-pincodes-page';

defineDashboardExtension({
    routes: [
        {
            path: '/deliverable-pincodes',

            loader: () => ({
                breadcrumb: 'Deliverable pincodes',
            }),

            navMenuItem: {
                id: 'deliverable-pincodes',
                title: 'Deliverable Pincodes',
                sectionId: 'settings',
            },

            component: DeliverablePincodesPage,
        },
    ],
});
