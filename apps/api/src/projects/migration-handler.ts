import type { Handler } from 'aws-lambda';
import { runCategoryProjectMigration } from './migration-service.js';

export const handler: Handler<{ ownerIds?: string[] }> = async (event) =>
  runCategoryProjectMigration(event.ownerIds ?? []);
