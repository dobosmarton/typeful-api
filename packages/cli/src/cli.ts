#!/usr/bin/env node

import { cac } from 'cac';
import pc from 'picocolors';
import { loadConfig } from './config';
import { generateSpecCommand } from './commands/generate-spec';
import { generateClientCommand } from './commands/generate-client';
import { initCommand } from './commands/init';
import { CLI_VERSION } from './version';

const cli = cac('typeful-api');

/**
 * Parse repeatable `--header "Name: value"` flags
 */
function parseHeaders(raw: string | string[] | undefined): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const entry of raw === undefined ? [] : [raw].flat()) {
    const separator = entry.indexOf(':');
    if (separator <= 0) {
      console.error(pc.red(`Invalid --header "${entry}". Use "Name: value".`));
      process.exit(1);
    }
    headers[entry.slice(0, separator).trim()] = entry.slice(separator + 1).trim();
  }
  return headers;
}

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
  .command('generate-client', 'Generate a typed client (.ts) or types (.d.ts) from an OpenAPI spec')
  .option('-s, --spec <path>', 'OpenAPI spec file or URL, e.g. https://orders.internal/api/api-doc')
  .option('-o, --out <path>', 'Output file: .ts for a typed client module, .d.ts for types only')
  .option('--header <header>', 'Header for fetching a spec URL, "Name: value" (repeatable)')
  .option('--watch', 'Watch a local spec file and regenerate')
  .action(async (cliOptions) => {
    const config = await loadConfig();
    const headers = parseHeaders(cliOptions.header);

    // Without --spec/--out, generate every client listed in the config file
    if (Array.isArray(config.client) && !cliOptions.spec && !cliOptions.out) {
      for (const client of config.client) {
        await generateClientCommand({
          spec: client.spec ?? './openapi.json',
          out: client.out ?? './src/client.d.ts',
          headers: { ...client.headers, ...headers },
        });
      }
      return;
    }

    const client = Array.isArray(config.client) ? {} : (config.client ?? {});
    return generateClientCommand({
      spec: cliOptions.spec ?? client.spec ?? './openapi.json',
      out: cliOptions.out ?? client.out ?? './src/client.d.ts',
      headers: { ...client.headers, ...headers },
      watch: cliOptions.watch,
    });
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
cli.version(CLI_VERSION);

try {
  cli.parse();
} catch (error) {
  // cac throws CACError synchronously for usage mistakes (e.g. unused positional args)
  if (!(error instanceof Error) || error.name !== 'CACError') throw error;
  console.error(pc.red(error.message));
  console.error(pc.gray('  Run with --help to see available options'));
  process.exit(1);
}
