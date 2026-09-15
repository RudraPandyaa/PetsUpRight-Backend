import {
    Injectable,
    OnApplicationBootstrap,
} from '@nestjs/common';

import {
    ProcessContext,
    RequestContextService,
} from '@vendure/core';

import { CmsPageService } from './cms-page.service';

@Injectable()
export class CmsInitService implements OnApplicationBootstrap {
    constructor(
        private cmsPageService: CmsPageService,
        private requestContextService: RequestContextService,
        private processContext: ProcessContext,
    ) {}

    async onApplicationBootstrap() {
        if (this.processContext.isWorker) {
            return;
        }

        const ctx = await this.requestContextService.create({
            apiType: 'admin',
        });

        await this.cmsPageService.ensureHomePage(ctx);

        console.log('CMS Home page checked/created');
    }
}