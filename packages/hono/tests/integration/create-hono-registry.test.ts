import { describe, it, expect } from 'vitest';
import { createHonoRegistry } from '../../src/adapter';
import { request } from '../setup';
import {
  minimalContract,
  fullContract,
  nestedContract,
  allAuthContract,
  operationIdContract,
  multiResponseContract,
} from '../fixtures/contracts';

describe('createHonoRegistry', () => {
  describe('basic functionality', () => {
    it('creates an OpenAPIHono instance', () => {
      const registry = createHonoRegistry(minimalContract);

      expect(registry).toBeDefined();
      expect(registry.fetch).toBeInstanceOf(Function);
    });

    it('creates documentation-only instance that throws when called', async () => {
      const registry = createHonoRegistry(minimalContract);

      const res = await request(registry, 'GET', '/v1/health');
      // The route exists but throws an error
      expect(res.status).toBe(500);
    });

    it('throws error with operationId when route is called', async () => {
      const registry = createHonoRegistry(minimalContract);

      // Set up error handler to capture the error message
      registry.onError((err, c) => {
        return c.json({ error: err.message }, 500);
      });

      const res = await request(registry, 'GET', '/v1/health');
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain('No handler mounted');
      expect(body.error).toContain('v1_health_check');
    });
  });

  describe('route registration', () => {
    it('registers all routes from contract in OpenAPI registry', () => {
      const registry = createHonoRegistry(fullContract);

      const definitions = registry.openAPIRegistry.definitions;

      // Check that routes are registered
      const routeDefinitions = definitions.filter((d) => d.type === 'route');
      expect(routeDefinitions.length).toBeGreaterThan(0);
    });

    it('registers routes with correct paths', () => {
      const registry = createHonoRegistry(fullContract);

      const definitions = registry.openAPIRegistry.definitions;
      const routes = definitions.filter((d) => d.type === 'route');

      // Find a specific route
      const listRoute = routes.find(
        (r) => r.type === 'route' && r.route.operationId === 'v1_products_list',
      );
      expect(listRoute).toBeDefined();
    });

    it('registers routes from multiple versions', () => {
      const registry = createHonoRegistry(fullContract);

      const definitions = registry.openAPIRegistry.definitions;
      const routes = definitions.filter((d) => d.type === 'route');

      // Find v1 and v2 routes
      const v1Route = routes.find(
        (r) => r.type === 'route' && r.route.operationId?.startsWith('v1_'),
      );
      const v2Route = routes.find(
        (r) => r.type === 'route' && r.route.operationId?.startsWith('v2_'),
      );

      expect(v1Route).toBeDefined();
      expect(v2Route).toBeDefined();
    });

    it('registers nested group routes', () => {
      const registry = createHonoRegistry(nestedContract);

      const definitions = registry.openAPIRegistry.definitions;
      const routes = definitions.filter((d) => d.type === 'route');

      // Should have the deeply nested route
      const nestedRoute = routes.find(
        (r) => r.type === 'route' && r.route.operationId === 'v1_api_admin_users_list',
      );
      expect(nestedRoute).toBeDefined();
    });

    it('registers routes with custom operationIds', () => {
      const registry = createHonoRegistry(operationIdContract);

      const definitions = registry.openAPIRegistry.definitions;
      const routes = definitions.filter((d) => d.type === 'route');

      const customRoute = routes.find(
        (r) => r.type === 'route' && r.route.operationId === 'getProductList',
      );
      expect(customRoute).toBeDefined();
    });
  });

  describe('security schemes', () => {
    it('registers Bearer security scheme', () => {
      const registry = createHonoRegistry(allAuthContract);

      const definitions = registry.openAPIRegistry.definitions;
      const bearerScheme = definitions.find((d) => d.type === 'component' && d.name === 'Bearer');

      expect(bearerScheme).toBeDefined();
    });

    it('registers ApiKey security scheme', () => {
      const registry = createHonoRegistry(allAuthContract);

      const definitions = registry.openAPIRegistry.definitions;
      const apiKeyScheme = definitions.find((d) => d.type === 'component' && d.name === 'ApiKey');

      expect(apiKeyScheme).toBeDefined();
    });

    it('registers Basic security scheme', () => {
      const registry = createHonoRegistry(allAuthContract);

      const definitions = registry.openAPIRegistry.definitions;
      const basicScheme = definitions.find((d) => d.type === 'component' && d.name === 'Basic');

      expect(basicScheme).toBeDefined();
    });

    it('does not register security schemes when not used', () => {
      const registry = createHonoRegistry(minimalContract);

      const definitions = registry.openAPIRegistry.definitions;
      const securitySchemes = definitions.filter(
        (d) =>
          d.type === 'component' &&
          (d.name === 'Bearer' || d.name === 'ApiKey' || d.name === 'Basic'),
      );

      expect(securitySchemes).toHaveLength(0);
    });
  });

  describe('basePath option', () => {
    it('applies basePath to registry', async () => {
      const registry = createHonoRegistry(minimalContract, '/api');

      // Set up error handler to check route exists
      registry.onError((err, c) => {
        return c.json({ error: err.message }, 500);
      });

      // With basePath, route should exist
      const res = await request(registry, 'GET', '/api/v1/health');
      expect(res.status).toBe(500); // Error because no handler, but route exists
      const body = await res.json();
      expect(body.error).toContain('No handler mounted');

      // Without basePath, should 404
      const resNoBase = await request(registry, 'GET', '/v1/health');
      expect(resNoBase.status).toBe(404);
    });

    it('works without basePath', async () => {
      const registry = createHonoRegistry(minimalContract);

      registry.onError((err, c) => {
        return c.json({ error: err.message }, 500);
      });

      const res = await request(registry, 'GET', '/v1/health');
      expect(res.status).toBe(500);
    });
  });

  describe('response registration', () => {
    it('registers routes with additional response codes', () => {
      const registry = createHonoRegistry(multiResponseContract);

      const definitions = registry.openAPIRegistry.definitions;
      const routes = definitions.filter((d) => d.type === 'route');

      const getRoute = routes.find(
        (r) => r.type === 'route' && r.route.operationId === 'v1_products_get',
      );

      expect(getRoute).toBeDefined();
      if (getRoute && getRoute.type === 'route') {
        // Check that responses include 404 and 500
        expect(getRoute.route.responses).toBeDefined();
        expect(getRoute.route.responses['200']).toBeDefined();
        expect(getRoute.route.responses['404']).toBeDefined();
        expect(getRoute.route.responses['500']).toBeDefined();
      }
    });
  });

  describe('HTTP methods', () => {
    it('registers GET routes', () => {
      const registry = createHonoRegistry(fullContract);

      const definitions = registry.openAPIRegistry.definitions;
      const routes = definitions.filter((d) => d.type === 'route');

      const getRoute = routes.find(
        (r) =>
          r.type === 'route' &&
          r.route.method === 'get' &&
          r.route.operationId === 'v1_products_list',
      );
      expect(getRoute).toBeDefined();
    });

    it('registers POST routes', () => {
      const registry = createHonoRegistry(fullContract);

      const definitions = registry.openAPIRegistry.definitions;
      const routes = definitions.filter((d) => d.type === 'route');

      const postRoute = routes.find(
        (r) =>
          r.type === 'route' &&
          r.route.method === 'post' &&
          r.route.operationId === 'v1_products_create',
      );
      expect(postRoute).toBeDefined();
    });

    it('registers PUT routes', () => {
      const registry = createHonoRegistry(fullContract);

      const definitions = registry.openAPIRegistry.definitions;
      const routes = definitions.filter((d) => d.type === 'route');

      const putRoute = routes.find(
        (r) =>
          r.type === 'route' &&
          r.route.method === 'put' &&
          r.route.operationId === 'v1_products_update',
      );
      expect(putRoute).toBeDefined();
    });

    it('registers PATCH routes', () => {
      const registry = createHonoRegistry(fullContract);

      const definitions = registry.openAPIRegistry.definitions;
      const routes = definitions.filter((d) => d.type === 'route');

      const patchRoute = routes.find(
        (r) =>
          r.type === 'route' &&
          r.route.method === 'patch' &&
          r.route.operationId === 'v1_products_patch',
      );
      expect(patchRoute).toBeDefined();
    });

    it('registers DELETE routes', () => {
      const registry = createHonoRegistry(fullContract);

      const definitions = registry.openAPIRegistry.definitions;
      const routes = definitions.filter((d) => d.type === 'route');

      const deleteRoute = routes.find(
        (r) =>
          r.type === 'route' &&
          r.route.method === 'delete' &&
          r.route.operationId === 'v1_products_delete',
      );
      expect(deleteRoute).toBeDefined();
    });
  });

  describe('request validation schemas', () => {
    it('registers body schema for POST routes', () => {
      const registry = createHonoRegistry(fullContract);

      const definitions = registry.openAPIRegistry.definitions;
      const routes = definitions.filter((d) => d.type === 'route');

      const createRoute = routes.find(
        (r) => r.type === 'route' && r.route.operationId === 'v1_products_create',
      );

      expect(createRoute).toBeDefined();
      if (createRoute && createRoute.type === 'route') {
        expect(createRoute.route.request?.body).toBeDefined();
      }
    });

    it('registers query schema for routes with query params', () => {
      const registry = createHonoRegistry(fullContract);

      const definitions = registry.openAPIRegistry.definitions;
      const routes = definitions.filter((d) => d.type === 'route');

      const listRoute = routes.find(
        (r) => r.type === 'route' && r.route.operationId === 'v1_products_list',
      );

      expect(listRoute).toBeDefined();
      if (listRoute && listRoute.type === 'route') {
        expect(listRoute.route.request?.query).toBeDefined();
      }
    });

    it('registers params schema for routes with path params', () => {
      const registry = createHonoRegistry(fullContract);

      const definitions = registry.openAPIRegistry.definitions;
      const routes = definitions.filter((d) => d.type === 'route');

      const getRoute = routes.find(
        (r) => r.type === 'route' && r.route.operationId === 'v1_products_get',
      );

      expect(getRoute).toBeDefined();
      if (getRoute && getRoute.type === 'route') {
        expect(getRoute.route.request?.params).toBeDefined();
      }
    });
  });
});
