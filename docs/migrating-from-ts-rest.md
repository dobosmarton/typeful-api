# Migrating from ts-rest

ts-rest was archived in October 2026 and no longer receives releases, bug fixes or security updates. typeful-api keeps the parts ts-rest users rely on and changes a few things. This guide maps one to the other.

## What stays the same

- **Contract-first with Zod.** The contract is a plain object built from Zod schemas, shared by the server and the client.
- **REST.** Every route is an HTTP method and a path. The OpenAPI document describes real endpoints.
- **A typed fetch client.** `{ params, query, body }` goes in and `{ status, body, headers }` comes out, narrowed by status, with no code generation.
- **Express and Fastify support,** plus Hono, which also covers Next.js, Bun, Deno and Cloudflare Workers.

What you gain: first-class API versioning, hierarchical middleware, and RFC 9457 Problem Details for every error.

## Install

```bash
pnpm remove @ts-rest/core @ts-rest/express @ts-rest/fastify @ts-rest/open-api @ts-rest/react-query
pnpm add @typeful-api/core zod

# The adapter for your server
pnpm add @typeful-api/express   # or @typeful-api/fastify, or @typeful-api/hono hono @hono/zod-openapi
```

## Contract

**ts-rest**

```typescript
import { initContract } from '@ts-rest/core';

const c = initContract();

export const contract = c.router(
  {
    getPost: {
      method: 'GET',
      path: '/posts/:id',
      pathParams: z.object({ id: z.string() }),
      responses: { 200: PostSchema, 404: c.type<{ message: string }>() },
      summary: 'Get a post',
    },
    listPosts: {
      method: 'GET',
      path: '/posts',
      query: z.object({ page: z.coerce.number().default(1) }),
      responses: { 200: z.array(PostSchema) },
    },
    createPost: {
      method: 'POST',
      path: '/posts',
      body: CreatePostSchema,
      responses: { 201: PostSchema },
    },
  },
  { pathPrefix: '/v1', strictStatusCodes: true },
);
```

**typeful-api**

```typescript
import { defineApi, route } from '@typeful-api/core';

export const api = defineApi({
  v1: {
    children: {
      posts: {
        routes: {
          get: route
            .get('/:id')
            .params(z.object({ id: z.string() }))
            .returns(PostSchema)
            .withErrors(404)
            .withSummary('Get a post'),
          list: route
            .get('/')
            .query(z.object({ page: z.coerce.number<number>().default(1) }))
            .returns(z.array(PostSchema)),
          create: route.post('/').body(CreatePostSchema).returns(PostSchema),
        },
      },
    },
  },
});
```

| ts-rest                                  | typeful-api                                                          |
| ---------------------------------------- | -------------------------------------------------------------------- |
| `c.router({ ... })`                      | `defineApi({ v1: { children: { group: { routes: { ... } } } } })`    |
| `pathPrefix: '/v1'`                      | The top-level key (`v1`) is the first path segment                   |
| `method: 'GET', path: '/posts/:id'`      | `route.get('/:id')` inside the `posts` group                         |
| `pathParams` / `query` / `body`          | `.params()` / `.query()` / `.body()`                                 |
| `responses: { 200: S }`                  | `.returns(S)`                                                        |
| `responses: { 404: E }`                  | `.withErrors(404)` (Problem Details) or `.withResponses({ 404: E })` |
| `summary` / `description` / `deprecated` | `.withSummary()` / `.withDescription()` / `.markDeprecated()`        |
| `metadata`, `c.type<T>()`                | No equivalent: describe every body with a Zod schema                 |
| `strictStatusCodes: true`                | Always on: undeclared statuses throw on the client                   |

Group names become path segments, so `posts.get` is served at `GET /v1/posts/:id`. If your URLs don't fit `/{version}/{group}/...`, put routes directly on the top-level key (`v1: { routes: { ... } }`) and spell out the full path in each route.

## Server

**ts-rest (Express)**

```typescript
import { createExpressEndpoints, initServer } from '@ts-rest/express';

const s = initServer();
const router = s.router(contract, {
  getPost: async ({ params }) => {
    const post = await db.posts.find(params.id);
    if (!post) return { status: 404, body: { message: 'Post not found' } };
    return { status: 200, body: post };
  },
  // ...
});

createExpressEndpoints(contract, router, app, {
  requestValidationErrorHandler: (err, req, res) => res.status(400).json(err),
});
```

**typeful-api (Express)**

```typescript
import { HttpError, createExpressRouter, problemErrorHandler } from '@typeful-api/express';

const router = createExpressRouter(api, {
  v1: {
    posts: {
      get: async ({ params }) => {
        const post = await db.posts.find(params.id);
        if (!post) throw new HttpError(404, 'Post not found');
        return post;
      },
      // ...
    },
  },
});

app.use(express.json());
app.use(router);
app.use(problemErrorHandler());
```

Handlers return the 200 body directly and throw `HttpError` for anything else. Invalid requests are answered with a `422` problem before the handler runs. Pass `onValidationError` to change that response, as `requestValidationErrorHandler` did.

| ts-rest                                         | typeful-api                                                                   |
| ----------------------------------------------- | ----------------------------------------------------------------------------- |
| `createExpressEndpoints(contract, router, app)` | `app.use(createExpressRouter(api, handlers))`                                 |
| `app.register(s.plugin(router))` (Fastify)      | `app.register(createFastifyPlugin(api, handlers))`                            |
| `return { status: 200, body }`                  | `return body`                                                                 |
| `return { status: 404, body }`                  | `throw new HttpError(404, 'Not found')`                                       |
| `requestValidationErrorHandler`                 | `onValidationError`                                                           |
| Next.js route handlers                          | Mount the Hono router with `hono/vercel`: `export const GET = handle(router)` |
| NestJS                                          | Not supported                                                                 |

## Client

**ts-rest**

```typescript
import { initClient } from '@ts-rest/core';

const client = initClient(contract, {
  baseUrl: 'https://api.example.com',
  baseHeaders: { Authorization: () => `Bearer ${getToken()}` },
});

const result = await client.getPost({ params: { id: '1' } });
if (result.status === 200) console.log(result.body.title);
```

**typeful-api**

```typescript
import { createClient } from '@typeful-api/core/client';

const client = createClient(api, {
  baseUrl: 'https://api.example.com',
  headers: () => ({ Authorization: `Bearer ${getToken()}` }),
});

const result = await client.v1.posts.get({ params: { id: '1' } });
if (result.status === 200) console.log(result.body.title);
if (result.status === 404) console.log(result.body.detail);
```

| ts-rest                       | typeful-api                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| `initClient(contract, opts)`  | `createClient(api, opts)`                                                            |
| `client.getPost(...)`         | `client.v1.posts.get(...)`: the client mirrors the contract tree                     |
| `baseHeaders`                 | `headers` (an object, or a sync or async function)                                   |
| `api` (custom fetcher)        | `fetch`                                                                              |
| `credentials`                 | `fetchOptions: { credentials }`                                                      |
| `validateResponse`            | `validateResponse`                                                                   |
| `jsonQuery`                   | No equivalent: query values are strings, numbers, booleans, Dates or arrays of those |
| Unknown statuses in the union | `UnexpectedResponseError` is thrown                                                  |

Besides the declared statuses, the response union includes `422` for routes with input and `401` for routes with `.withAuth()`, because the adapters send those on their own.

## TanStack Query

Instead of `@ts-rest/react-query`, use TanStack Query directly with `unwrap`, which returns the 200 body and throws a `ResponseError` otherwise:

```typescript
import { queryOptions, useQuery } from '@tanstack/react-query';
import { unwrap } from '@typeful-api/core/client';

const postQuery = (id: string) =>
  queryOptions({
    queryKey: ['posts', id],
    queryFn: ({ signal }) => client.v1.posts.get({ params: { id }, signal }).then(unwrap),
  });

const { data: post } = useQuery(postQuery(id));
```

## OpenAPI

```typescript
// ts-rest
import { generateOpenApi } from '@ts-rest/open-api';
const document = generateOpenApi(contract, { info: { title: 'Posts API', version: '1.0.0' } });

// typeful-api
import { generateSpec } from '@typeful-api/core';
const document = generateSpec(api, { info: { title: 'Posts API', version: '1.0.0' } });
```

Or from the command line: `typeful-api generate-spec --contract ./src/api.ts --out ./openapi.json`. The Express and Fastify adapters also serve the document at `/api-doc`.

## Differences to plan for

- **URLs start with the top-level key.** That is normally a version (`/v1/...`). Keep your current URLs by choosing matching keys and group names, or treat the migration as a good moment to version.
- **Success responses are 200.** A ts-rest route returning `201` returns `200` after the migration. Check clients that test for `201`.
- **JSON only.** There is no equivalent of `c.noBody()`, `c.otherResponse()`, multipart bodies or request header schemas yet.
- **Error bodies change.** Errors are Problem Details objects (`{ type, title, status, code, detail?, errors? }`), so client code that read your old error shape needs updating.
- **Zod only.** ts-rest accepts any Standard Schema library; typeful-api needs Zod 4.
- **No response validation on the server.** Handlers are type-checked against the response schema, but the body is not parsed before it is sent.

## Migrating incrementally

You don't have to move every route at once:

1. Define the typeful-api contract for one group, for example `posts`.
2. Mount the typeful-api router next to the ts-rest endpoints. Express and Fastify match routes in registration order, so register the new router first and remove the ts-rest handlers for those routes.
3. Switch the frontend calls for that group to the typed client.
4. Repeat for the next group, then remove ts-rest.

## Checklist

- [ ] Contract converted, with `.withErrors()` for the error statuses your handlers return
- [ ] Handlers return bodies and throw `HttpError`
- [ ] `problemErrorHandler()` added after the routes (Express)
- [ ] Clients updated for Problem Details error bodies and `200` instead of `201`
- [ ] `initClient` calls replaced with `createClient`
- [ ] OpenAPI generation switched to `generateSpec` or the CLI
- [ ] `@ts-rest/*` packages removed
