import {
    PluginCommonModule,
    Type,
    VendurePlugin,
} from '@vendure/core';

import { adminApiExtensions, shopApiExtensions } from './api/api-extensions';
import { CmsPageAdminResolver } from './api/cms-page-admin.resolver';

import { CMS_PLUGIN_OPTIONS } from './constants';
import { CmsPage } from './entities/cms-page.entity';
import { CmsSection } from './entities/cms-section.entity';

import { CmsInitService } from './services/cms-init.service';
import { CmsPageService } from './services/cms-page.service';
import { CmsSectionService } from './services/cms-section.service';

import { PluginInitOptions } from './types';
import { CmsPageShopResolver } from './api/cms-page-shop.resolver';

@VendurePlugin({
    imports: [PluginCommonModule],

    providers: [
        {
            provide: CMS_PLUGIN_OPTIONS,
            useFactory: () => CmsPlugin.options,
        },
        CmsPageService,
        CmsSectionService,
        CmsInitService,
    ],

    entities: [
        CmsPage,
        CmsSection,
    ],

    adminApiExtensions: {
        schema: adminApiExtensions,
        resolvers: [
            CmsPageAdminResolver,
        ],
    },
    
    shopApiExtensions: {
        schema: shopApiExtensions,
        resolvers: [
            CmsPageShopResolver,
        ],
    },

    dashboard: './dashboard/index.tsx',

    compatibility: '^3.0.0',
})
export class CmsPlugin {
    static options: PluginInitOptions;

    static init(
        options: PluginInitOptions = {},
    ): Type<CmsPlugin> {
        this.options = options;
        return CmsPlugin;
    }
}