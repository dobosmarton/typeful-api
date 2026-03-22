#!/usr/bin/env node

import { cac } from 'cac';
import { loadConfig } from './config';
import { generateSpecCommand } from './commands/generate-spec';
import { generateClientCommand } from './commands/generate-client';
import { initCommand } from './commands/init';

const cli = cac('typi');

cli
  .command('generate-spec', 'Generate OpenAPI spec from API contract')
  .option('-c, --contract <path>', 'Path to the contract file')
  .option('-o, --out <path>', 'Output path for the OpenAPI spec')
  .option('--title <title>', 'API title')
  .option('--api-version <version>', 'API version')
  .option('--description <description>', 'API description')
  .option('--server <url>', 'Server URL (can be specified multiple times)')
  .option('--pretty', 'Pretty print the output')
  .option('--watch', 'Watch for changes and regenerate')
  .action(async (cliOptions) => {
    const config = await loadConfig();
    const merged = {
      contract: cliOptions.contract ?? config.spec?.contract ?? './src/api.ts',
      out: cliOptions.out ?? config.spec?.out ?? './openapi.json',
      title: cliOptions.title ?? config.spec?.title ?? 'API',
      apiVersion: cliOptions.apiVersion ?? config.spec?.apiVersion ?? '1.0.0',
      description: cliOptions.description ?? config.spec?.description,
      server: cliOptions.server ?? config.spec?.servers,
      pretty: cliOptions.pretty ?? config.spec?.pretty ?? true,
      watch: cliOptions.watch,
    };
    return generateSpecCommand(merged);
  });

cli
  .command('generate-client', 'Generate TypeScript client types from OpenAPI spec')
  .option('-s, --spec <path>', 'Path to the OpenAPI spec file')
  .option('-o, --out <path>', 'Output path for TypeScript types')
  .option('--watch', 'Watch for changes and regenerate')
  .action(async (cliOptions) => {
    const config = await loadConfig();
    const merged = {
      spec: cliOptions.spec ?? config.client?.spec ?? './openapi.json',
      out: cliOptions.out ?? config.client?.out ?? './src/client.d.ts',
      watch: cliOptions.watch,
    };
    return generateClientCommand(merged);
  });

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
