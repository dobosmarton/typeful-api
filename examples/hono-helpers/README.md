# Hono Helpers

A small blog API (articles and comments) on Hono and Node.js that uses the pagination, sorting and Problem Details helpers from `@typeful-api/core`. Use it as a reference for list endpoints and for custom error types.

## What it demonstrates

- Offset pagination with sorting on `GET /v1/articles`: `paginationQuery({ maxLimit: 50 }).merge(sortQuery(['title', 'createdAt'] as const))` for the query and `paginated(ArticleSchema)` for the response (`{ items, total, page, limit, totalPages }`).
- Cursor pagination on `GET /v1/comments`: `cursorQuery({ maxLimit: 30 })` and `cursorPaginated(CommentSchema)` (`{ items, nextCursor, hasMore }`). `GET /v1/comments/article/:articleId` uses `cursorQuery()` with the default maximum of 100. `cursorPaginate()` in `src/index.ts` sorts newest first and uses the last comment's `id` as the cursor.
- A custom problem type: `problemSchema(409, 'DUPLICATE_TITLE')`, added to the create and update routes with `.withResponses({ 409: DuplicateTitleError })`. Both handlers throw `new HttpError(409, { code: 'DUPLICATE_TITLE', detail: 'An article with this title already exists' })` when a title matches an existing one, ignoring case.
- `.withErrors(404)` and `throw new HttpError(404, 'Article not found')` on article routes, and on comment routes for an unknown article.
- The article write routes declare `.withAuth('bearer')`. No `auth` option is passed, so the routes stay open. See [fastify-auth](../fastify-auth) for enforcement.

## Run it

```bash
# from the repository root
pnpm install
pnpm --filter './packages/*' build

cd examples/hono-helpers
pnpm dev
```

The server listens on port 3000. Set `PORT` to change it. There is no root route; everything is under `/api`. The OpenAPI document is at http://localhost:3000/api/api-doc.

`pnpm generate` writes `openapi.json` and `src/api.generated.d.ts` (types only). Both are git-ignored. If `typeful-api` is not found, run `pnpm install` again at the repository root after building the packages, so pnpm links the CLI.

## Try it

```bash
# Articles sorted by title, two per page
curl "http://localhost:3000/api/v1/articles?sortBy=title&sortOrder=asc&limit=2"

# Comment feed, newest first. Pass nextCursor to get the next page.
curl "http://localhost:3000/api/v1/comments?limit=2"
curl "http://localhost:3000/api/v1/comments?limit=2&cursor=660e8400-e29b-41d4-a716-446655440005"

# Comments for one article
curl http://localhost:3000/api/v1/comments/article/550e8400-e29b-41d4-a716-446655440001

# limit above maxLimit (50): 422 problem
curl "http://localhost:3000/api/v1/articles?limit=51"

# Duplicate title: 409 problem with the custom code
curl -i -X POST http://localhost:3000/api/v1/articles \
  -H 'Content-Type: application/json' \
  -d '{"title":"Pagination Patterns in REST APIs","content":"Again","authorId":"author-3","status":"draft"}'
```

The last request returns `409 Conflict` with `Content-Type: application/problem+json`:

```json
{
  "type": "about:blank",
  "title": "Conflict",
  "status": 409,
  "code": "DUPLICATE_TITLE",
  "detail": "An article with this title already exists"
}
```

## Files

- `src/api.ts`: article and comment schemas, `DuplicateTitleError` and the API contract.
- `src/index.ts`: seed data, `toSlug()`, `cursorPaginate()`, handlers and the server.
- `openapi.json`, `src/api.generated.d.ts`: written by `pnpm generate`.

## Next steps

See [Pagination & Filtering Helpers](../../README.md#pagination--filtering-helpers) and [Custom Problem Types](../../README.md#custom-problem-types) in the main README.
