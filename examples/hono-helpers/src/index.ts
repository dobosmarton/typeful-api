/**
 * Blog API Server — Hono Helpers Example
 *
 * Demonstrates handler implementations for:
 * - Offset pagination with sorting (articles)
 * - Cursor-based pagination (comments)
 * - CRUD operations with type-safe handlers
 */

import { serve } from '@hono/node-server';
import { createHonoRouter } from '@typeful-api/hono';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { randomUUID } from 'node:crypto';
import { api, type Article, type Comment } from './api';

// ============================================
// In-Memory Data (seed data for demo)
// ============================================

const articles: Article[] = [
  {
    id: '550e8400-e29b-41d4-a716-446655440001',
    title: 'Getting Started with typeful-api',
    slug: 'getting-started-with-typeful-api',
    content: 'Learn how to build type-safe APIs with contract-first design...',
    authorId: 'author-1',
    status: 'published',
    publishedAt: '2025-01-15T10:00:00.000Z',
    createdAt: '2025-01-15T09:00:00.000Z',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440002',
    title: 'Pagination Patterns in REST APIs',
    slug: 'pagination-patterns-in-rest-apis',
    content: 'Comparing offset vs cursor pagination strategies...',
    authorId: 'author-1',
    status: 'published',
    publishedAt: '2025-02-01T12:00:00.000Z',
    createdAt: '2025-02-01T11:00:00.000Z',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440003',
    title: 'Error Handling Best Practices',
    slug: 'error-handling-best-practices',
    content: 'Structured error responses for better API DX...',
    authorId: 'author-2',
    status: 'published',
    publishedAt: '2025-03-10T08:00:00.000Z',
    createdAt: '2025-03-10T07:00:00.000Z',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440004',
    title: 'Draft: Advanced Zod Patterns',
    slug: 'draft-advanced-zod-patterns',
    content: 'Exploring discriminated unions and branded types...',
    authorId: 'author-2',
    status: 'draft',
    publishedAt: null,
    createdAt: '2025-04-01T14:00:00.000Z',
  },
];

const comments: Comment[] = [
  {
    id: '660e8400-e29b-41d4-a716-446655440001',
    articleId: '550e8400-e29b-41d4-a716-446655440001',
    authorName: 'Alice',
    content: 'Great introduction! Exactly what I needed.',
    createdAt: '2025-01-16T10:00:00.000Z',
  },
  {
    id: '660e8400-e29b-41d4-a716-446655440002',
    articleId: '550e8400-e29b-41d4-a716-446655440001',
    authorName: 'Bob',
    content: 'Would love to see more examples with Express.',
    createdAt: '2025-01-17T14:30:00.000Z',
  },
  {
    id: '660e8400-e29b-41d4-a716-446655440003',
    articleId: '550e8400-e29b-41d4-a716-446655440002',
    authorName: 'Charlie',
    content: 'Cursor pagination is definitely the way to go for feeds.',
    createdAt: '2025-02-02T09:15:00.000Z',
  },
  {
    id: '660e8400-e29b-41d4-a716-446655440004',
    articleId: '550e8400-e29b-41d4-a716-446655440002',
    authorName: 'Alice',
    content: 'How does this compare with keyset pagination?',
    createdAt: '2025-02-03T16:00:00.000Z',
  },
  {
    id: '660e8400-e29b-41d4-a716-446655440005',
    articleId: '550e8400-e29b-41d4-a716-446655440003',
    authorName: 'Dave',
    content: 'The errorSchema helper is brilliant for discriminated unions.',
    createdAt: '2025-03-11T11:00:00.000Z',
  },
  {
    id: '660e8400-e29b-41d4-a716-446655440006',
    articleId: '550e8400-e29b-41d4-a716-446655440003',
    authorName: 'Eve',
    content: 'Would be nice to see validation error examples too.',
    createdAt: '2025-03-12T08:45:00.000Z',
  },
];

// ============================================
// Helper: Slug generation
// ============================================

const toSlug = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

// ============================================
// Helper: Cursor pagination
// ============================================

const cursorPaginate = <T extends { id: string; createdAt: string }>(
  items: T[],
  cursor: string | undefined,
  limit: number,
): { items: T[]; nextCursor: string | null; hasMore: boolean } => {
  // Sort by createdAt desc (most recent first)
  const sorted = [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  // Find cursor position
  const startIndex = cursor ? sorted.findIndex((item) => item.id === cursor) + 1 : 0;

  // Take limit + 1 to determine if there are more items
  const slice = sorted.slice(startIndex, startIndex + limit + 1);
  const hasMore = slice.length > limit;
  const pageItems = hasMore ? slice.slice(0, limit) : slice;
  const nextCursor = hasMore ? pageItems[pageItems.length - 1]!.id : null;

  return { items: pageItems, nextCursor, hasMore };
};

// ============================================
// Router
// ============================================

const router = createHonoRouter(api, {
  v1: {
    health: async () => ({ status: 'ok' as const }),

    articles: {
      list: async ({ query }) => {
        const { page, limit, sortBy, sortOrder } = query;

        // Sort
        const sorted = [...articles].sort((a, b) => {
          const field = sortBy ?? 'createdAt';
          const aVal = a[field];
          const bVal = b[field];
          const cmp = String(aVal).localeCompare(String(bVal));
          return sortOrder === 'desc' ? -cmp : cmp;
        });

        // Paginate
        const start = (page - 1) * limit;
        const pageItems = sorted.slice(start, start + limit);

        return {
          items: pageItems,
          total: articles.length,
          page,
          limit,
          totalPages: Math.ceil(articles.length / limit),
        };
      },

      get: async ({ params }) => {
        const article = articles.find((a) => a.id === params.id);
        if (!article) throw new Error('Article not found');
        return article;
      },

      create: async ({ body }) => {
        // Check for duplicate title
        const existing = articles.find((a) => a.title.toLowerCase() === body.title.toLowerCase());
        if (existing) throw new Error('Duplicate title');

        const article: Article = {
          id: randomUUID(),
          slug: toSlug(body.title),
          publishedAt: body.status === 'published' ? new Date().toISOString() : null,
          createdAt: new Date().toISOString(),
          ...body,
        };

        articles.push(article);
        return article;
      },

      update: async ({ params, body }) => {
        const index = articles.findIndex((a) => a.id === params.id);
        if (index === -1) throw new Error('Article not found');

        const current = articles[index]!;
        const updated: Article = {
          ...current,
          ...body,
          slug: body.title ? toSlug(body.title) : current.slug,
          publishedAt:
            body.status === 'published' && !current.publishedAt
              ? new Date().toISOString()
              : current.publishedAt,
        };

        articles[index] = updated;
        return updated;
      },

      delete: async ({ params }) => {
        const index = articles.findIndex((a) => a.id === params.id);
        if (index === -1) throw new Error('Article not found');
        articles.splice(index, 1);
        return { success: true };
      },
    },

    comments: {
      feed: async ({ query }) => {
        return cursorPaginate(comments, query.cursor, query.limit);
      },

      byArticle: async ({ params, query }) => {
        const article = articles.find((a) => a.id === params.articleId);
        if (!article) throw new Error('Article not found');

        const articleComments = comments.filter((c) => c.articleId === params.articleId);
        return cursorPaginate(articleComments, query.cursor, query.limit);
      },

      create: async ({ params, body }) => {
        const article = articles.find((a) => a.id === params.articleId);
        if (!article) throw new Error('Article not found');

        const comment: Comment = {
          id: randomUUID(),
          articleId: params.articleId,
          createdAt: new Date().toISOString(),
          ...body,
        };

        comments.push(comment);
        return comment;
      },
    },
  },
});

// ============================================
// App
// ============================================

const app = new Hono();
app.use('*', logger());
app.use('*', cors());
app.route('/api', router);

const port = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Blog API running at http://localhost:${info.port}`);
  console.log(`Articles: http://localhost:${info.port}/api/v1/articles`);
  console.log(`Comments: http://localhost:${info.port}/api/v1/comments`);
  console.log(`API Docs: http://localhost:${info.port}/api/api-doc`);
});
