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

## Programmatic API

You can also use the CLI as a library:

```typescript
import { generateSpec, generateClient } from '@typeful-api/cli';

// Generate OpenAPI spec
await generateSpec({
  contract: './src/api.ts',
  out: './openapi.json',
  title: 'My API',
  apiVersion: '1.0.0',
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
