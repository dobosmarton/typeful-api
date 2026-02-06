# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
