import {MigrationInterface, QueryRunner} from "typeorm";

export class AddShiprocketFulfillmentFields1793963671974 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "fulfillment" ADD "customFieldsShiprocketorderid" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "fulfillment" ADD "customFieldsShiprocketshipmentid" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "fulfillment" ADD "customFieldsShiprocketawbcode" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "fulfillment" ADD "customFieldsShiprocketcouriername" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "fulfillment" ADD "customFieldsShiprocketstatus" character varying(255)`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "fulfillment" DROP COLUMN "customFieldsShiprocketstatus"`, undefined);
        await queryRunner.query(`ALTER TABLE "fulfillment" DROP COLUMN "customFieldsShiprocketcouriername"`, undefined);
        await queryRunner.query(`ALTER TABLE "fulfillment" DROP COLUMN "customFieldsShiprocketawbcode"`, undefined);
        await queryRunner.query(`ALTER TABLE "fulfillment" DROP COLUMN "customFieldsShiprocketshipmentid"`, undefined);
        await queryRunner.query(`ALTER TABLE "fulfillment" DROP COLUMN "customFieldsShiprocketorderid"`, undefined);
   }

}
