import {
    DeepPartial,
    HasCustomFields,
    VendureEntity,
} from '@vendure/core';
import {
    Column,
    Entity,
    ManyToOne,
} from 'typeorm';

import { CmsPage } from './cms-page.entity';

export class CmsSectionCustomFields {}

@Entity()
export class CmsSection
    extends VendureEntity
    implements HasCustomFields {

    constructor(input?: DeepPartial<CmsSection>) {
        super(input);
    }

    @Column()
    type: string;

    @Column({ default: 0 })
    position: number;

    @Column({ type: 'jsonb' })
    data: Record<string, any>;

    @ManyToOne(
        () => CmsPage,
        page => page.sections,
        {
            onDelete: 'CASCADE',
        },
    )
    page: CmsPage;

    @Column(type => CmsSectionCustomFields)
    customFields: CmsSectionCustomFields;
}