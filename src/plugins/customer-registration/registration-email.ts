import { randomBytes } from 'node:crypto';
import { RequestContext, User, VendureEvent } from '@vendure/core';
import { EmailEventListener, emailVerificationHandler } from '@vendure/email-plugin';

const googleRegistrationKey = Symbol('googleRegistration');
type RegistrationContext = RequestContext & { [googleRegistrationKey]?: boolean };

export function generateGoogleRegistrationPassword() {
    return randomBytes(6).toString('base64url');
}

export function googleRegistrationContext(ctx: RequestContext) {
    return Object.assign(ctx.copy(), { [googleRegistrationKey]: true });
}

export class GoogleRegistrationEvent extends VendureEvent {
    constructor(
        public readonly ctx: RequestContext,
        public readonly user: User,
        public readonly generatedPassword: string,
    ) {
        super();
    }
}

export const manualVerificationEmailHandler = emailVerificationHandler.filter(
    event => !(event.ctx as RegistrationContext)[googleRegistrationKey],
);

export const googleVerificationEmailHandler = new EmailEventListener('email-verification')
    .on(GoogleRegistrationEvent)
    .setRecipient(event => event.user.identifier)
    .setFrom('{{ fromAddress }}')
    .setSubject('Verify your email and get your PetsUpRight password')
    .setTemplateVars(event => ({
        verificationToken: event.user.getNativeAuthenticationMethod().verificationToken,
        generatedPassword: event.generatedPassword,
    }));
