import { defineDashboardExtension } from '@vendure/dashboard';

import { OrderEmailSettingsPage } from './order-email-settings-page';

defineDashboardExtension({
    routes: [
        {
            path: '/email-notifications',
            loader: () => ({ breadcrumb: 'Email notifications' }),
            navMenuItem: {
                id: 'email-notifications',
                title: 'Email Notifications',
                sectionId: 'settings',
            },
            component: OrderEmailSettingsPage,
        },
    ],
});
