import { bootstrap, JobQueueService, runMigrations } from '@vendure/core';
import { config } from './vendure-config';

runMigrations(config)
  .then(() => bootstrap(config))
  .then(app => app.get(JobQueueService).start())
  .catch(err => {
    console.error(err);
    process.exit(1);
  });