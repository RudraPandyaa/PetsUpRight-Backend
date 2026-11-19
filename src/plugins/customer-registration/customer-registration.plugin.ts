import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { RegisterCustomerInput } from '@vendure/common/lib/generated-shop-types';
import {
    Allow,
    Ctx,
    CustomerService,
    isGraphQlErrorResult,
    Permission,
    PluginCommonModule,
    RequestContext,
    Transaction,
    UserService,
    VendurePlugin,
} from '@vendure/core';
import gql from 'graphql-tag';

const schema = gql`
    type StorefrontRegistrationResult {
        success: Boolean!
        errorCode: String
        message: String
    }

    extend type Mutation {
        registerStorefrontCustomer(input: RegisterCustomerInput!): StorefrontRegistrationResult!
    }
`;

@Resolver()
class CustomerRegistrationResolver {
    constructor(
        private readonly customerService: CustomerService,
        private readonly userService: UserService,
    ) {}

    @Transaction()
    @Mutation()
    @Allow(Permission.Public)
    async registerStorefrontCustomer(
        @Ctx() ctx: RequestContext,
        @Args('input') input: RegisterCustomerInput,
    ) {
        const emailAddress = input.emailAddress.trim().toLowerCase();
        const existingUser = await this.userService.getUserByEmailAddress(ctx, emailAddress);
        if (existingUser) {
            return {
                success: false,
                errorCode: 'EMAIL_ADDRESS_CONFLICT_ERROR',
                message: 'This email address is already in use.',
            };
        }

        const result = await this.customerService.registerCustomerAccount(ctx, { ...input, emailAddress });
        if (isGraphQlErrorResult(result)) {
            return { success: false, errorCode: result.errorCode, message: result.message };
        }
        return result;
    }
}

@VendurePlugin({
    imports: [PluginCommonModule],
    shopApiExtensions: { schema, resolvers: [CustomerRegistrationResolver] },
    compatibility: '^3.0.0',
})
export class CustomerRegistrationPlugin {}
