# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-11-04

### Added

- **@typeful-api/core**: Typed client at `@typeful-api/core/client`. `createClient(contract, { baseUrl })` mirrors the contract, and each route returns `{ status, body, headers }` narrowed by status, including the 401/422 problems the adapters send. Also `unwrap()`, `ResponseError`, `UnexpectedResponseError`, `ResponseValidationError` and an optional `validateResponse`
- **@typeful-api/cli**: `generate-client` creates typed clients for services in other repositories. `--spec` accepts a URL such as another service's `/api-doc` (with `--header` for protected documents), and a `.ts` output is a client module (`createApiClient()`) with the same calls and status narrowing as the contract client. The config file accepts a list of clients, one per service
- **@typeful-api/core**: `createSpecClient()`, the runtime used by generated client modules
- **@typeful-api/core**, **@typeful-api/hono**: Every operation in generated OpenAPI documents carries an `x-typeful-route` extension with its position in the contract
- **@typeful-api/core**: `HttpError`: throw it from handlers or middleware and every adapter sends an RFC 9457 Problem Details response
- **@typeful-api/core**: `problemSchema(status, code, extension?)` for custom problem types, plus `createProblem()`, `problemResponse()` and `PROBLEM_CONTENT_TYPE`
- **@typeful-api/core**: Routes keep their literal method, path, auth type and declared status codes at the type level; new `InferBodyInput`, `InferQueryInput`, `InferParamsInput` and `HandlerResult` types
- **@typeful-api/core**: Generated OpenAPI documents declare the `422` (routes with input) and `401` (routes with auth) problem responses the adapters send
- **@typeful-api/hono**, **@typeful-api/fastify**: `onValidationError` option to replace the validation error response (Express already had one)
- **@typeful-api/express**: `problemErrorHandler()` for app-level errors such as malformed JSON and oversized bodies
- **@typeful-api/hono**, **@typeful-api/express**, **@typeful-api/fastify**: Auth verifiers may throw an `HttpError` (for example a 403) to send it as is, and 401 responses carry a `WWW-Authenticate` challenge
- **@typeful-api/hono**, **@typeful-api/express**, **@typeful-api/fastify**: `HttpError` is re-exported from each adapter
- Docs: [Calling services from other repositories](docs/sharing-contracts.md), [Migrating from ts-rest](docs/migrating-from-ts-rest.md), and an oRPC column in the README comparison

### Changed

- **Breaking:** All adapters send errors as RFC 9457 Problem Details (`application/problem+json`): `{ type, title, status, detail?, instance?, code, errors? }`
- **Breaking:** **@typeful-api/hono**: Invalid requests return `422` (was `400` with a serialized `ZodError`), like Express and Fastify
- **Breaking:** **@typeful-api/core**: `errorSchema()` is removed in favor of `problemSchema()`. The built-in error schemas (`notFoundError()` and friends) describe Problem Details bodies; `unprocessableError()` uses the code `VALIDATION_FAILED`, and `badRequestError()`'s `details` became `errors`
- **Breaking:** **@typeful-api/express**: `ValidationError` is the core type: `errors[].path` may contain numbers, and it carries the `problem` that is sent by default
- **Breaking:** **@typeful-api/fastify**: The `errorHandler` option no longer receives `HttpError`s or body parsing errors, which are sent as problems. Without the option, errors go to the error handler of the instance the plugin is registered on. The peer dependency is now `fastify >=5.0.0`
- **@typeful-api/express**, **@typeful-api/fastify**: Request validation runs on the query, then params, then body (the same order as Hono)
- **@typeful-api/core**: `paginationQuery()` and `cursorQuery()` use `z.coerce.number<number>()`, so their input types are numbers instead of `unknown`
- **@typeful-api/core**: The package is marked side-effect free, and the adapters and CLI depend on a `^` range of it instead of an exact version
- **@typeful-api/cli**: `generate-client` with a `.ts` output now writes a client module; use a `.d.ts` output (the default) for types only
- **@typeful-api/core**: `unwrap()` returns the body of any 2xx response
- OpenAPI error responses use the `application/problem+json` media type and RFC 9110 status texts (`422 Unprocessable Content`)

### Fixed

- **@typeful-api/core**: Generated OpenAPI documents describe request parameters and bodies as clients send them: fields with defaults (such as `paginationQuery()`'s `page` and `limit`) are no longer marked required
- **@typeful-api/hono**: `/api-doc` uses OpenAPI path templates (`/items/{id}`) instead of `/items/:id`
- **@typeful-api/core**: Contracts exported from packages built with declarations no longer fail with "cannot be named" errors (`FinalRoute` and the route state types are exported)
- **@typeful-api/core**: Handlers can return `withHeaders()` values without a type error
- **@typeful-api/express**, **@typeful-api/fastify**: Async refinements in request schemas work (they used to end in a 500)
- **@typeful-api/fastify**: The `prefix` option is applied (it was ignored)
- **@typeful-api/cli**: `generate-spec --watch` regenerates on change (it threw in the ESM build), and both watch modes pick up editors that save by replacing the file
- **@typeful-api/cli**: The README no longer claims YAML support for `generate-client --spec`

### Migrating from 0.2

- Error bodies change shape. A 404 that used to be `{ "code": "NOT_FOUND", "message": "..." }` is now `{ "type": "about:blank", "title": "Not Found", "status": 404, "code": "NOT_FOUND", "detail": "..." }`. Validation errors list their problems in `errors: [{ location, path, message }]`.
- Hono: clients that expect `400` for invalid requests now get `422`. To keep a different response, pass `onValidationError`.
- Replace `errorSchema('CODE', 'Message')` with `problemSchema(status, 'CODE')`.
- Throw `new HttpError(404, 'Not found')` for expected errors instead of `new Error(...)` (which ends in a 500) or Hono's `HTTPException` (which is still converted when it has no custom response).
- Express: add `app.use(problemErrorHandler())` after your routes so malformed JSON returns a problem.
- Fastify: move validation handling from `errorHandler` to `onValidationError`, and upgrade to Fastify 5 if you are on 4.

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
