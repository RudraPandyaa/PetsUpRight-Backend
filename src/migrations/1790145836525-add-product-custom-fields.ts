import {MigrationInterface, QueryRunner} from "typeorm";

export class AddProductCustomFields1790145836525 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "product" ADD "customFieldsIsfood" boolean DEFAULT false`, undefined);
        await queryRunner.query(`ALTER TABLE "product" ADD "customFieldsIngredients" text`, undefined);
        await queryRunner.query(`ALTER TABLE "product" ADD "customFieldsUsageandfeeding" text`, undefined);
        await queryRunner.query(`ALTER TABLE "product" ADD "customFieldsSpecifications" text`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "customFieldsSpecifications"`, undefined);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "customFieldsUsageandfeeding"`, undefined);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "customFieldsIngredients"`, undefined);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "customFieldsIsfood"`, undefined);
   }

}
