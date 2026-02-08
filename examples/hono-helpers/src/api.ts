/**
 * Blog API Contract — Showcasing All Helpers
 *
 * This example demonstrates every new helper in @typeful-api/core:
 * - paginationQuery() + sortQuery()  → offset pagination with sorting
 * - cursorQuery() + cursorPaginated() → cursor-based pagination
 * - paginated()                       → standard paginated response envelope
 * - errorSchema()                     → custom error types
 * - withErrors()                      → typed HTTP error responses
 * - conflictError()                   → pre-built error factories
 */

import {
  defineApi,
  route,
  paginationQuery,
  cursorQuery,
  sortQuery,
  paginated,
  cursorPaginated,
  errorSchema,
  conflictError,
} from '@typeful-api/core';
import { z } from 'zod';

// ============================================
// Schemas
// ============================================

export const ArticleSchema = z.object({
  id: z.uuid().describe('Unique article identifier'),
  title: z.string().min(1).max(200).describe('Article title'),
  slug: z.string().describe('URL-friendly slug derived from title'),
  content: z.string().min(1).describe('Article body content'),
  authorId: z.string().min(1).describe('Author identifier'),
  status: z.enum(['draft', 'published', 'archived']).describe('Publication status'),
  publishedAt: z.iso.datetime().nullable().describe('Publication timestamp'),
  createdAt: z.iso.datetime().describe('Creation timestamp'),
});

export const CreateArticleSchema = ArticleSchema.omit({
  id: true,
  slug: true,
  publishedAt: true,
  createdAt: true,
});

export const UpdateArticleSchema = CreateArticleSchema.partial();

export const CommentSchema = z.object({
  id: z.uuid().describe('Unique comment identifier'),
  articleId: z.uuid().describe('Parent article identifier'),
  authorName: z.string().min(1).max(100).describe('Comment author display name'),
  content: z.string().min(1).max(2000).describe('Comment text'),
  createdAt: z.iso.datetime().describe('Creation timestamp'),
});

export const CreateCommentSchema = CommentSchema.omit({
  id: true,
  createdAt: true,
});

// Custom error type — demonstrates errorSchema() for domain-specific errors
export const DuplicateTitleError = errorSchema(
  'DUPLICATE_TITLE',
  'An article with this title already exists',
);

export const IdParamsSchema = z.object({
  id: z.uuid().describe('Resource ID'),
});

export const ArticleIdParamsSchema = z.object({
  articleId: z.uuid().describe('Article ID'),
});

// ============================================
// API Contract
// ============================================

export const api = defineApi({
  v1: {
    routes: {
      health: route
        .get('/health')
        .returns(z.object({ status: z.literal('ok') }))
        .withSummary('Health check')
        .withTags('system'),
    },
    children: {
      articles: {
        routes: {
          // Offset pagination + sorting — showcases paginationQuery().merge(sortQuery())
          list: route
            .get('/')
            .query(
              paginationQuery({ maxLimit: 50 }).merge(
                sortQuery(['title', 'createdAt'] as const),
              ),
            )
            .returns(paginated(ArticleSchema))
            .withSummary('List articles')
            .withDescription('Returns a sorted, paginated list of articles')
            .withTags('articles'),

          // withErrors(404) — typed not-found response
          get: route
            .get('/:id')
            .params(IdParamsSchema)
            .returns(ArticleSchema)
            .withErrors(404)
            .withSummary('Get article by ID')
            .withTags('articles'),

          // withAuth + withErrors + custom conflictError — full create example
          create: route
            .post('/')
            .body(CreateArticleSchema)
            .returns(ArticleSchema)
            .withAuth('bearer')
            .withErrors(401)
            .withResponses({ 409: conflictError() })
            .withSummary('Create an article')
            .withTags('articles'),

          // Multiple error codes in a single call
          update: route
            .patch('/:id')
            .params(IdParamsSchema)
            .body(UpdateArticleSchema)
            .returns(ArticleSchema)
            .withAuth('bearer')
            .withErrors(404, 401)
            .withSummary('Update an article')
            .withTags('articles'),

          delete: route
            .delete('/:id')
            .params(IdParamsSchema)
            .returns(z.object({ success: z.boolean() }))
            .withAuth('bearer')
            .withErrors(404, 401)
            .withSummary('Delete an article')
            .withTags('articles'),
        },
      },

      comments: {
        routes: {
          // Cursor pagination — showcases cursorQuery() + cursorPaginated()
          feed: route
            .get('/')
            .query(cursorQuery({ maxLimit: 30 }))
            .returns(cursorPaginated(CommentSchema))
            .withSummary('Get comment feed')
            .withDescription('Returns all comments in reverse chronological order with cursor pagination')
            .withTags('comments'),

          // Cursor pagination with params — filter by article
          byArticle: route
            .get('/article/:articleId')
            .params(ArticleIdParamsSchema)
            .query(cursorQuery())
            .returns(cursorPaginated(CommentSchema))
            .withErrors(404)
            .withSummary('Get comments for an article')
            .withTags('comments'),

          // Body + params + errors — create comment on article
          create: route
            .post('/article/:articleId')
            .params(ArticleIdParamsSchema)
            .body(CreateCommentSchema.omit({ articleId: true }))
            .returns(CommentSchema)
            .withErrors(404, 401)
            .withSummary('Add a comment to an article')
            .withTags('comments'),
        },
      },
    },
  },
});

// Export types for use in handlers
export type Article = z.infer<typeof ArticleSchema>;
export type CreateArticle = z.infer<typeof CreateArticleSchema>;
export type UpdateArticle = z.infer<typeof UpdateArticleSchema>;
export type Comment = z.infer<typeof CommentSchema>;
export type CreateComment = z.infer<typeof CreateCommentSchema>;
