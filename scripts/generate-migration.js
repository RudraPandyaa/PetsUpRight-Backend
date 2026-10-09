/**
 * Generates a migration from the difference between the Vendure config
 * (entities and custom fields) and the database in DATABASE_URL.
 * Uses the compiled config, so run `npx tsc` first:
 *
 *   npx tsc && node scripts/generate-migration.js <name>
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
    outputDir: path.join(__dirname, '../src/migrations'),
})
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
