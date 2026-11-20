import { OAuth2Client } from 'google-auth-library'

export const GOOGLE_AUTH_STRATEGY = 'google'

export class GoogleIdentityVerifier {
  private readonly client: OAuth2Client

  constructor(private readonly clientId: string) {
    this.client = new OAuth2Client(clientId)
  }

  async verify(token: string) {
    const ticket = await this.client.verifyIdToken({
      idToken: token,
      audience: this.clientId,
    })
    const payload = ticket.getPayload()
    if (!payload?.sub || !payload.email || !payload.email_verified) return

    return { ...payload, email: payload.email.trim().toLowerCase() }
  }
}
