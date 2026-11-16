import gql from 'graphql-tag';

export const adminApiExtensions = gql`
    enum OrderInvoiceType {
        INVOICE
        CREDIT_NOTE
    }

    enum OrderInvoiceStatus {
        ISSUED
        CANCELLED
    }

    enum InvoiceIssueTrigger {
        PAYMENT_SETTLED
        SHIPPED
        DELIVERED
        MANUAL
    }

    type OrderInvoice implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        orderId: ID!
        orderCode: String!
        customerName: String!
        customerEmail: String
        type: OrderInvoiceType!
        status: OrderInvoiceStatus!
        invoiceNumber: String!
        financialYear: String!
        issuedAt: DateTime!
        totalWithTax: Money!
        taxTotal: Money!
        currencyCode: CurrencyCode!
        relatedInvoiceId: ID
        reason: String
        emailedAt: DateTime
        "Signed link to the PDF (the same link the customer gets)."
        downloadUrl: String!
    }

    type OrderInvoiceList implements PaginatedList {
        items: [OrderInvoice!]!
        totalItems: Int!
    }

    type InvoiceNumberPreview {
        financialYear: String!
        nextInvoiceNumber: String!
        nextCreditNoteNumber: String!
        invoiceNumberError: String
        creditNoteNumberError: String
    }

    type InvoiceSettings {
        id: ID!
        enabled: Boolean!
        issueOn: InvoiceIssueTrigger!
        emailCustomer: Boolean!
        creditNoteOnCancel: Boolean!
        invoicePrefix: String!
        invoiceSuffix: String!
        invoiceNextNumber: Int!
        creditNotePrefix: String!
        creditNoteSuffix: String!
        creditNoteNextNumber: Int!
        numberPadding: Int!
        resetEachFinancialYear: Boolean!
        sellerLegalName: String!
        sellerTradeName: String!
        sellerAddress: String!
        sellerState: String!
        sellerGstin: String!
        sellerPan: String!
        sellerEmail: String!
        sellerPhone: String!
        logoUrl: String!
        shippingSac: String!
        notes: String!
        footerText: String!
        signatoryLabel: String!
        preview: InvoiceNumberPreview!
        stateOptions: [String!]!
    }

    input UpdateInvoiceSettingsInput {
        enabled: Boolean
        issueOn: InvoiceIssueTrigger
        emailCustomer: Boolean
        creditNoteOnCancel: Boolean
        invoicePrefix: String
        invoiceSuffix: String
        invoiceNextNumber: Int
        creditNotePrefix: String
        creditNoteSuffix: String
        creditNoteNextNumber: Int
        numberPadding: Int
        resetEachFinancialYear: Boolean
        sellerLegalName: String
        sellerTradeName: String
        sellerAddress: String
        sellerState: String
        sellerGstin: String
        sellerPan: String
        sellerEmail: String
        sellerPhone: String
        logoUrl: String
        shippingSac: String
        notes: String
        footerText: String
        signatoryLabel: String
    }

    input OrderInvoiceListOptions {
        skip: Int
        take: Int
        search: String
        type: OrderInvoiceType
    }

    extend type Query {
        invoiceSettings: InvoiceSettings!
        "What the next numbers would look like with these (unsaved) settings."
        previewInvoiceNumbers(input: UpdateInvoiceSettingsInput!): InvoiceNumberPreview!
        orderInvoiceList(options: OrderInvoiceListOptions): OrderInvoiceList!
        invoicesForOrder(orderId: ID!): [OrderInvoice!]!
        "The PDF, base64-encoded."
        invoicePdf(id: ID!): String!
    }

    extend type Mutation {
        updateInvoiceSettings(input: UpdateInvoiceSettingsInput!): InvoiceSettings!
        issueInvoice(orderId: ID!, sendEmail: Boolean = true): OrderInvoice!
        issueCreditNote(invoiceId: ID!, reason: String!, sendEmail: Boolean = true): OrderInvoice!
        resendInvoiceEmail(id: ID!): OrderInvoice!
    }
`;

export const shopApiExtensions = gql`
    type CustomerOrderInvoice {
        invoiceNumber: String!
        "INVOICE or CREDIT_NOTE"
        type: String!
        "ISSUED or CANCELLED"
        status: String!
        issuedAt: DateTime!
        totalWithTax: Money!
        downloadUrl: String!
    }

    extend type Query {
        "Invoices and credit notes for one of the signed-in customer's orders."
        myOrderInvoices(orderCode: String!): [CustomerOrderInvoice!]!
    }
`;
