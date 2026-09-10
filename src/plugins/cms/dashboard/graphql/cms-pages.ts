import { graphql } from '@/gql';

export const cmsPagesQuery = graphql(`
    query CmsPages {
        cmsPages {
            items {
                id
                title
                slug
                isPublished
                createdAt
                updatedAt
            }
            totalItems
        }
    }
`);

export const cmsPageQuery = graphql(`
    query CmsPage($id: ID!) {
        cmsPage(id: $id) {
            id
            title
            slug
            isPublished
            createdAt
            updatedAt
            sections {
                id
                type
                position
                data
            }
        }
    }
`);

export const createCmsPageMutation = graphql(`
    mutation CreateCmsPage($input: CreateCmsPageInput!) {
        createCmsPage(input: $input) {
            id
            title
            slug
            isPublished
            createdAt
            updatedAt
        }
    }
`);

export const updateCmsPageMutation = graphql(`
    mutation UpdateCmsPage($input: UpdateCmsPageInput!) {
        updateCmsPage(input: $input) {
            id
            title
            slug
            isPublished
            updatedAt
        }
    }
`);

export const deleteCmsPageMutation = graphql(`
    mutation DeleteCmsPage($id: ID!) {
        deleteCmsPage(id: $id) {
            result
            message
        }
    }
`);

export const createCmsSectionMutation = graphql(`
    mutation CreateCmsSection($input: CreateCmsSectionInput!) {
        createCmsSection(input: $input) {
            id
            type
            position
            data
        }
    }
`);

export const updateCmsSectionMutation = graphql(`
    mutation UpdateCmsSection($input: UpdateCmsSectionInput!) {
        updateCmsSection(input: $input) {
            id
            type
            position
            data
        }
    }
`);

export const deleteCmsSectionMutation = graphql(`
    mutation DeleteCmsSection($id: ID!) {
        deleteCmsSection(id: $id) {
            result
            message
        }
    }
`);
