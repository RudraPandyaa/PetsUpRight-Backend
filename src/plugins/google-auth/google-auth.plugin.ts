import {
  PluginCommonModule,
  VendurePlugin,
} from '@vendure/core'
import { GoogleAuthStrategy } from './google-auth.strategy'

interface GoogleAuthPluginOptions {
  googleClientId: string
}

@VendurePlugin({
  imports: [PluginCommonModule],
  configuration: config => {
    const { googleClientId } = GoogleAuthPlugin.options

    if (!googleClientId) {
      throw new Error('GOOGLE_CLIENT_ID is not configured.')
    }

    config.authOptions.shopAuthenticationStrategy.push(
      new GoogleAuthStrategy(googleClientId),
    )

    return config
  },
})
export class GoogleAuthPlugin {
  static options: GoogleAuthPluginOptions = {
    googleClientId: '',
  }

  static init(options: GoogleAuthPluginOptions) {
    GoogleAuthPlugin.options = options
    return GoogleAuthPlugin
  }
}