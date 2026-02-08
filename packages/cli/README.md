# @typeful-api/cli

[![npm version](https://img.shields.io/npm/v/@typeful-api/cli.svg)](https://www.npmjs.com/package/@typeful-api/cli)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

CLI for generating OpenAPI specs and TypeScript client types from [typeful-api](https://github.com/dobosmarton/typeful-api) contracts.

## Installation

```bash
npm install -D @typeful-api/cli
```

## Commands

### Init — Scaffold a New Project

Create a new typeful-api project from a template:

```bash
typeful-api init --template hono
typeful-api init --template express --dir ./my-api
typeful-api init --template fastify --name my-fastify-api
```

**Options:**

| Flag                                  | Description                          |
| ------------------------------------- | ------------------------------------ |
| `--template <hono\|express\|fastify>` | Framework template (default: `hono`) |
| `--dir <path>`                        | Target directory (default: `.`)      |
| `--name <string>`                     | Project name (defaults to dir name)  |

The generated project includes:

- `package.json` with the correct framework dependencies
- `tsconfig.json` with strict TypeScript configuration
- `src/api.ts` — typed API contract showcasing pagination and error helpers
- `src/index.ts` — framework-specific server entry point
- `.gitignore`

After scaffolding, run `pnpm install && pnpm dev` to start developing.

### Generate OpenAPI Spec

Generate an OpenAPI 3.0 spec from your API contract:

```bash
typeful-api generate-spec \
  --contract ./src/api.ts \
  --out ./openapi.json \
  --title "My API" \
  --api-version "1.0.0"
```

**Options:**

| Flag                     | Description                                             |
| ------------------------ | ------------------------------------------------------- |
| `--contract <path>`      | Path to the TypeScript file exporting your API contract |
| `--out <path>`           | Output path for the generated spec                      |
| `--title <string>`       | API title in the spec                                   |
| `--api-version <string>` | API version in the spec                                 |
| `--description <string>` | API description                                         |
| `--server <url>`         | Server URL to include in the spec                       |
| `--watch`                | Watch for changes and regenerate                        |

### Generate Client Types

Generate TypeScript client types from an OpenAPI spec:

```bash
typeful-api generate-client \
  --spec ./openapi.json \
  --out ./src/client.d.ts
```

**Options:**

| Flag            | Description                             |
| --------------- | --------------------------------------- |
| `--spec <path>` | Path to the OpenAPI spec (JSON or YAML) |
| `--out <path>`  | Output path for the generated types     |
| `--watch`       | Watch for changes and regenerate        |

## Programmatic API

You can also use the CLI as a library:

```typescript
import { generateSpec, generateClient } from '@typeful-api/cli';
import { api } from './api';

// Generate OpenAPI spec
await generateSpec({
  contract: api,
  out: './openapi.json',
  title: 'My API',
  version: '1.0.0',
});

// Generate TypeScript client types
await generateClient({
  spec: './openapi.json',
  out: './src/client.d.ts',
});
```

## Watch Mode

Use `--watch` during development to regenerate the spec automatically when your contract changes:

```bash
typeful-api generate-spec \
  --contract ./src/api.ts \
  --out ./openapi.json \
  --title "My API" \
  --api-version "1.0.0" \
  --watch
```

## Documentation

For full documentation, examples, and guides, visit the [typeful-api repository](https://github.com/dobosmarton/typeful-api).

## License

MIT
