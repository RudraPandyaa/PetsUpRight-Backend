import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import gql from 'graphql-tag';

import { RazorpayService } from './razorpay.service';
import { RazorpayResolver } from './razorpay.resolver';

const shopApiExtensions = gql`
    type RazorpayOrder {
        id: String!
        amount: Int!
        currency: String!
        receipt: String
        status: String
    }

    extend type Mutation {
    createRazorpayOrder: RazorpayOrder!
}
`;

@VendurePlugin({
    imports: [PluginCommonModule],

    providers: [
        RazorpayService,
    ],

    shopApiExtensions: {
        schema: shopApiExtensions,
        resolvers: [
            RazorpayResolver,
        ],
    },
})
export class RazorpayPlugin {}  