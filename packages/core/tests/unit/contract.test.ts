import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  defineApi,
  defineGroup,
  defineRoutes,
  defineVersions,
  isRouteDefinition,
  isRouteGroup,
  flattenRoutes,
  extractTags,
} from '../../src/contract';
import { route } from '../../src/route';
import type { ApiContract, RouteDefinition, RouteGroup } from '../../src/types';

// Test schemas
const HealthSchema = z.object({ status: z.string() });
const ProductSchema = z.object({ id: z.string(), name: z.string() });
const IdParamsSchema = z.object({ id: z.string() });

describe('contract helpers', () => {
  describe('defineRoutes', () => {
    it('returns routes unchanged (identity function)', () => {
      const routes = {
        list: route.get('/').returns(ProductSchema),
        get: route.get('/:id').params(IdParamsSchema).returns(ProductSchema),
      };

      const result = defineRoutes(routes);
      expect(result).toBe(routes);
    });
  });

  describe('defineGroup', () => {
    it('returns group unchanged (identity function)', () => {
      const group = {
        routes: {
          list: route.get('/').returns(ProductSchema),
        },
      };

      const result = defineGroup(group);
      expect(result).toBe(group);
    });

    it('works with nested children', () => {
      const group = {
        children: {
          products: {
            routes: {
              list: route.get('/').returns(ProductSchema),
            },
          },
        },
      };

      const result = defineGroup(group);
      expect(result).toBe(group);
    });
  });

  describe('defineVersions', () => {
    it('returns versions unchanged (identity function)', () => {
      const versions = {
        v1: {
          children: {
            products: {
              routes: {
                list: route.get('/').returns(ProductSchema),
              },
            },
          },
        },
      };

      const result = defineVersions(versions);
      expect(result).toBe(versions);
    });
  });

  describe('defineApi', () => {
    it('returns contract unchanged (identity function)', () => {
      const contract = {
        v1: {
          children: {
            products: {
              routes: {
                list: route.get('/').returns(ProductSchema),
              },
            },
          },
        },
      };

      const result = defineApi(contract);
      expect(result).toBe(contract);
    });
  });

  describe('isRouteDefinition', () => {
    it('returns true for valid route definition', () => {
      const routeDef: RouteDefinition = {
        method: 'get',
        path: '/users',
        response: HealthSchema,
      };

      expect(isRouteDefinition(routeDef)).toBe(true);
    });

    it('returns false for route group', () => {
      const group: RouteGroup = {
        routes: {
          health: route.get('/health').returns(HealthSchema),
        },
      };

      expect(isRouteDefinition(group)).toBe(false);
    });

    it('returns false for null', () => {
      expect(isRouteDefinition(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isRouteDefinition(undefined)).toBe(false);
    });

    it('returns false for primitive values', () => {
      expect(isRouteDefinition('string')).toBe(false);
      expect(isRouteDefinition(123)).toBe(false);
      expect(isRouteDefinition(true)).toBe(false);
    });

    it('returns false for object missing method', () => {
      expect(isRouteDefinition({ path: '/', response: HealthSchema })).toBe(false);
    });

    it('returns false for object missing path', () => {
      expect(isRouteDefinition({ method: 'get', response: HealthSchema })).toBe(false);
    });

    it('returns false for object missing response', () => {
      expect(isRouteDefinition({ method: 'get', path: '/' })).toBe(false);
    });
  });

  describe('isRouteGroup', () => {
    it('returns true for group with routes', () => {
      const group: RouteGroup = {
        routes: {
          health: route.get('/health').returns(HealthSchema),
        },
      };

      expect(isRouteGroup(group)).toBe(true);
    });

    it('returns true for group with children', () => {
      const group: RouteGroup = {
        children: {
          products: {
            routes: {
              list: route.get('/').returns(ProductSchema),
            },
          },
        },
      };

      expect(isRouteGroup(group)).toBe(true);
    });

    it('returns true for group with both routes and children', () => {
      const group: RouteGroup = {
        routes: {
          health: route.get('/health').returns(HealthSchema),
        },
        children: {
          products: {
            routes: {
              list: route.get('/').returns(ProductSchema),
            },
          },
        },
      };

      expect(isRouteGroup(group)).toBe(true);
    });

    it('returns false for route definition', () => {
      const routeDef: RouteDefinition = {
        method: 'get',
        path: '/users',
        response: HealthSchema,
      };

      expect(isRouteGroup(routeDef)).toBe(false);
    });

    it('returns false for null', () => {
      expect(isRouteGroup(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isRouteGroup(undefined)).toBe(false);
    });

    it('returns false for empty object', () => {
      expect(isRouteGroup({})).toBe(false);
    });
  });

  describe('flattenRoutes', () => {
    it('flattens single route in single version', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            health: route.get('/health').returns(HealthSchema),
          },
        },
      };

      const flattened = flattenRoutes(contract);

      expect(flattened).toHaveLength(1);
      expect(flattened[0]).toEqual({
        version: 'v1',
        group: [],
        name: 'health',
        route: expect.objectContaining({
          method: 'get',
          path: '/health',
        }),
        fullPath: '/v1/health',
      });
    });

    it('flattens routes in nested groups', () => {
      const contract: ApiContract = {
        v1: {
          children: {
            products: {
              routes: {
                list: route.get('/').returns(ProductSchema),
                get: route.get('/:id').returns(ProductSchema),
              },
            },
          },
        },
      };

      const flattened = flattenRoutes(contract);

      expect(flattened).toHaveLength(2);
      expect(flattened[0]).toEqual({
        version: 'v1',
        group: ['products'],
        name: 'list',
        route: expect.objectContaining({ method: 'get', path: '/' }),
        fullPath: '/v1/products',
      });
      expect(flattened[1]).toEqual({
        version: 'v1',
        group: ['products'],
        name: 'get',
        route: expect.objectContaining({ method: 'get', path: '/:id' }),
        fullPath: '/v1/products/:id',
      });
    });

    it('handles deeply nested groups', () => {
      const contract: ApiContract = {
        v1: {
          children: {
            admin: {
              children: {
                users: {
                  children: {
                    roles: {
                      routes: {
                        list: route.get('/').returns(z.array(z.string())),
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const flattened = flattenRoutes(contract);

      expect(flattened).toHaveLength(1);
      expect(flattened[0]).toEqual({
        version: 'v1',
        group: ['admin', 'users', 'roles'],
        name: 'list',
        route: expect.objectContaining({ method: 'get', path: '/' }),
        fullPath: '/v1/admin/users/roles',
      });
    });

    it('handles multiple versions', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            health: route.get('/health').returns(HealthSchema),
          },
        },
        v2: {
          routes: {
            health: route.get('/health').returns(HealthSchema),
            status: route.get('/status').returns(HealthSchema),
          },
        },
      };

      const flattened = flattenRoutes(contract);

      expect(flattened).toHaveLength(3);
      expect(flattened.filter((r) => r.version === 'v1')).toHaveLength(1);
      expect(flattened.filter((r) => r.version === 'v2')).toHaveLength(2);
    });

    it('applies basePath prefix', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            health: route.get('/health').returns(HealthSchema),
          },
        },
      };

      const flattened = flattenRoutes(contract, '/api');

      expect(flattened[0]?.fullPath).toBe('/api/v1/health');
    });

    it('normalizes double slashes in paths', () => {
      const contract: ApiContract = {
        v1: {
          children: {
            products: {
              routes: {
                list: route.get('/').returns(ProductSchema),
              },
            },
          },
        },
      };

      const flattened = flattenRoutes(contract);

      // Should not have double slashes
      expect(flattened[0]?.fullPath).not.toContain('//');
    });

    it('handles routes without leading slash', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            health: {
              method: 'get',
              path: 'health', // No leading slash
              response: HealthSchema,
            },
          },
        },
      };

      const flattened = flattenRoutes(contract);

      expect(flattened[0]?.fullPath).toBe('/v1/health');
    });

    it('returns empty array for empty contract', () => {
      const contract: ApiContract = {};

      const flattened = flattenRoutes(contract);

      expect(flattened).toEqual([]);
    });

    it('handles version with no routes or children', () => {
      const contract: ApiContract = {
        v1: {},
      };

      const flattened = flattenRoutes(contract);

      expect(flattened).toEqual([]);
    });
  });

  describe('extractTags', () => {
    it('extracts tags from route level', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            health: route.get('/health').tags('Health').returns(HealthSchema),
          },
        },
      };

      const tags = extractTags(contract);

      expect(tags).toEqual(['Health']);
    });

    it('extracts tags from group level', () => {
      const contract: ApiContract = {
        v1: {
          children: {
            products: {
              tags: ['Products'],
              routes: {
                list: route.get('/').returns(ProductSchema),
              },
            },
          },
        },
      };

      const tags = extractTags(contract);

      expect(tags).toEqual(['Products']);
    });

    it('combines tags from multiple levels', () => {
      const contract: ApiContract = {
        v1: {
          children: {
            products: {
              tags: ['Products'],
              routes: {
                list: route.get('/').tags('List').returns(ProductSchema),
              },
            },
          },
        },
      };

      const tags = extractTags(contract);

      expect(tags).toContain('Products');
      expect(tags).toContain('List');
    });

    it('deduplicates tags', () => {
      const contract: ApiContract = {
        v1: {
          children: {
            products: {
              tags: ['API'],
              routes: {
                list: route.get('/').tags('API').returns(ProductSchema),
              },
            },
          },
        },
      };

      const tags = extractTags(contract);

      expect(tags).toEqual(['API']);
    });

    it('sorts tags alphabetically', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            c: route.get('/c').tags('Zebra').returns(HealthSchema),
            b: route.get('/b').tags('Apple').returns(HealthSchema),
            a: route.get('/a').tags('Mango').returns(HealthSchema),
          },
        },
      };

      const tags = extractTags(contract);

      expect(tags).toEqual(['Apple', 'Mango', 'Zebra']);
    });

    it('returns empty array when no tags', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            health: route.get('/health').returns(HealthSchema),
          },
        },
      };

      const tags = extractTags(contract);

      expect(tags).toEqual([]);
    });

    it('handles deeply nested groups with tags', () => {
      const contract: ApiContract = {
        v1: {
          children: {
            level1: {
              tags: ['Level1'],
              children: {
                level2: {
                  tags: ['Level2'],
                  children: {
                    level3: {
                      tags: ['Level3'],
                      routes: {
                        deep: route.get('/').tags('DeepRoute').returns(HealthSchema),
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const tags = extractTags(contract);

      expect(tags).toContain('Level1');
      expect(tags).toContain('Level2');
      expect(tags).toContain('Level3');
      expect(tags).toContain('DeepRoute');
    });

    it('handles multiple versions with tags', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            health: route.get('/health').tags('V1').returns(HealthSchema),
          },
        },
        v2: {
          routes: {
            health: route.get('/health').tags('V2').returns(HealthSchema),
          },
        },
      };

      const tags = extractTags(contract);

      expect(tags).toContain('V1');
      expect(tags).toContain('V2');
    });
  });
});
