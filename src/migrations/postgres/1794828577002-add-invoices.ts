import {MigrationInterface, QueryRunner} from "typeorm";

export class AddInvoices1794828577002 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`CREATE TABLE "invoice" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "channelId" character varying(40) NOT NULL, "orderId" character varying(40) NOT NULL, "orderCode" character varying(64) NOT NULL, "customerId" character varying(40), "customerEmail" character varying(255), "customerName" character varying(255) NOT NULL DEFAULT '', "type" character varying(20) NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'ISSUED', "invoiceNumber" character varying(32) NOT NULL, "sequenceNumber" integer NOT NULL, "financialYear" character varying(9) NOT NULL, "issuedAt" TIMESTAMP NOT NULL, "totalWithTax" integer NOT NULL, "taxTotal" integer NOT NULL, "currencyCode" character varying(3) NOT NULL DEFAULT 'INR', "relatedInvoiceId" character varying(40), "reason" text, "emailedAt" TIMESTAMP, "data" text NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_15d25c200d9bcd8a33f698daf18" PRIMARY KEY ("id"))`, undefined);
        await queryRunner.query(`CREATE INDEX "IDX_f494ce6746b91e9ec9562af485" ON "invoice" ("orderId") `, undefined);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_98203068f9fa9c41bff6fafec5" ON "invoice" ("channelId", "invoiceNumber") `, undefined);
        await queryRunner.query(`CREATE TABLE "invoice_settings" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "channelId" character varying(40) NOT NULL, "enabled" boolean NOT NULL DEFAULT true, "issueOn" character varying(20) NOT NULL DEFAULT 'PAYMENT_SETTLED', "emailCustomer" boolean NOT NULL DEFAULT true, "creditNoteOnCancel" boolean NOT NULL DEFAULT true, "invoicePrefix" character varying(32) NOT NULL DEFAULT 'INV/{FY}/', "invoiceSuffix" character varying(32) NOT NULL DEFAULT '', "invoiceNextNumber" integer NOT NULL DEFAULT '1', "invoiceSequenceYear" character varying(9), "creditNotePrefix" character varying(32) NOT NULL DEFAULT 'CN/{FY}/', "creditNoteSuffix" character varying(32) NOT NULL DEFAULT '', "creditNoteNextNumber" integer NOT NULL DEFAULT '1', "creditNoteSequenceYear" character varying(9), "numberPadding" integer NOT NULL DEFAULT '4', "resetEachFinancialYear" boolean NOT NULL DEFAULT true, "sellerLegalName" character varying(255) NOT NULL DEFAULT '', "sellerTradeName" character varying(255) NOT NULL DEFAULT '', "sellerAddress" text NOT NULL DEFAULT '', "sellerState" character varying(100) NOT NULL DEFAULT 'Gujarat', "sellerGstin" character varying(15) NOT NULL DEFAULT '', "sellerPan" character varying(10) NOT NULL DEFAULT '', "sellerEmail" character varying(255) NOT NULL DEFAULT '', "sellerPhone" character varying(30) NOT NULL DEFAULT '', "logoUrl" character varying(500) NOT NULL DEFAULT '', "shippingSac" character varying(10) NOT NULL DEFAULT '996812', "notes" text NOT NULL DEFAULT '', "footerText" character varying(255) NOT NULL DEFAULT 'This is a computer-generated invoice and does not require a signature.', "signatoryLabel" character varying(100) NOT NULL DEFAULT 'Authorised Signatory', "id" SERIAL NOT NULL, CONSTRAINT "PK_8145b0482e5c77719fe842c1b05" PRIMARY KEY ("id"))`, undefined);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_ff0209c783d7fbb81ec891f054" ON "invoice_settings" ("channelId") `, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`DROP INDEX "public"."IDX_ff0209c783d7fbb81ec891f054"`, undefined);
        await queryRunner.query(`DROP TABLE "invoice_settings"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_98203068f9fa9c41bff6fafec5"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_f494ce6746b91e9ec9562af485"`, undefined);
        await queryRunner.query(`DROP TABLE "invoice"`, undefined);
   }

}
