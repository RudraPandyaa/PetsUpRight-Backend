import {MigrationInterface, QueryRunner} from "typeorm";

export class AddCmsTables1788933024373 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`CREATE TABLE "cms_section" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "type" character varying NOT NULL, "position" integer NOT NULL DEFAULT '0', "data" jsonb NOT NULL, "id" SERIAL NOT NULL, "pageId" integer, CONSTRAINT "PK_711994a51426aa7ee4c0083a586" PRIMARY KEY ("id"))`, undefined);
        await queryRunner.query(`CREATE TABLE "cms_page" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "title" character varying NOT NULL, "slug" character varying NOT NULL, "isPublished" boolean NOT NULL DEFAULT false, "id" SERIAL NOT NULL, CONSTRAINT "UQ_57f1acdeaa5e021ccd8fe6f955d" UNIQUE ("slug"), CONSTRAINT "PK_930fa3419b13beec75cc102b600" PRIMARY KEY ("id"))`, undefined);
        await queryRunner.query(`ALTER TABLE "cms_section" ADD CONSTRAINT "FK_3c8bf86b1a2e14301da284ea545" FOREIGN KEY ("pageId") REFERENCES "cms_page"("id") ON DELETE CASCADE ON UPDATE NO ACTION`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "cms_section" DROP CONSTRAINT "FK_3c8bf86b1a2e14301da284ea545"`, undefined);
        await queryRunner.query(`DROP TABLE "cms_page"`, undefined);
        await queryRunner.query(`DROP TABLE "cms_section"`, undefined);
   }

}
