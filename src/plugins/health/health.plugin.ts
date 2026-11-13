import { VendurePlugin } from '@vendure/core'
import { HealthController } from './health.controller'

@VendurePlugin({
  controllers: [HealthController],
})
export class HealthPlugin {}