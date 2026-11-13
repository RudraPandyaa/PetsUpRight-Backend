import {MigrationInterface, QueryRunner} from "typeorm";

export class AddOpnCatalogCustomFields1791285538418 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "product" ADD "customFieldsKeypoints" text`, undefined);
        await queryRunner.query(`ALTER TABLE "product" ADD "customFieldsAnalyticalconstituents" text`, undefined);
        await queryRunner.query(`ALTER TABLE "product" ADD "customFieldsCountryoforigin" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "product" ADD "customFieldsManufacturername" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "product" ADD "customFieldsManufactureraddress" text`, undefined);
        await queryRunner.query(`ALTER TABLE "product" ADD "customFieldsSuppliername" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" ADD "customFieldsBarcode" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" ADD "customFieldsAsin" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" ADD "customFieldsUnit" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" ADD "customFieldsWeightingrams" integer`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" ADD "customFieldsPacking" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" ADD "customFieldsHsncode" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" ADD "customFieldsGstpercentage" double precision`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" ADD "customFieldsCasepack" integer`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" ADD "customFieldsShelflifeyears" double precision`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" ADD "customFieldsPackagelengthcm" double precision`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" ADD "customFieldsPackagewidthcm" double precision`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" ADD "customFieldsPackageheightcm" double precision`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "product_variant" DROP COLUMN "customFieldsPackageheightcm"`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" DROP COLUMN "customFieldsPackagewidthcm"`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" DROP COLUMN "customFieldsPackagelengthcm"`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" DROP COLUMN "customFieldsShelflifeyears"`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" DROP COLUMN "customFieldsCasepack"`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" DROP COLUMN "customFieldsGstpercentage"`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" DROP COLUMN "customFieldsHsncode"`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" DROP COLUMN "customFieldsPacking"`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" DROP COLUMN "customFieldsWeightingrams"`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" DROP COLUMN "customFieldsUnit"`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" DROP COLUMN "customFieldsAsin"`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" DROP COLUMN "customFieldsBarcode"`, undefined);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "customFieldsSuppliername"`, undefined);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "customFieldsManufactureraddress"`, undefined);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "customFieldsManufacturername"`, undefined);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "customFieldsCountryoforigin"`, undefined);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "customFieldsAnalyticalconstituents"`, undefined);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "customFieldsKeypoints"`, undefined);
   }

}
