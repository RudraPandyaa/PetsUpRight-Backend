import {
  DefaultJobQueuePlugin,
  DefaultSchedulerPlugin,
  DefaultSearchPlugin,
  VendureConfig,
  LanguageCode,
  defaultShippingCalculator,
  defaultShippingEligibilityChecker,
  defaultPromotionActions,
  defaultPromotionConditions,
} from "@vendure/core";
import {
  defaultEmailHandlers,
  EmailPlugin,
  FileBasedTemplateLoader,
} from "@vendure/email-plugin";
import { AssetServerPlugin } from "@vendure/asset-server-plugin";
import { DashboardPlugin } from "@vendure/dashboard/plugin";
import { GraphiqlPlugin } from "@vendure/graphiql-plugin";
import { ProductImportPlugin } from "./plugins/product-import/product-import.plugin";
import { ProductReviewPlugin } from './plugins/product-review/product-review.plugin';
import "dotenv/config";
import path from "path";
import { CloudinaryAssetStorageStrategy } from "./cloudinary/cloudinary-asset-storage.strategy";
import { CmsPlugin } from "./plugins/cms/cms.plugin";
import { razorpayPaymentHandler } from "./plugins/razorpay/razorpay-payment-handler";
import { RazorpayPlugin } from "./plugins/razorpay/razorpay.plugin";
import { json } from 'body-parser';
const IS_DEV = process.env.APP_ENV === "dev";
// PORT wins because hosting platforms inject it into the environment at runtime, and that
// must take precedence over any value baked into the .env file at scaffold time.
const serverPort =
  +process.env.PORT || +process.env.VENDURE_SERVER_PORT || 3000;

export const config: VendureConfig = {
  apiOptions: {
    port: serverPort,
    adminApiPath: "admin-api",
    shopApiPath: "shop-api",
    trustProxy: IS_DEV ? false : 1,
    // The following options are useful in development mode,
    // but are best turned off for production for security
    // reasons.
    middleware: [
        {
            handler: json({ limit: '10mb' }),
            route: '/admin-api',
            beforeListen: true,
        },
    ],

    ...(IS_DEV
      ? {
        adminApiDebug: true,
        shopApiDebug: true,
      }
      : {}),
  },
  authOptions: {
    tokenMethod: ["bearer", "cookie"],
    superadminCredentials: {
      identifier: process.env.SUPERADMIN_USERNAME,
      password: process.env.SUPERADMIN_PASSWORD,
    },
    cookieOptions: {
      secret: process.env.COOKIE_SECRET,
    },
    requireVerification: true,
    verificationTokenDuration: '1h',
  },
  dbConnectionOptions: {
    type: "postgres",
    url: process.env.DATABASE_URL,
    synchronize: false,
    migrations: [path.join(__dirname, "./migrations/*.+(js|ts)")],
    logging: false,
    ssl: true,
    extra: {
      max: 10,
      min: 1,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
  },
  },
  paymentOptions: {
    paymentMethodHandlers: [razorpayPaymentHandler],
  },
  shippingOptions: {
    shippingEligibilityCheckers: [defaultShippingEligibilityChecker],

    shippingCalculators: [defaultShippingCalculator],
  },
  promotionOptions: {
    promotionActions: [...defaultPromotionActions],
    promotionConditions: [...defaultPromotionConditions],
  },
  
  // When adding or altering custom field definitions, the database will
  // need to be updated. See the "Migrations" section in README.md.
    customFields: {
      Product: [
          // Existing fields kept for frontend compatibility
          {
              name: 'petType',
              type: 'string',
              nullable: true,
              label: [
                  {
                      languageCode: LanguageCode.en,
                      value: 'Pet Type (Legacy)',
                  },
              ],
          },
          {
              name: 'isFood',
              type: 'boolean',
              defaultValue: false,
              label: [
                  {
                      languageCode: LanguageCode.en,
                      value: 'Is this a food product?',
                  },
              ],
          },
          {
              name: 'ingredients',
              type: 'text',
              nullable: true,
              label: [
                  {
                      languageCode: LanguageCode.en,
                      value: 'Ingredients',
                  },
              ],
          },
          {
              name: 'usageAndFeeding',
              type: 'text',
              nullable: true,
              label: [
                  {
                      languageCode: LanguageCode.en,
                      value: 'Usage & Feeding',
                  },
              ],
          },
          {
              name: 'specifications',
              type: 'text',
              nullable: true,
              label: [
                  {
                      languageCode: LanguageCode.en,
                      value: 'Specifications',
                  },
              ],
          },

          // New OPN product fields
          {
              name: 'keyPoints',
              type: 'text',
              nullable: true,
              label: [
                  {
                      languageCode: LanguageCode.en,
                      value: 'Key Points',
                  },
              ],
          },
          {
              name: 'analyticalConstituents',
              type: 'text',
              nullable: true,
              label: [
                  {
                      languageCode: LanguageCode.en,
                      value: 'Analytical Constituents',
                  },
              ],
          },
          {
              name: 'countryOfOrigin',
              type: 'string',
              nullable: true,
              label: [
                  {
                      languageCode: LanguageCode.en,
                      value: 'Country of Origin',
                  },
              ],
          },
          {
              name: 'manufacturerName',
              type: 'string',
              nullable: true,
              label: [
                  {
                      languageCode: LanguageCode.en,
                      value: 'Manufacturer',
                  },
              ],
          },
          {
              name: 'manufacturerAddress',
              type: 'text',
              nullable: true,
              label: [
                  {
                      languageCode: LanguageCode.en,
                      value: 'Manufacturer Address',
                  },
              ],
          },
          {
              name: 'supplierName',
              type: 'string',
              nullable: true,
              label: [
                  {
                      languageCode: LanguageCode.en,
                      value: 'Supplier',
                  },
              ],
          },
      ],

      ProductVariant: [
        {
            name: 'itemCode',
            type: 'string',
            nullable: true,
            label: [
                {
                    languageCode: LanguageCode.en,
                    value: 'Client Item Code',
                },
            ],
        },
          {
              name: 'barcode',
              type: 'string',
              nullable: true,
              label: [
                  {
                      languageCode: LanguageCode.en,
                      value: 'Barcode',
                  },
              ],
          },
          {
              name: 'asin',
              type: 'string',
              nullable: true,
              label: [
                  {
                      languageCode: LanguageCode.en,
                      value: 'ASIN',
                  },
              ],
          },
          {
              name: 'unit',
              type: 'string',
              nullable: true,
              label: [
                  {
                      languageCode: LanguageCode.en,
                      value: 'Unit',
                  },
              ],
          },
          {
              name: 'weightInGrams',
              type: 'int',
              nullable: true,
              label: [
                  {
                      languageCode: LanguageCode.en,
                      value: 'Weight in grams',
                  },
              ],
          },
          {
              name: 'packing',
              type: 'string',
              nullable: true,
              label: [
                  {
                      languageCode: LanguageCode.en,
                      value: 'Packing',
                  },
              ],
          },
          {
              name: 'hsnCode',
              type: 'string',
              nullable: true,
              label: [
                  {
                      languageCode: LanguageCode.en,
                      value: 'HSN Code',
                  },
              ],
          },
          {
              name: 'gstPercentage',
              type: 'float',
              nullable: true,
              label: [
                  {
                      languageCode: LanguageCode.en,
                      value: 'GST Percentage',
                  },
              ],
          },
          {
              name: 'casePack',
              type: 'int',
              nullable: true,
              label: [
                  {
                      languageCode: LanguageCode.en,
                      value: 'Case Pack',
                  },
              ],
          },
          {
              name: 'shelfLifeYears',
              type: 'float',
              nullable: true,
              label: [
                  {
                      languageCode: LanguageCode.en,
                      value: 'Shelf Life in years',
                  },
              ],
          },
          {
              name: 'packageLengthCm',
              type: 'float',
              nullable: true,
              label: [
                  {
                      languageCode: LanguageCode.en,
                      value: 'Package length (cm)',
                  },
              ],
          },
          {
              name: 'packageWidthCm',
              type: 'float',
              nullable: true,
              label: [
                  {
                      languageCode: LanguageCode.en,
                      value: 'Package width (cm)',
                  },
              ],
          },
          {
              name: 'packageHeightCm',
              type: 'float',
              nullable: true,
              label: [
                  {
                      languageCode: LanguageCode.en,
                      value: 'Package height (cm)',
                  },
              ],
          },
      ],
  },
  plugins: [
    GraphiqlPlugin.init(),
    AssetServerPlugin.init({
      route: "assets",

      assetUploadDir: path.join(__dirname, "../static/assets"),

      storageStrategyFactory: () => new CloudinaryAssetStorageStrategy(),
    }),
    DefaultSchedulerPlugin.init(),
    DefaultJobQueuePlugin.init({ useDatabaseForBuffer: true }),
    DefaultSearchPlugin.init({ bufferUpdates: false, indexStockStatus: true }),
    EmailPlugin.init({
      route: "mailbox",

      handlers: defaultEmailHandlers,

      templateLoader: new FileBasedTemplateLoader(
        path.join(__dirname, "../static/email/templates"),
      ),

      transport: {
        type: "smtp",
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT),
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
        logging: true,
        debug: true,
      },

      globalTemplateVars: {
        fromAddress: process.env.SMTP_FROM,
        verifyEmailAddressUrl: "http://localhost:3001/verify",
        passwordResetUrl: "http://localhost:3001/reset-password",
        changeEmailAddressUrl:
          "http://localhost:3001/verify-email-address-change",
      },
    }),
    CmsPlugin.init({}),
    ProductImportPlugin.init({
      // Optional; default 3 each. See src/plugins/product-import/constants.ts
      productConcurrency: Number(process.env.IMPORT_PRODUCT_CONCURRENCY) || undefined,
      imageConcurrency: Number(process.env.IMPORT_IMAGE_CONCURRENCY) || undefined,
    }),
    RazorpayPlugin,
    ProductReviewPlugin,
    DashboardPlugin.init({
      route: "dashboard",
      appDir: IS_DEV
        ? path.join(__dirname, "../dist/dashboard")
        : path.join(__dirname, "dashboard"),
    }),
  ],
};
