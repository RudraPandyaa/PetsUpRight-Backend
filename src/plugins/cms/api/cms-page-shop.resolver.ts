import { Args, Query, Resolver } from '@nestjs/graphql';

import {
    Allow,
    Ctx,
    Permission,
    RelationPaths,
    Relations,
    RequestContext,
} from '@vendure/core';

import { CmsPage } from '../entities/cms-page.entity';
import { CmsPageService } from '../services/cms-page.service';

@Resolver()
export class CmsPageShopResolver {
    constructor(
        private cmsPageService: CmsPageService,
    ) {}

    @Query()
    @Allow(Permission.Public)
    async cmsPageBySlug(
        @Ctx() ctx: RequestContext,
        @Args() args: { slug: string },
        @Relations(CmsPage) relations: RelationPaths<CmsPage>,
    ): Promise<CmsPage | null> {
        return this.cmsPageService.findBySlug(
            ctx,
            args.slug,
            relations,
        );
    }
}