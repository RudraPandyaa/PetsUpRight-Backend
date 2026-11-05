import {MigrationInterface, QueryRunner} from "typeorm";

export class AddShippingWeightGrams1793878012881 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "product_variant" ADD "customFieldsShippingweightgrams" integer`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "product_variant" DROP COLUMN "customFieldsShippingweightgrams"`, undefined);
   }

}
