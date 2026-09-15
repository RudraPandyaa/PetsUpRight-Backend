import {
    DeepPartial,
    HasCustomFields,
    VendureEntity,
} from '@vendure/core';
import {
    Column,
    Entity,
    OneToMany,
} from 'typeorm';

import { CmsSection } from './cms-section.entity';

export class CmsPageCustomFields {}

@Entity()
export class CmsPage
    extends VendureEntity
    implements HasCustomFields {

    constructor(input?: DeepPartial<CmsPage>) {
        super(input);
    }

    @Column()
    title: string;

    @Column({ unique: true })
    slug: string;

    @Column({ default: false })
    isPublished: boolean;

    @OneToMany(
        () => CmsSection,
        section => section.page,
    )
    sections: CmsSection[];

    @Column(type => CmsPageCustomFields)
    customFields: CmsPageCustomFields;
}