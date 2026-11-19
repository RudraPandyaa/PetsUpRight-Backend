import { Inject, Injectable } from '@nestjs/common';
import { DeletionResponse, DeletionResult } from '@vendure/common/lib/generated-types';
import { CustomFieldsObject, ID, PaginatedList } from '@vendure/common/lib/shared-types';
import {
    CustomFieldRelationService,
    ListQueryBuilder,
    ListQueryOptions,
    RelationPaths,
    RequestContext,
    TransactionalConnection,
    assertFound,
    patchEntity
} from '@vendure/core';
import { CMS_PLUGIN_OPTIONS } from '../constants';
import { CmsPage } from '../entities/cms-page.entity';
import { CmsSection } from '../entities/cms-section.entity';
import { PluginInitOptions } from '../types';

// These can be replaced by generated types if you set up code generation
interface CreateCmsPageInput {
    title: string;
    slug: string;
    isPublished: boolean;
    // Define the input fields here
    customFields?: CustomFieldsObject;
}
interface UpdateCmsPageInput {
    id: ID;
    title?: string;
    slug?: string;
    isPublished?: boolean;
    // Define the input fields here
    customFields?: CustomFieldsObject;
}

@Injectable()
export class CmsPageService {
    constructor(
        private connection: TransactionalConnection,
        private listQueryBuilder: ListQueryBuilder,
        private customFieldRelationService: CustomFieldRelationService, @Inject(CMS_PLUGIN_OPTIONS) private options: PluginInitOptions
    ) {}

    findAll(
        ctx: RequestContext,
        options?: ListQueryOptions<CmsPage>,
        relations?: RelationPaths<CmsPage>,
    ): Promise<PaginatedList<CmsPage>> {
        return this.listQueryBuilder
            .build(CmsPage, options, {
                relations,
                ctx,
            }
            ).getManyAndCount().then(([items, totalItems]) => {
                return {
                    items,
                    totalItems,
                }
            }
            );
    }

    findOne(
        ctx: RequestContext,
        id: ID,
        relations?: RelationPaths<CmsPage>,
    ): Promise<CmsPage | null> {
        return this.connection
            .getRepository(ctx, CmsPage)
            .findOne({
                where: { id },
                relations,
            });
    }

    findBySlug(
    ctx: RequestContext,
    slug: string,
    relations?: RelationPaths<CmsPage>,
): Promise<CmsPage | null> {
    return this.connection
        .getRepository(ctx, CmsPage)
        .findOne({
            where: {
                slug,
                isPublished: true,
            },
            relations,
        });
}

    async create(ctx: RequestContext, input: CreateCmsPageInput): Promise<CmsPage> {
        const newEntityInstance = new CmsPage(input);
        const newEntity = await this.connection.getRepository(ctx, CmsPage).save(newEntityInstance);
        await this.customFieldRelationService.updateRelations(ctx, CmsPage, input, newEntity);
        return assertFound(this.findOne(ctx, newEntity.id));
    }

    async update(ctx: RequestContext, input: UpdateCmsPageInput): Promise<CmsPage> {
        const entity = await this.connection.getEntityOrThrow(ctx, CmsPage, input.id);
        const updatedEntity = patchEntity(entity, input);
        await this.connection.getRepository(ctx, CmsPage).save(updatedEntity, { reload: false });
        await this.customFieldRelationService.updateRelations(ctx, CmsPage, input, updatedEntity);
        return assertFound(this.findOne(ctx, updatedEntity.id));
    }

    async delete(ctx: RequestContext, id: ID): Promise<DeletionResponse> {
        const entity = await this.connection.getEntityOrThrow(ctx, CmsPage, id);
        try {
            await this.connection.getRepository(ctx, CmsPage).remove(entity);
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
    async ensureHomePage(ctx: RequestContext): Promise<CmsPage> {
    const existing = await this.connection
        .getRepository(ctx, CmsPage)
        .findOne({
            where: { slug: 'home' },
        });

    if (existing) {
        return existing;
    }

    return this.create(ctx, {
        title: 'Home',
        slug: 'home',
        isPublished: true,
    });
}

    async ensurePoliciesPage(ctx: RequestContext): Promise<CmsPage> {
        const pageRepository = this.connection.getRepository(ctx, CmsPage);
        let page = await pageRepository.findOne({
            where: { slug: 'policies' },
            relations: ['sections'],
        });

        if (!page) {
            page = await pageRepository.save(new CmsPage({
                title: 'Policies and Contact Details',
                slug: 'policies',
                isPublished: true,
            }));
            page.sections = [];
        } else if (page.title !== 'Policies and Contact Details') {
            page.title = 'Policies and Contact Details';
            await pageRepository.save(page);
        }

        const defaults = [
            {
                type: 'cancellation-policy',
                data: {
                    text: 'We do not offer order cancellations. For any concerns, please contact us at petsupright@gmail.com.',
                    publishedText: 'We do not offer order cancellations. For any concerns, please contact us at petsupright@gmail.com.',
                },
            },
            {
                type: 'return-policy',
                data: {
                    text: 'We do not offer standard returns. If you experience any issues with your order, please contact us at petsupright@gmail.com.',
                    publishedText: 'We do not offer standard returns. If you experience any issues with your order, please contact us at petsupright@gmail.com.',
                },
            },
            {
                type: 'refund-policy',
                data: {
                    text: 'We do not offer standard refunds. For any refund-related concerns, please contact us at petsupright@gmail.com. Applicable consumer rights remain unaffected.',
                    publishedText: 'We do not offer standard refunds. For any refund-related concerns, please contact us at petsupright@gmail.com. Applicable consumer rights remain unaffected.',
                },
            },
            {
                type: 'contact-details',
                data: {
                    address: '',
                    mobileNumber: '',
                    email: 'petsupright@gmail.com',
                    publishedAddress: '',
                    publishedMobileNumber: '',
                    publishedEmail: 'petsupright@gmail.com',
                },
            },
        ];
        const existingTypes = new Set((page.sections ?? []).map(section => section.type));
        const sectionRepository = this.connection.getRepository(ctx, CmsSection);

        for (const [index, policy] of defaults.entries()) {
            if (existingTypes.has(policy.type)) {
                continue;
            }

            const section = new CmsSection();
            section.type = policy.type;
            section.position = index + 1;
            section.data = policy.data;
            section.page = page;
            await sectionRepository.save(section);
        }

        return page;
    }

}
