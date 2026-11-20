import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { randomBytes } from 'node:crypto';
import { RegisterCustomerInput } from '@vendure/common/lib/generated-shop-types';
import {
    Allow,
    ConfigService,
    Ctx,
    CustomerService,
    EventBus,
    ExternalAuthenticationMethod,
    ExternalAuthenticationService,
    isGraphQlErrorResult,
    NativeAuthenticationMethod,
    Permission,
    PluginCommonModule,
    RequestContext,
    Transaction,
    TransactionalConnection,
    User,
    UserService,
    VendurePlugin,
} from '@vendure/core';
import gql from 'graphql-tag';
import { GoogleAuthPlugin } from '../google-auth/google-auth.plugin';
import { GOOGLE_AUTH_STRATEGY, GoogleIdentityVerifier } from '../google-auth/google-identity';
import {
    generateGoogleRegistrationPassword,
    googleRegistrationContext,
    GoogleRegistrationEvent,
} from './registration-email';

const schema = gql`
    type StorefrontRegistrationResult {
        success: Boolean!
        errorCode: String
        message: String
    }

    enum StorefrontPasswordResetResult {
        REQUESTED
        VERIFICATION_REQUESTED
        ACCOUNT_NOT_FOUND
    }

    extend type Mutation {
        registerStorefrontCustomer(input: RegisterCustomerInput!, googleToken: String): StorefrontRegistrationResult!
        requestStorefrontPasswordReset(emailAddress: String!): StorefrontPasswordResetResult!
    }
`;

@Resolver()
class CustomerRegistrationResolver {
    private readonly googleVerifier = new GoogleIdentityVerifier(GoogleAuthPlugin.options.googleClientId);

    constructor(
        private readonly customerService: CustomerService,
        private readonly userService: UserService,
        private readonly connection: TransactionalConnection,
        private readonly configService: ConfigService,
        private readonly externalAuthenticationService: ExternalAuthenticationService,
        private readonly eventBus: EventBus,
    ) {}

    @Transaction('auto', 'READ COMMITTED')
    @Mutation()
    @Allow(Permission.Public)
    async requestStorefrontPasswordReset(
        @Ctx() ctx: RequestContext,
        @Args('emailAddress') input: string,
    ) {
        const emailAddress = input.trim().toLowerCase();
        const matchedUser = await this.userService.getUserByEmailAddress(ctx, emailAddress);
        if (!matchedUser) return 'ACCOUNT_NOT_FOUND';

        // Serialize reset requests and first-time password setup for this customer.
        await this.connection.getRepository(ctx, User).findOne({
            where: { id: matchedUser.id },
            lock: { mode: 'pessimistic_write' },
        });
        const user = await this.userService.getUserByEmailAddress(ctx, emailAddress);
        if (user?.id !== matchedUser.id) return 'ACCOUNT_NOT_FOUND';
        if (!user.getNativeAuthenticationMethod(false)) {
            // The customer can set a password after proving mailbox access.
            const placeholder = randomBytes(32).toString('hex');
            const passwordHash = await this.configService.authOptions.passwordHashingStrategy.hash(placeholder);
            await this.connection.getRepository(ctx, NativeAuthenticationMethod).save(new NativeAuthenticationMethod({
                user,
                identifier: emailAddress,
                passwordHash,
            }));
        }

        if (!user.verified) {
            await this.customerService.refreshVerificationToken(ctx, emailAddress);
            return 'VERIFICATION_REQUESTED';
        }

        await this.customerService.requestPasswordReset(ctx, emailAddress);
        return 'REQUESTED';
    }

    @Transaction()
    @Mutation()
    @Allow(Permission.Public)
    async registerStorefrontCustomer(
        @Ctx() ctx: RequestContext,
        @Args('input') input: RegisterCustomerInput,
        @Args('googleToken') googleToken?: string,
    ) {
        if (googleToken == null && !input.password) {
            return { success: false, errorCode: 'MISSING_PASSWORD_ERROR', message: 'Enter a password to create your account.' };
        }

        let googleIdentity: Awaited<ReturnType<GoogleIdentityVerifier['verify']>>;
        if (googleToken != null) {
            googleIdentity = await this.googleVerifier.verify(googleToken).catch(() => undefined);
            if (!googleIdentity) {
                return { success: false, message: 'Select your Google account again to continue registration.' };
            }
            const linkedUser = await this.externalAuthenticationService.findCustomerUser(
                ctx, GOOGLE_AUTH_STRATEGY, googleIdentity.sub, false,
            );
            if (linkedUser) {
                return { success: false, message: 'This Google account is already registered. Sign in instead.' };
            }
        }

        const emailAddress = googleIdentity?.email ?? input.emailAddress.trim().toLowerCase();
        const existingUser = await this.userService.getUserByEmailAddress(ctx, emailAddress);
        if (existingUser) {
            return {
                success: false,
                errorCode: 'EMAIL_ADDRESS_CONFLICT_ERROR',
                message: 'This email address is already in use.',
            };
        }

        const generatedPassword = googleIdentity ? generateGoogleRegistrationPassword() : undefined;
        const registration = googleIdentity ? {
            emailAddress,
            firstName: googleIdentity.given_name || 'Google',
            lastName: googleIdentity.family_name || 'User',
            password: generatedPassword,
        } : { ...input, emailAddress };
        const emailCtx = googleIdentity ? googleRegistrationContext(ctx) : ctx;
        const result = await this.customerService.registerCustomerAccount(emailCtx, registration);
        if (isGraphQlErrorResult(result)) {
            return { success: false, errorCode: result.errorCode, message: result.message };
        }
        if (googleIdentity && generatedPassword) {
            const user = await this.userService.getUserByEmailAddress(ctx, emailAddress);
            if (!user) throw new Error('Unable to link Google to the new customer account.');
            await this.connection.getRepository(ctx, ExternalAuthenticationMethod).save(new ExternalAuthenticationMethod({
                user,
                strategy: GOOGLE_AUTH_STRATEGY,
                externalIdentifier: googleIdentity.sub,
            }));
            await this.eventBus.publish(new GoogleRegistrationEvent(ctx, user, generatedPassword));
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
