import {MigrationInterface, QueryRunner} from "typeorm";

export class AddDeliverablePincodes1791544708006 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query("CREATE TABLE `deliverable_pincode` (`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), `code` varchar(10) NOT NULL, `area` varchar(255) NULL, `id` int NOT NULL AUTO_INCREMENT, UNIQUE INDEX `IDX_9c1be9ee408f3eccf5aa6f55b3` (`code`), PRIMARY KEY (`id`)) ENGINE=InnoDB", undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query("DROP INDEX `IDX_9c1be9ee408f3eccf5aa6f55b3` ON `deliverable_pincode`", undefined);
        await queryRunner.query("DROP TABLE `deliverable_pincode`", undefined);
   }

}
