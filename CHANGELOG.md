# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-11-02

### Added

- **@typeful-api/core**: Auth enforcement — `AuthConfig` with pluggable verify functions for `bearer`, `apiKey` and `basic`; routes declared with `.withAuth()` are protected when the adapter receives an `auth` option
- **@typeful-api/core**: Pagination and error helpers: `paginationQuery()`, `paginated()`, `notFoundError()` and `.withErrors()`
- **@typeful-api/core**: `.withExamples()` and `.withResponseHeaders()` on the route builder, `withHeaders()` for returning headers from handlers, and an `openapiVersion` option (`'3.0' | '3.1'`) for spec generation
- **@typeful-api/cli**: Config file support (`typeful.config.ts`, `.js`, `.mjs`, `.json`) with a `defineConfig()` helper
- **@typeful-api/cli**: `init` command scaffolding Hono, Express or Fastify projects

### Changed

- **@typeful-api/hono**: Peer dependency raised to `hono >=4.10.0` (required by `@hono/zod-openapi` 1.6)
- **@typeful-api/cli**: Requires Node.js >=20.19 (`cac` 7 is ESM-only); unused positional arguments now fail with a usage error instead of being ignored
- All dependencies upgraded to their latest versions; the repository targets Node.js 26 LTS

### Fixed

- **@typeful-api/hono**: Per-group environment mapping mode of `createHonoRouter` now type-checks, including version-level routes
- **@typeful-api/hono**: Route auth no longer applies to other HTTP methods registered on the same path
- **@typeful-api/fastify**: Authenticated user is stored with `mergeLocals` so existing locals are preserved
- **@typeful-api/cli**: `--version` reports the real package version, and `init` pins `@typeful-api/*` packages to it
- **@typeful-api/cli**: Projects created by `init` install with pnpm 11+ (esbuild build approval) and type-check under TypeScript 6

## [0.1.0] - 2026-02-06

### Added

- **@typeful-api/core**: Route builder API with fluent `.get()`, `.post()`, `.body()`, `.params()`, `.query()`, `.returns()` chain
- **@typeful-api/core**: `defineApi()` for declaring versioned, hierarchical API contracts with Zod schemas
- **@typeful-api/core**: `generateSpec()` for contract-based OpenAPI 3.0 spec generation
- **@typeful-api/core**: Full type inference for handlers via `InferHandlers`, `InferGroupHandlers`, `HandlerFn`
- **@typeful-api/hono**: `createHonoRouter()` with three modes — simple, shared variables, and per-group environment mapping
- **@typeful-api/hono**: `InferHonoHandlersWithVars` for deriving handler types from contracts (supports separate handler files)
- **@typeful-api/hono**: Middleware helpers: `composeMiddleware`, `createTypedMiddleware`, `createVariableMiddleware`
- **@typeful-api/express**: `createExpressRouter()` with automatic Zod request validation
- **@typeful-api/express**: `InferExpressHandlers` for type-safe Express handler inference
- **@typeful-api/fastify**: `createFastifyPlugin()` with preHandler validation hooks
- **@typeful-api/fastify**: `InferFastifyHandlers` for type-safe Fastify handler inference
- **@typeful-api/cli**: `generate-spec` command to generate OpenAPI specs from contract files
- **@typeful-api/cli**: `generate-client` command to generate TypeScript client types from OpenAPI specs
- Authentication support via `.withAuth('bearer' | 'apiKey' | 'basic')` with OpenAPI security scheme generation
- Hierarchical middleware at version, group, and route levels
- First-class API versioning (v1, v2, etc.) built into the contract structure
- Example projects for Hono + Node.js, Hono + Bun, Hono + Cloudflare Workers, Hono + Docker, and a fullstack monorepo
