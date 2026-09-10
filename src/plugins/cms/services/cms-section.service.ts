import { Injectable } from '@nestjs/common';

import {
    DeletionResponse,
    DeletionResult,
} from '@vendure/common/lib/generated-types';

import {
    ID,
    PaginatedList,
} from '@vendure/common/lib/shared-types';

import {
    assertFound,
    CustomFieldRelationService,
    ListQueryBuilder,
    ListQueryOptions,
    patchEntity,
    RelationPaths,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';

import { CmsPage } from '../entities/cms-page.entity';
import { CmsSection } from '../entities/cms-section.entity';

interface CustomFieldsObject {
    [key: string]: any;
}

interface CreateCmsSectionInput {
    type: string;
    position: number;
    data: Record<string, any>;
    pageId: ID;
    customFields?: CustomFieldsObject;
}

interface UpdateCmsSectionInput {
    id: ID;
    type?: string;
    position?: number;
    data?: Record<string, any>;
    pageId?: ID;
    customFields?: CustomFieldsObject;
}

@Injectable()
export class CmsSectionService {
    constructor(
        private connection: TransactionalConnection,
        private listQueryBuilder: ListQueryBuilder,
        private customFieldRelationService: CustomFieldRelationService,
    ) {}

    findAll(
        ctx: RequestContext,
        options?: ListQueryOptions<CmsSection>,
        relations?: RelationPaths<CmsSection>,
    ): Promise<PaginatedList<CmsSection>> {
        return this.listQueryBuilder
            .build(CmsSection, options, {
                relations,
                ctx,
            })
            .getManyAndCount()
            .then(([items, totalItems]) => ({
                items,
                totalItems,
            }));
    }

    findOne(
        ctx: RequestContext,
        id: ID,
        relations?: RelationPaths<CmsSection>,
    ): Promise<CmsSection | null> {
        return this.connection
            .getRepository(ctx, CmsSection)
            .findOne({
                where: { id },
                relations,
            });
    }

    async create(
        ctx: RequestContext,
        input: CreateCmsSectionInput,
    ): Promise<CmsSection> {
        const page = await this.connection.getEntityOrThrow(
            ctx,
            CmsPage,
            input.pageId,
        );

        const newSection = new CmsSection({
            type: input.type,
            position: input.position,
            data: input.data,
            page,
        });

        const savedSection = await this.connection
            .getRepository(ctx, CmsSection)
            .save(newSection);

        await this.customFieldRelationService.updateRelations(
            ctx,
            CmsSection,
            input,
            savedSection,
        );

        return assertFound(
            this.findOne(
                ctx,
                savedSection.id,
                ['page'],
            ),
        );
    }

    async update(
        ctx: RequestContext,
        input: UpdateCmsSectionInput,
    ): Promise<CmsSection> {
        const entity = await this.connection.getEntityOrThrow(
            ctx,
            CmsSection,
            input.id,
            {
                relations: ['page'],
            },
        );

        const {
            pageId,
            ...updateData
        } = input;

        patchEntity(entity, updateData);

        if (pageId) {
            entity.page = await this.connection.getEntityOrThrow(
                ctx,
                CmsPage,
                pageId,
            );
        }

        await this.connection
            .getRepository(ctx, CmsSection)
            .save(entity);

        await this.customFieldRelationService.updateRelations(
            ctx,
            CmsSection,
            input,
            entity,
        );

        return assertFound(
            this.findOne(
                ctx,
                entity.id,
                ['page'],
            ),
        );
    }

    async delete(
        ctx: RequestContext,
        id: ID,
    ): Promise<DeletionResponse> {
        const entity = await this.connection.getEntityOrThrow(
            ctx,
            CmsSection,
            id,
        );

        try {
            await this.connection
                .getRepository(ctx, CmsSection)
                .remove(entity);

            return {
                result: DeletionResult.DELETED,
            };
        } catch (e: any) {
            return {
                result: DeletionResult.NOT_DELETED,
                message: e.toString(),
            };
        }
    }
}