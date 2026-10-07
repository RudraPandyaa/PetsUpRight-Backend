import {MigrationInterface, QueryRunner} from "typeorm";

export class AddOpnVariantItemCode1791372530935 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "product_variant" ADD "customFieldsItemcode" character varying(255)`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "product_variant" DROP COLUMN "customFieldsItemcode"`, undefined);
   }

}
