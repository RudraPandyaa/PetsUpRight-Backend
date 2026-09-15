import gql from 'graphql-tag';

const cmsPageAdminApiExtensions = gql`
    type CmsSection implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        type: String!
        position: Int!
        data: JSON!
    }

    type CmsPage implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        title: String!
        slug: String!
        isPublished: Boolean!
        sections: [CmsSection!]!
    }

    type CmsPageList implements PaginatedList {
        items: [CmsPage!]!
        totalItems: Int!
    }

    extend type Query {
        cmsPage(id: ID!): CmsPage
        cmsPages(options: CmsPageListOptions): CmsPageList!
    }

    input CmsPageListOptions

    input CreateCmsPageInput {
        title: String!
        slug: String!
        isPublished: Boolean!
    }

    input UpdateCmsPageInput {
        id: ID!
        title: String
        slug: String
        isPublished: Boolean
    }

    input CreateCmsSectionInput {
        type: String!
        position: Int!
        data: JSON!
        pageId: ID!
    }

    input UpdateCmsSectionInput {
        id: ID!
        type: String
        position: Int
        data: JSON
        pageId: ID
    }

    extend type Mutation {
        createCmsPage(input: CreateCmsPageInput!): CmsPage!
        updateCmsPage(input: UpdateCmsPageInput!): CmsPage!
        deleteCmsPage(id: ID!): DeletionResponse!

        createCmsSection(input: CreateCmsSectionInput!): CmsSection!
        updateCmsSection(input: UpdateCmsSectionInput!): CmsSection!
        deleteCmsSection(id: ID!): DeletionResponse!
    }
`;

export const adminApiExtensions = gql`
    ${cmsPageAdminApiExtensions}
`;

const cmsPageShopApiExtensions = gql`
    type CmsSection implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        type: String!
        position: Int!
        data: JSON!
    }

    type CmsPage implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        title: String!
        slug: String!
        isPublished: Boolean!
        sections: [CmsSection!]!
    }

    extend type Query {
        cmsPageBySlug(slug: String!): CmsPage
    }
`;

export const shopApiExtensions = gql`
    ${cmsPageShopApiExtensions}
`;