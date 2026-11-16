import {MigrationInterface, QueryRunner} from "typeorm";

export class AddOrderEmailSettings1794830426972 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`CREATE TABLE "order_email_settings" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "channelId" character varying(40) NOT NULL, "adminEmails" character varying(500) NOT NULL DEFAULT 'orders.petsupright@gmail.com', "supportEmail" character varying(255) NOT NULL DEFAULT 'orders.petsupright@gmail.com', "supportPhone" character varying(30) NOT NULL DEFAULT '', "customerOrderReceived" boolean NOT NULL DEFAULT true, "customerOrderConfirmed" boolean NOT NULL DEFAULT true, "customerShipped" boolean NOT NULL DEFAULT true, "customerOutForDelivery" boolean NOT NULL DEFAULT true, "customerDelivered" boolean NOT NULL DEFAULT true, "customerCancelled" boolean NOT NULL DEFAULT true, "adminNewOrder" boolean NOT NULL DEFAULT true, "adminFulfilled" boolean NOT NULL DEFAULT true, "adminShipped" boolean NOT NULL DEFAULT true, "adminDelivered" boolean NOT NULL DEFAULT true, "adminCancelled" boolean NOT NULL DEFAULT true, "id" SERIAL NOT NULL, CONSTRAINT "PK_6edac32e9877df7111e3f165c58" PRIMARY KEY ("id"))`, undefined);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_53a49176df2418f9a214064e29" ON "order_email_settings" ("channelId") `, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`DROP INDEX "public"."IDX_53a49176df2418f9a214064e29"`, undefined);
        await queryRunner.query(`DROP TABLE "order_email_settings"`, undefined);
   }

}
