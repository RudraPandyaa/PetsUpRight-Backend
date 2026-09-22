import gql from 'graphql-tag';

export const productImportSchema = gql`
    type ProductImportIssue { row: Int!, message: String! }
    type ProductImportResult { products: Int!, variants: Int!, issues: [ProductImportIssue!]! }
    extend type Query { previewProductImport(rows: JSON!): ProductImportResult! }
    extend type Mutation { importProductsFromSheet(rows: JSON!): ProductImportResult! }
`;