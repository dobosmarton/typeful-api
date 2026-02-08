#!/usr/bin/env node

import { cac } from 'cac';
import { generateSpecCommand } from './commands/generate-spec';
import { generateClientCommand } from './commands/generate-client';
import { initCommand } from './commands/init';

const cli = cac('typi');

cli
  .command('generate-spec', 'Generate OpenAPI spec from API contract')
  .option('-c, --contract <path>', 'Path to the contract file', {
    default: './src/api.ts',
  })
  .option('-o, --out <path>', 'Output path for the OpenAPI spec', {
    default: './openapi.json',
  })
  .option('--title <title>', 'API title', { default: 'API' })
  .option('--api-version <version>', 'API version', { default: '1.0.0' })
  .option('--description <description>', 'API description')
  .option('--server <url>', 'Server URL (can be specified multiple times)')
  .option('--pretty', 'Pretty print the output', { default: true })
  .option('--watch', 'Watch for changes and regenerate')
  .action(generateSpecCommand);

cli
  .command('generate-client', 'Generate TypeScript client types from OpenAPI spec')
  .option('-s, --spec <path>', 'Path to the OpenAPI spec file', {
    default: './openapi.json',
  })
  .option('-o, --out <path>', 'Output path for TypeScript types', {
    default: './src/client.d.ts',
  })
  .option('--watch', 'Watch for changes and regenerate')
  .action(generateClientCommand);

cli
  .command('init', 'Initialize a new typeful-api project')
  .option('--template <template>', 'Project template (hono, express, fastify)', {
    default: 'hono',
  })
  .option('--dir <dir>', 'Target directory', { default: '.' })
  .option('--name <name>', 'Project name')
  .action(initCommand);

cli.help();
cli.version('0.1.0');

cli.parse();
