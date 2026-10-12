/**
 * Generates a migration from the difference between the Vendure config
 * (entities and custom fields) and the database in DATABASE_URL.
 * Uses the compiled config, so run `npx tsc` first:
 *
 *   npx tsc && node scripts/generate-migration.js <name>
 *
 * The database (and so the migrations folder) comes from DATABASE_URL; set
 * it in the environment to generate for another database than in .env.
 */
const path = require('path');
const { generateMigration } = require('@vendure/core');
const { config } = require('../dist/vendure-config');

const name = process.argv[2];

if (!name) {
    console.error('Usage: node scripts/generate-migration.js <name>');
    process.exit(1);
}

generateMigration(config, {
    name,
    // src/migrations/mysql or src/migrations/postgres, by DATABASE_URL
    outputDir: path.join(
        __dirname,
        '../src/migrations',
        config.dbConnectionOptions.type === 'postgres' ? 'postgres' : 'mysql',
    ),
})
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
