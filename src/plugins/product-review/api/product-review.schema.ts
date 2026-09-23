import gql from 'graphql-tag';

const commonTypes = gql`
    enum ProductReviewStatus {
        PENDING
        APPROVED
        REJECTED
    }

    type ProductReview implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        productId: ID!
        rating: Int!
        title: String!
        body: String!
        customerName: String!
        verifiedPurchase: Boolean!
        status: ProductReviewStatus!
        isFeatured: Boolean!
        displayOrder: Int!
        product: Product!
    }

    type ProductReviewList implements PaginatedList {
        items: [ProductReview!]!
        totalItems: Int!
        averageRating: Float!
        ratingCounts: [ProductRatingCount!]!
    }

    type AdminProductReviewList implements PaginatedList {
        items: [ProductReview!]!
        totalItems: Int!
    }

    type ProductRatingCount {
        rating: Int!
        count: Int!
    }

    type ProductRatingSummary {
        productId: ID!
        averageRating: Float!
        totalReviews: Int!
        ratingCounts: [ProductRatingCount!]!
    }
`;

export const shopApiExtensions = gql`
    ${commonTypes}

    input SubmitProductReviewInput {
        productId: ID!
        rating: Int!
        title: String!
        body: String!
    }

    extend type Query {
        productReviews(
            productId: ID!
            skip: Int = 0
            take: Int = 10
        ): ProductReviewList!

        productRating(productId: ID!): ProductRatingSummary!

        featuredProductReviews(take: Int = 6): [ProductReview!]!
    }

    extend type Mutation {
        submitProductReview(
            input: SubmitProductReviewInput!
        ): ProductReview!
    }
`;

export const adminApiExtensions = gql`
    ${commonTypes}

    input AdminProductReviewListOptions {
        skip: Int
        take: Int
        productId: ID
        status: ProductReviewStatus
        isFeatured: Boolean
    }

    input UpdateProductReviewInput {
        id: ID!
        status: ProductReviewStatus
        isFeatured: Boolean
        displayOrder: Int
    }

    extend type Query {
        adminProductReviews(
            options: AdminProductReviewListOptions
        ): AdminProductReviewList!
    }

    extend type Mutation {
        updateProductReview(
            input: UpdateProductReviewInput!
        ): ProductReview!

        deleteProductReview(id: ID!): Boolean!
    }
`;