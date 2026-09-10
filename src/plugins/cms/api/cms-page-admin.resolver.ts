import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import {
    Allow,
    Ctx,
    ID,
    Permission,
    RelationPaths,
    Relations,
    RequestContext,
} from '@vendure/core';

import { CmsPage } from '../entities/cms-page.entity';
import { CmsSection } from '../entities/cms-section.entity';

import { CmsPageService } from '../services/cms-page.service';
import { CmsSectionService } from '../services/cms-section.service';

@Resolver()
export class CmsPageAdminResolver {
    constructor(
        private cmsPageService: CmsPageService,
        private cmsSectionService: CmsSectionService,
    ) {}

    @Query()
    @Allow(Permission.Authenticated)
    async cmsPage(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: ID },
        @Relations(CmsPage) relations: RelationPaths<CmsPage>,
    ) {
        return this.cmsPageService.findOne(
            ctx,
            args.id,
            relations,
        );
    }

    @Query()
    @Allow(Permission.Authenticated)
    async cmsPages(
        @Ctx() ctx: RequestContext,
        @Args() args: any,
        @Relations(CmsPage) relations: RelationPaths<CmsPage>,
    ) {
        return this.cmsPageService.findAll(
            ctx,
            args.options,
            relations,
        );
    }

    @Mutation()
    @Allow(Permission.Authenticated)
    async createCmsPage(
        @Ctx() ctx: RequestContext,
        @Args() args: any,
    ) {
        return this.cmsPageService.create(
            ctx,
            args.input,
        );
    }

    @Mutation()
    @Allow(Permission.Authenticated)
    async updateCmsPage(
        @Ctx() ctx: RequestContext,
        @Args() args: any,
    ) {
        return this.cmsPageService.update(
            ctx,
            args.input,
        );
    }

    @Mutation()
    @Allow(Permission.Authenticated)
    async deleteCmsPage(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: ID },
    ) {
        return this.cmsPageService.delete(
            ctx,
            args.id,
        );
    }

    @Mutation()
    @Allow(Permission.Authenticated)
    async createCmsSection(
        @Ctx() ctx: RequestContext,
        @Args() args: any,
    ) {
        return this.cmsSectionService.create(
            ctx,
            args.input,
        );
    }

    @Mutation()
    @Allow(Permission.Authenticated)
    async updateCmsSection(
        @Ctx() ctx: RequestContext,
        @Args() args: any,
    ) {
        return this.cmsSectionService.update(
            ctx,
            args.input,
        );
    }

    @Mutation()
    @Allow(Permission.Authenticated)
    async deleteCmsSection(
        @Ctx() ctx: RequestContext,
        @Args() args: { id: ID },
    ) {
        return this.cmsSectionService.delete(
            ctx,
            args.id,
        );
    }
}