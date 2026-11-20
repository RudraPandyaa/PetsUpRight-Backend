import {
  AuthenticationStrategy,
  ExternalAuthenticationMethod,
  ExternalAuthenticationService,
  Injector,
  Logger,
  RequestContext,
  User,
  UserService,
} from '@vendure/core'
import { DocumentNode } from 'graphql'
import { gql } from 'graphql-tag'
import { GOOGLE_AUTH_STRATEGY, GoogleIdentityVerifier } from './google-identity'

type GoogleAuthData = {
  token: string
}

export class GoogleAuthStrategy
  implements AuthenticationStrategy<GoogleAuthData>
{
  readonly name = GOOGLE_AUTH_STRATEGY

  private readonly verifier: GoogleIdentityVerifier
  private externalAuthenticationService!: ExternalAuthenticationService
  private userService!: UserService
  private readonly logger = new Logger()

  constructor(googleClientId: string) {
    this.verifier = new GoogleIdentityVerifier(googleClientId)
  }

  init(injector: Injector): void {
    this.externalAuthenticationService =
      injector.get(ExternalAuthenticationService)
    this.userService = injector.get(UserService)
  }

  defineInputType(): DocumentNode {
    return gql`
      input GoogleAuthInput {
        token: String!
      }
    `
  }

  async authenticate(
    ctx: RequestContext,
    data: GoogleAuthData,
  ): Promise<User | false | string> {
    try {
      const payload = await this.verifier.verify(data.token)
      if (!payload) return false

      const existingUser =
        await this.externalAuthenticationService.findCustomerUser(
          ctx,
          this.name,
          payload.sub,
          false,
        )

      const user = existingUser ?? await this.userService.getUserByEmailAddress(ctx, payload.email)
      if (!user) return 'No account is registered with this Google email. Create an account first.'
      if (!user.verified) return 'Please verify your PetsUpRight email before signing in.'

      if (existingUser) return existingUser

      const linkedToAnotherGoogleAccount = user.authenticationMethods.some(
        method => method instanceof ExternalAuthenticationMethod && method.strategy === this.name,
      )
      // Google owns Gmail and Workspace addresses. Other addresses need an explicit account link.
      if (linkedToAnotherGoogleAccount || (!payload.email.endsWith('@gmail.com') && !payload.hd)) {
        return 'Sign in with your PetsUpRight email and password for this account.'
      }
      return user
    } catch (error) {
      this.logger.error(
        `Google authentication failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        'GoogleAuthStrategy',
      )

      return false
    }
  }
}
