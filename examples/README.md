# Examples

Each example is a complete project you can run. They use the packages from this repository, so build those first, at the repository root:

```bash
pnpm install
pnpm --filter './packages/*' build
```

| Example                                  | Stack                           | Shows                                                                                       |
| ---------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------- |
| [hono-node](hono-node)                   | Hono, Node.js                   | Handlers in separate files, typed from the contract                                         |
| [hono-bun](hono-bun)                     | Hono, Bun                       | Running on Bun                                                                              |
| [hono-cloudflare](hono-cloudflare)       | Hono, Cloudflare Workers        | Worker bindings and per-group environment types                                             |
| [hono-docker](hono-docker)               | Hono, Node.js, Docker           | A production container build                                                                |
| [hono-helpers](hono-helpers)             | Hono, Node.js                   | Pagination, sorting and cursor helpers, custom Problem Details types                        |
| [express-crud](express-crud)             | Express                         | CRUD routes, Problem Details errors, and a typed client script (`pnpm demo:client`)         |
| [fastify-auth](fastify-auth)             | Fastify                         | Bearer auth enforced from the contract: 401 without a token, 403 for read-only tokens       |
| [fullstack-monorepo](fullstack-monorepo) | Hono API, React, TanStack Query | A contract package shared by API and web app; the web app uses the typed client, no codegen |
| [microservices](microservices)           | Hono service, Express service   | Calling a service from another repository through a client generated from its `/api-doc`    |

## Which one to start from

- **An API, nothing else:** pick the adapter you use: [hono-node](hono-node), [express-crud](express-crud) or [fastify-auth](fastify-auth).
- **Frontend and API in one repository:** [fullstack-monorepo](fullstack-monorepo).
- **Services in separate repositories:** [microservices](microservices).
- **A specific runtime:** [hono-bun](hono-bun), [hono-cloudflare](hono-cloudflare) or [hono-docker](hono-docker).
