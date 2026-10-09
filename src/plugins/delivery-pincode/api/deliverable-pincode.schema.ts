import gql from 'graphql-tag';

const commonTypes = gql`
    type PincodeDeliverability {
        pincode: String!
        deliverable: Boolean!
        message: String!
    }
`;

export const shopApiExtensions = gql`
    ${commonTypes}

    extend type Query {
        "Whether orders can be delivered to the pincode"
        checkPincodeDeliverability(pincode: String!): PincodeDeliverability!
    }
`;

export const adminApiExtensions = gql`
    ${commonTypes}

    type DeliverablePincode implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        code: String!
        area: String
    }

    type AddDeliverablePincodesResult {
        added: [DeliverablePincode!]!
        alreadyExisting: [String!]!
        invalid: [String!]!
    }

    extend type Query {
        deliverablePincodes: [DeliverablePincode!]!
        checkPincodeDeliverability(pincode: String!): PincodeDeliverability!
    }

    extend type Mutation {
        "Pincodes may be separated by commas, spaces or new lines"
        addDeliverablePincodes(
            pincodes: [String!]!
            area: String
        ): AddDeliverablePincodesResult!
        deleteDeliverablePincode(id: ID!): Boolean!
    }
`;
