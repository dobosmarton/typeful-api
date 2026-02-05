import { describe, it, expect } from 'vitest';
import { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';
import { __testing } from '../../src/adapter';
import type { RouteDefinition } from '@typefulapi/core';
import {
  ProductSchema,
  CreateProductSchema,
  UpdateProductSchema,
  IdParamsSchema,
  PaginationSchema,
  HealthSchema,
  ErrorSchema,
} from '../fixtures/schemas';
import {
  allAuthContract,
  minimalContract,
  nestedContract,
} from '../fixtures/contracts';

const { toRouteConfig, registerSecuritySchemes } = __testing;

describe('adapter helpers', () => {
  describe('toRouteConfig', () => {
    describe('path normalization', () => {
      it('normalizes path without leading slash', () => {
        const route: RouteDefinition = {
          method: 'get',
          path: 'no-slash',
          response: HealthSchema,
        };

        const config = toRouteConfig(route, 'test', 'v1', ['group']);
        expect(config.path).toBe('/no-slash');
      });

      it('keeps path with leading slash unchanged', () => {
        const route: RouteDefinition = {
          method: 'get',
          path: '/with-slash',
          response: HealthSchema,
        };

        const config = toRouteConfig(route, 'test', 'v1', ['group']);
        expect(config.path).toBe('/with-slash');
      });

      it('removes trailing slash', () => {
        const route: RouteDefinition = {
          method: 'get',
          path: '/trailing/',
          response: HealthSchema,
        };

        const config = toRouteConfig(route, 'test', 'v1', ['group']);
        expect(config.path).toBe('/trailing');
      });

      it('handles root path correctly', () => {
        const route: RouteDefinition = {
          method: 'get',
          path: '/',
          response: HealthSchema,
        };

        const config = toRouteConfig(route, 'test', 'v1', ['group']);
        expect(config.path).toBe('/');
      });

      it('handles empty path as root', () => {
        const route: RouteDefinition = {
          method: 'get',
          path: '',
          response: HealthSchema,
        };

        const config = toRouteConfig(route, 'test', 'v1', ['group']);
        expect(config.path).toBe('/');
      });
    });

    describe('HTTP method handling', () => {
      it('preserves GET method', () => {
        const route: RouteDefinition = {
          method: 'get',
          path: '/',
          response: HealthSchema,
        };

        const config = toRouteConfig(route, 'test', 'v1', []);
        expect(config.method).toBe('get');
      });

      it('preserves POST method', () => {
        const route: RouteDefinition = {
          method: 'post',
          path: '/',
          body: CreateProductSchema,
          response: ProductSchema,
        };

        const config = toRouteConfig(route, 'test', 'v1', []);
        expect(config.method).toBe('post');
      });

      it('preserves DELETE method', () => {
        const route: RouteDefinition = {
          method: 'delete',
          path: '/:id',
          params: IdParamsSchema,
          response: HealthSchema,
        };

        const config = toRouteConfig(route, 'test', 'v1', []);
        expect(config.method).toBe('delete');
      });
    });

    describe('request body handling', () => {
      it('includes body for POST requests', () => {
        const route: RouteDefinition = {
          method: 'post',
          path: '/',
          body: CreateProductSchema,
          response: ProductSchema,
        };

        const config = toRouteConfig(route, 'create', 'v1', ['products']);
        expect(config.request?.body).toBeDefined();
        expect(config.request?.body?.content['application/json']).toBeDefined();
        expect(config.request?.body?.required).toBe(true);
      });

      it('includes body for PUT requests', () => {
        const route: RouteDefinition = {
          method: 'put',
          path: '/:id',
          params: IdParamsSchema,
          body: CreateProductSchema,
          response: ProductSchema,
        };

        const config = toRouteConfig(route, 'update', 'v1', ['products']);
        expect(config.request?.body).toBeDefined();
      });

      it('includes body for PATCH requests', () => {
        const route: RouteDefinition = {
          method: 'patch',
          path: '/:id',
          params: IdParamsSchema,
          body: UpdateProductSchema,
          response: ProductSchema,
        };

        const config = toRouteConfig(route, 'patch', 'v1', ['products']);
        expect(config.request?.body).toBeDefined();
      });

      it('does not include body for GET requests even if specified', () => {
        const route: RouteDefinition = {
          method: 'get',
          path: '/',
          body: CreateProductSchema, // This shouldn't happen but testing robustness
          response: ProductSchema,
        };

        const config = toRouteConfig(route, 'list', 'v1', ['products']);
        expect(config.request?.body).toBeUndefined();
      });

      it('does not include body for DELETE requests even if specified', () => {
        const route: RouteDefinition = {
          method: 'delete',
          path: '/:id',
          params: IdParamsSchema,
          body: CreateProductSchema, // This shouldn't happen but testing robustness
          response: HealthSchema,
        };

        const config = toRouteConfig(route, 'delete', 'v1', ['products']);
        expect(config.request?.body).toBeUndefined();
      });
    });

    describe('query parameters', () => {
      it('extracts query schema', () => {
        const route: RouteDefinition = {
          method: 'get',
          path: '/',
          query: PaginationSchema,
          response: z.array(ProductSchema),
        };

        const config = toRouteConfig(route, 'list', 'v1', ['products']);
        expect(config.request?.query).toBeDefined();
      });

      it('does not include query when not specified', () => {
        const route: RouteDefinition = {
          method: 'get',
          path: '/',
          response: HealthSchema,
        };

        const config = toRouteConfig(route, 'health', 'v1', []);
        expect(config.request?.query).toBeUndefined();
      });
    });

    describe('path parameters', () => {
      it('extracts params schema', () => {
        const route: RouteDefinition = {
          method: 'get',
          path: '/:id',
          params: IdParamsSchema,
          response: ProductSchema,
        };

        const config = toRouteConfig(route, 'get', 'v1', ['products']);
        expect(config.request?.params).toBeDefined();
      });

      it('does not include params when not specified', () => {
        const route: RouteDefinition = {
          method: 'get',
          path: '/',
          response: HealthSchema,
        };

        const config = toRouteConfig(route, 'health', 'v1', []);
        expect(config.request?.params).toBeUndefined();
      });
    });

    describe('metadata handling', () => {
      it('includes summary when specified', () => {
        const route: RouteDefinition = {
          method: 'get',
          path: '/',
          response: HealthSchema,
          summary: 'Health check endpoint',
        };

        const config = toRouteConfig(route, 'health', 'v1', []);
        expect(config.summary).toBe('Health check endpoint');
      });

      it('includes description when specified', () => {
        const route: RouteDefinition = {
          method: 'get',
          path: '/',
          response: HealthSchema,
          description: 'Returns the health status of the API',
        };

        const config = toRouteConfig(route, 'health', 'v1', []);
        expect(config.description).toBe('Returns the health status of the API');
      });

      it('includes deprecated flag when specified', () => {
        const route: RouteDefinition = {
          method: 'get',
          path: '/',
          response: HealthSchema,
          deprecated: true,
        };

        const config = toRouteConfig(route, 'old', 'v1', ['legacy']);
        expect(config.deprecated).toBe(true);
      });

      it('does not include deprecated when false', () => {
        const route: RouteDefinition = {
          method: 'get',
          path: '/',
          response: HealthSchema,
          deprecated: false,
        };

        const config = toRouteConfig(route, 'health', 'v1', []);
        expect(config.deprecated).toBeUndefined();
      });
    });

    describe('tags handling', () => {
      it('uses explicit tags when specified', () => {
        const route: RouteDefinition = {
          method: 'get',
          path: '/',
          response: HealthSchema,
          tags: ['Health', 'System'],
        };

        const config = toRouteConfig(route, 'health', 'v1', ['api']);
        expect(config.tags).toEqual(['Health', 'System']);
      });

      it('uses first group path segment as default tag', () => {
        const route: RouteDefinition = {
          method: 'get',
          path: '/',
          response: ProductSchema,
        };

        const config = toRouteConfig(route, 'list', 'v1', ['products', 'featured']);
        expect(config.tags).toEqual(['products']);
      });

      it('has no tags when no group path and no explicit tags', () => {
        const route: RouteDefinition = {
          method: 'get',
          path: '/',
          response: HealthSchema,
        };

        const config = toRouteConfig(route, 'health', 'v1', []);
        expect(config.tags).toBeUndefined();
      });
    });

    describe('operationId generation', () => {
      it('uses explicit operationId when specified', () => {
        const route: RouteDefinition = {
          method: 'get',
          path: '/',
          response: ProductSchema,
          operationId: 'getProductList',
        };

        const config = toRouteConfig(route, 'list', 'v1', ['products']);
        expect(config.operationId).toBe('getProductList');
      });

      it('generates operationId from version, group, and name', () => {
        const route: RouteDefinition = {
          method: 'get',
          path: '/',
          response: ProductSchema,
        };

        const config = toRouteConfig(route, 'list', 'v1', ['products']);
        expect(config.operationId).toBe('v1_products_list');
      });

      it('generates operationId with nested group path', () => {
        const route: RouteDefinition = {
          method: 'get',
          path: '/',
          response: HealthSchema,
        };

        const config = toRouteConfig(route, 'dashboard', 'v1', ['admin', 'users']);
        expect(config.operationId).toBe('v1_admin_users_dashboard');
      });

      it('generates operationId for root-level routes', () => {
        const route: RouteDefinition = {
          method: 'get',
          path: '/health',
          response: HealthSchema,
        };

        const config = toRouteConfig(route, 'health', 'v1', []);
        expect(config.operationId).toBe('v1__health');
      });
    });

    describe('authentication handling', () => {
      it('adds Bearer security for bearer auth', () => {
        const route: RouteDefinition = {
          method: 'post',
          path: '/',
          body: CreateProductSchema,
          response: ProductSchema,
          auth: 'bearer',
        };

        const config = toRouteConfig(route, 'create', 'v1', ['products']);
        expect(config.security).toEqual([{ Bearer: [] }]);
      });

      it('adds ApiKey security for apiKey auth', () => {
        const route: RouteDefinition = {
          method: 'get',
          path: '/',
          response: HealthSchema,
          auth: 'apiKey',
        };

        const config = toRouteConfig(route, 'data', 'v1', ['api']);
        expect(config.security).toEqual([{ ApiKey: [] }]);
      });

      it('adds Basic security for basic auth', () => {
        const route: RouteDefinition = {
          method: 'get',
          path: '/',
          response: HealthSchema,
          auth: 'basic',
        };

        const config = toRouteConfig(route, 'login', 'v1', ['auth']);
        expect(config.security).toEqual([{ Basic: [] }]);
      });

      it('does not add security for none auth', () => {
        const route: RouteDefinition = {
          method: 'get',
          path: '/',
          response: HealthSchema,
          auth: 'none',
        };

        const config = toRouteConfig(route, 'public', 'v1', []);
        expect(config.security).toBeUndefined();
      });

      it('does not add security when auth is not specified', () => {
        const route: RouteDefinition = {
          method: 'get',
          path: '/',
          response: HealthSchema,
        };

        const config = toRouteConfig(route, 'health', 'v1', []);
        expect(config.security).toBeUndefined();
      });
    });

    describe('additional responses', () => {
      it('includes additional response codes', () => {
        const route: RouteDefinition = {
          method: 'get',
          path: '/:id',
          params: IdParamsSchema,
          response: ProductSchema,
          responses: {
            404: ErrorSchema,
            500: ErrorSchema,
          },
        };

        const config = toRouteConfig(route, 'get', 'v1', ['products']);
        expect(config.responses['404']).toBeDefined();
        expect(config.responses['500']).toBeDefined();
        expect(config.responses['200']).toBeDefined();
      });

      it('always includes 200 response', () => {
        const route: RouteDefinition = {
          method: 'get',
          path: '/',
          response: HealthSchema,
        };

        const config = toRouteConfig(route, 'health', 'v1', []);
        expect(config.responses['200']).toBeDefined();
        expect(config.responses['200'].description).toBe('Successful response');
      });
    });
  });

  describe('registerSecuritySchemes', () => {
    it('registers Bearer security scheme when used', () => {
      const app = new OpenAPIHono();
      const contract = {
        v1: {
          children: {
            test: {
              routes: {
                protected: {
                  method: 'get' as const,
                  path: '/',
                  response: HealthSchema,
                  auth: 'bearer' as const,
                },
              },
            },
          },
        },
      };

      registerSecuritySchemes(app, contract);

      const registry = app.openAPIRegistry;
      const definitions = registry.definitions;

      const bearerScheme = definitions.find(
        (d) => d.type === 'component' && d.name === 'Bearer'
      );
      expect(bearerScheme).toBeDefined();
    });

    it('registers ApiKey security scheme when used', () => {
      const app = new OpenAPIHono();
      const contract = {
        v1: {
          children: {
            test: {
              routes: {
                apiProtected: {
                  method: 'get' as const,
                  path: '/',
                  response: HealthSchema,
                  auth: 'apiKey' as const,
                },
              },
            },
          },
        },
      };

      registerSecuritySchemes(app, contract);

      const registry = app.openAPIRegistry;
      const definitions = registry.definitions;

      const apiKeyScheme = definitions.find(
        (d) => d.type === 'component' && d.name === 'ApiKey'
      );
      expect(apiKeyScheme).toBeDefined();
    });

    it('registers Basic security scheme when used', () => {
      const app = new OpenAPIHono();
      const contract = {
        v1: {
          children: {
            test: {
              routes: {
                basicProtected: {
                  method: 'get' as const,
                  path: '/',
                  response: HealthSchema,
                  auth: 'basic' as const,
                },
              },
            },
          },
        },
      };

      registerSecuritySchemes(app, contract);

      const registry = app.openAPIRegistry;
      const definitions = registry.definitions;

      const basicScheme = definitions.find(
        (d) => d.type === 'component' && d.name === 'Basic'
      );
      expect(basicScheme).toBeDefined();
    });

    it('registers all auth types from allAuthContract', () => {
      const app = new OpenAPIHono();

      registerSecuritySchemes(app, allAuthContract);

      const registry = app.openAPIRegistry;
      const definitions = registry.definitions;

      const bearerScheme = definitions.find(
        (d) => d.type === 'component' && d.name === 'Bearer'
      );
      const apiKeyScheme = definitions.find(
        (d) => d.type === 'component' && d.name === 'ApiKey'
      );
      const basicScheme = definitions.find(
        (d) => d.type === 'component' && d.name === 'Basic'
      );

      expect(bearerScheme).toBeDefined();
      expect(apiKeyScheme).toBeDefined();
      expect(basicScheme).toBeDefined();
    });

    it('does not register schemes when no auth is used', () => {
      const app = new OpenAPIHono();

      registerSecuritySchemes(app, minimalContract);

      const registry = app.openAPIRegistry;
      const definitions = registry.definitions;

      const securitySchemes = definitions.filter(
        (d) => d.type === 'component' &&
          (d.name === 'Bearer' || d.name === 'ApiKey' || d.name === 'Basic')
      );
      expect(securitySchemes).toHaveLength(0);
    });

    it('handles deeply nested groups', () => {
      const app = new OpenAPIHono();
      const deepContract = {
        v1: {
          children: {
            level1: {
              children: {
                level2: {
                  children: {
                    level3: {
                      routes: {
                        deep: {
                          method: 'get' as const,
                          path: '/',
                          response: HealthSchema,
                          auth: 'bearer' as const,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      registerSecuritySchemes(app, deepContract);

      const registry = app.openAPIRegistry;
      const definitions = registry.definitions;

      const bearerScheme = definitions.find(
        (d) => d.type === 'component' && d.name === 'Bearer'
      );
      expect(bearerScheme).toBeDefined();
    });

    it('handles multiple versions', () => {
      const app = new OpenAPIHono();
      const multiVersionContract = {
        v1: {
          children: {
            test: {
              routes: {
                route1: {
                  method: 'get' as const,
                  path: '/',
                  response: HealthSchema,
                  auth: 'bearer' as const,
                },
              },
            },
          },
        },
        v2: {
          children: {
            test: {
              routes: {
                route2: {
                  method: 'get' as const,
                  path: '/',
                  response: HealthSchema,
                  auth: 'apiKey' as const,
                },
              },
            },
          },
        },
      };

      registerSecuritySchemes(app, multiVersionContract);

      const registry = app.openAPIRegistry;
      const definitions = registry.definitions;

      const bearerScheme = definitions.find(
        (d) => d.type === 'component' && d.name === 'Bearer'
      );
      const apiKeyScheme = definitions.find(
        (d) => d.type === 'component' && d.name === 'ApiKey'
      );

      expect(bearerScheme).toBeDefined();
      expect(apiKeyScheme).toBeDefined();
    });

    it('deduplicates security schemes used multiple times', () => {
      const app = new OpenAPIHono();
      const duplicateAuthContract = {
        v1: {
          children: {
            products: {
              routes: {
                create: {
                  method: 'post' as const,
                  path: '/',
                  body: CreateProductSchema,
                  response: ProductSchema,
                  auth: 'bearer' as const,
                },
                update: {
                  method: 'put' as const,
                  path: '/:id',
                  params: IdParamsSchema,
                  body: CreateProductSchema,
                  response: ProductSchema,
                  auth: 'bearer' as const,
                },
                delete: {
                  method: 'delete' as const,
                  path: '/:id',
                  params: IdParamsSchema,
                  response: HealthSchema,
                  auth: 'bearer' as const,
                },
              },
            },
          },
        },
      };

      registerSecuritySchemes(app, duplicateAuthContract);

      const registry = app.openAPIRegistry;
      const definitions = registry.definitions;

      const bearerSchemes = definitions.filter(
        (d) => d.type === 'component' && d.name === 'Bearer'
      );
      expect(bearerSchemes).toHaveLength(1);
    });
  });
});
