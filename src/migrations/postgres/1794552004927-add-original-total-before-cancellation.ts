import {MigrationInterface, QueryRunner} from "typeorm";

export class AddOriginalTotalBeforeCancellation1794552004927 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "order" ADD "customFieldsOriginaltotalbeforecancellation" integer`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "customFieldsOriginaltotalbeforecancellation"`, undefined);
   }

}
