import {MigrationInterface, QueryRunner} from "typeorm";

export class AddProductReviews1790150255209 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`CREATE TABLE "product_review" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "rating" integer NOT NULL, "title" character varying(120) NOT NULL, "body" text NOT NULL, "customerName" character varying(150) NOT NULL, "verifiedPurchase" boolean NOT NULL DEFAULT false, "status" character varying(20) NOT NULL DEFAULT 'PENDING', "isFeatured" boolean NOT NULL DEFAULT false, "displayOrder" integer NOT NULL DEFAULT '0', "id" SERIAL NOT NULL, "productId" integer NOT NULL, "customerId" integer NOT NULL, CONSTRAINT "PK_6c00bd3bbee662e1f7a97dbce9a" PRIMARY KEY ("id"))`, undefined);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_7718cdf1b2a9d653c06035730a" ON "product_review" ("productId", "customerId") `, undefined);
        await queryRunner.query(`ALTER TABLE "product_review" ADD CONSTRAINT "FK_06e7335708b5e7870f1eaa608d2" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE NO ACTION`, undefined);
        await queryRunner.query(`ALTER TABLE "product_review" ADD CONSTRAINT "FK_73994c5bf5e1fa155b6f5237ea2" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE NO ACTION`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "product_review" DROP CONSTRAINT "FK_73994c5bf5e1fa155b6f5237ea2"`, undefined);
        await queryRunner.query(`ALTER TABLE "product_review" DROP CONSTRAINT "FK_06e7335708b5e7870f1eaa608d2"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_7718cdf1b2a9d653c06035730a"`, undefined);
        await queryRunner.query(`DROP TABLE "product_review"`, undefined);
   }

}
