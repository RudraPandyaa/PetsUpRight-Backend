import {
  AuthenticationStrategy,
  ExternalAuthenticationService,
  Injector,
  Logger,
  RequestContext,
  User,
} from '@vendure/core'
import { OAuth2Client } from 'google-auth-library'
import { DocumentNode } from 'graphql'
import { gql } from 'graphql-tag'

type GoogleAuthData = {
  token: string
}

export class GoogleAuthStrategy
  implements AuthenticationStrategy<GoogleAuthData>
{
  readonly name = 'google'

  private readonly client: OAuth2Client
  private externalAuthenticationService!: ExternalAuthenticationService
  private readonly logger = new Logger()

  constructor(private readonly googleClientId: string) {
    this.client = new OAuth2Client(googleClientId)
  }

  init(injector: Injector): void {
    this.externalAuthenticationService =
      injector.get(ExternalAuthenticationService)
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
  ): Promise<User | false> {
    try {
      const ticket = await this.client.verifyIdToken({
        idToken: data.token,
        audience: this.googleClientId,
      })

      const payload = ticket.getPayload()

      // Only accept Google accounts with verified email addresses.
      if (
        !payload?.sub ||
        !payload.email ||
        !payload.email_verified
      ) {
        return false
      }

      const existingUser =
        await this.externalAuthenticationService.findCustomerUser(
          ctx,
          this.name,
          payload.sub,
        )

      if (existingUser) {
        return existingUser
      }

      return await this.externalAuthenticationService.createCustomerAndUser(
        ctx,
        {
          strategy: this.name,
          externalIdentifier: payload.sub,
          verified: true,
          emailAddress: payload.email,
          firstName: payload.given_name || 'Google',
          lastName: payload.family_name || 'User',
        },
      )
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