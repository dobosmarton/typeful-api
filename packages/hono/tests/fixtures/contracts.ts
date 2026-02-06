import type { ApiContract } from '@typeful-api/core';
import {
  ProductSchema,
  CreateProductSchema,
  UpdateProductSchema,
  IdParamsSchema,
  PaginationSchema,
  HealthSchema,
  UserSchema,
  SuccessSchema,
  ErrorSchema,
} from './schemas';
import { z } from 'zod';

/**
 * Minimal contract with a single route - simplest test case
 */
export const minimalContract = {
  v1: {
    children: {
      health: {
        routes: {
          check: {
            method: 'get',
            path: '/',
            response: HealthSchema,
          },
        },
      },
    },
  },
} as const satisfies ApiContract;

/**
 * Contract with routes directly on version (no children)
 */
export const directRoutesContract = {
  v1: {
    routes: {
      health: {
        method: 'get',
        path: '/health',
        response: HealthSchema,
      },
    },
  },
} as const satisfies ApiContract;

/**
 * Full-featured contract with multiple versions, groups, HTTP methods, and auth types
 */
export const fullContract = {
  v1: {
    children: {
      products: {
        routes: {
          list: {
            method: 'get',
            path: '/',
            query: PaginationSchema,
            response: z.array(ProductSchema),
            summary: 'List all products',
            description: 'Returns a paginated list of products',
            tags: ['products'],
          },
          get: {
            method: 'get',
            path: '/:id',
            params: IdParamsSchema,
            response: ProductSchema,
            summary: 'Get product by ID',
          },
          create: {
            method: 'post',
            path: '/',
            body: CreateProductSchema,
            response: ProductSchema,
            auth: 'bearer',
            summary: 'Create a new product',
          },
          update: {
            method: 'put',
            path: '/:id',
            params: IdParamsSchema,
            body: CreateProductSchema,
            response: ProductSchema,
            auth: 'bearer',
          },
          patch: {
            method: 'patch',
            path: '/:id',
            params: IdParamsSchema,
            body: UpdateProductSchema,
            response: ProductSchema,
            auth: 'bearer',
          },
          delete: {
            method: 'delete',
            path: '/:id',
            params: IdParamsSchema,
            response: SuccessSchema,
            auth: 'bearer',
          },
        },
      },
      users: {
        routes: {
          list: {
            method: 'get',
            path: '/',
            response: z.array(UserSchema),
          },
          get: {
            method: 'get',
            path: '/:id',
            params: z.object({ id: z.string() }),
            response: UserSchema,
          },
        },
      },
    },
  },
  v2: {
    children: {
      products: {
        routes: {
          list: {
            method: 'get',
            path: '/',
            query: PaginationSchema,
            response: z.array(ProductSchema),
            summary: 'List all products (v2)',
          },
        },
      },
    },
  },
} as const satisfies ApiContract;

/**
 * Deeply nested contract for testing recursive group handling
 */
export const nestedContract = {
  v1: {
    children: {
      api: {
        children: {
          admin: {
            children: {
              users: {
                routes: {
                  list: {
                    method: 'get',
                    path: '/',
                    response: z.array(UserSchema),
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const satisfies ApiContract;

/**
 * Empty contract for edge case testing
 */
export const emptyContract = {
  v1: {},
} as const satisfies ApiContract;

/**
 * Contract with all authentication types
 */
export const allAuthContract = {
  v1: {
    children: {
      auth: {
        routes: {
          public: {
            method: 'get',
            path: '/public',
            response: HealthSchema,
            auth: 'none',
          },
          bearer: {
            method: 'get',
            path: '/bearer',
            response: HealthSchema,
            auth: 'bearer',
          },
          apiKey: {
            method: 'get',
            path: '/api-key',
            response: HealthSchema,
            auth: 'apiKey',
          },
          basic: {
            method: 'get',
            path: '/basic',
            response: HealthSchema,
            auth: 'basic',
          },
        },
      },
    },
  },
} as const satisfies ApiContract;

/**
 * Contract with deprecated routes
 */
export const deprecatedContract = {
  v1: {
    children: {
      legacy: {
        routes: {
          oldEndpoint: {
            method: 'get',
            path: '/old',
            response: HealthSchema,
            deprecated: true,
            summary: 'Deprecated endpoint',
          },
        },
      },
    },
  },
} as const satisfies ApiContract;

/**
 * Contract with custom operationIds
 */
export const operationIdContract = {
  v1: {
    children: {
      products: {
        routes: {
          list: {
            method: 'get',
            path: '/',
            response: z.array(ProductSchema),
            operationId: 'getProductList',
          },
        },
      },
    },
  },
} as const satisfies ApiContract;

/**
 * Contract with additional response codes
 */
export const multiResponseContract = {
  v1: {
    children: {
      products: {
        routes: {
          get: {
            method: 'get',
            path: '/:id',
            params: IdParamsSchema,
            response: ProductSchema,
            responses: {
              404: ErrorSchema,
              500: ErrorSchema,
            },
          },
        },
      },
    },
  },
} as const satisfies ApiContract;

/**
 * Contract with middleware definitions
 */
export const middlewareContract = {
  v1: {
    middleware: ['auth'],
    children: {
      admin: {
        middleware: ['adminOnly'],
        routes: {
          dashboard: {
            method: 'get',
            path: '/dashboard',
            response: HealthSchema,
          },
        },
      },
    },
  },
} as const satisfies ApiContract;

/**
 * Contract with explicit tags
 */
export const taggedContract = {
  v1: {
    children: {
      products: {
        tags: ['Products API'],
        routes: {
          list: {
            method: 'get',
            path: '/',
            response: z.array(ProductSchema),
            tags: ['Products', 'Public'],
          },
          create: {
            method: 'post',
            path: '/',
            body: CreateProductSchema,
            response: ProductSchema,
            tags: ['Products', 'Admin'],
          },
        },
      },
    },
  },
} as const satisfies ApiContract;

/**
 * Contract with paths that need normalization
 */
export const pathNormalizationContract = {
  v1: {
    children: {
      test: {
        routes: {
          noLeadingSlash: {
            method: 'get',
            path: 'no-slash',
            response: HealthSchema,
          },
          trailingSlash: {
            method: 'get',
            path: '/trailing/',
            response: HealthSchema,
          },
          root: {
            method: 'get',
            path: '/',
            response: HealthSchema,
          },
        },
      },
    },
  },
} as const satisfies ApiContract;
