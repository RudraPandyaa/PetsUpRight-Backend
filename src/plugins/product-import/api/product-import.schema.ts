import gql from 'graphql-tag';

export const productImportSchema = gql`
    type ProductImportIssue { row: Int!, message: String! }
    type ProductImportResult {
        products: Int!
        variants: Int!
        issues: [ProductImportIssue!]!
        "Path of the import log, relative to the backend folder"
        logFile: String
    }
    extend type Query { previewProductImport(rows: JSON!): ProductImportResult! }
    extend type Mutation { importProductsFromSheet(rows: JSON!, fileName: String): ProductImportResult! }
`;
