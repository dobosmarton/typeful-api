import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { route } from '../../src/route';

describe('route builder', () => {
  describe('HTTP method factories', () => {
    it('creates a GET route', () => {
      const getRoute = route.get('/users').returns(z.string());
      expect(getRoute.method).toBe('get');
      expect(getRoute.path).toBe('/users');
    });

    it('creates a POST route', () => {
      const postRoute = route.post('/users').returns(z.string());
      expect(postRoute.method).toBe('post');
      expect(postRoute.path).toBe('/users');
    });

    it('creates a PUT route', () => {
      const putRoute = route.put('/users/:id').returns(z.string());
      expect(putRoute.method).toBe('put');
      expect(putRoute.path).toBe('/users/:id');
    });

    it('creates a PATCH route', () => {
      const patchRoute = route.patch('/users/:id').returns(z.string());
      expect(patchRoute.method).toBe('patch');
      expect(patchRoute.path).toBe('/users/:id');
    });

    it('creates a DELETE route', () => {
      const deleteRoute = route.delete('/users/:id').returns(z.string());
      expect(deleteRoute.method).toBe('delete');
      expect(deleteRoute.path).toBe('/users/:id');
    });
  });

  describe('schema definitions', () => {
    it('sets body schema', () => {
      const bodySchema = z.object({ name: z.string() });
      const postRoute = route.post('/users').body(bodySchema).returns(z.string());

      expect(postRoute.body).toBeDefined();
      // Verify the schema works
      const result = postRoute.body?.safeParse({ name: 'test' });
      expect(result?.success).toBe(true);
    });

    it('sets query schema', () => {
      const querySchema = z.object({ page: z.number().optional() });
      const getRoute = route.get('/users').query(querySchema).returns(z.string());

      expect(getRoute.query).toBeDefined();
      const result = getRoute.query?.safeParse({ page: 1 });
      expect(result?.success).toBe(true);
    });

    it('sets params schema', () => {
      const paramsSchema = z.object({ id: z.uuid() });
      const getRoute = route.get('/users/:id').params(paramsSchema).returns(z.string());

      expect(getRoute.params).toBeDefined();
      const result = getRoute.params?.safeParse({ id: '123e4567-e89b-12d3-a456-426614174000' });
      expect(result?.success).toBe(true);
    });

    it('sets response schema via returns()', () => {
      const responseSchema = z.object({ id: z.string(), name: z.string() });
      const getRoute = route.get('/users/:id').returns(responseSchema);

      expect(getRoute.response).toBeDefined();
      const result = getRoute.response.safeParse({ id: '1', name: 'test' });
      expect(result.success).toBe(true);
    });
  });

  describe('metadata', () => {
    it('sets auth type', () => {
      const getRoute = route.get('/users').withAuth('bearer').returns(z.string());
      expect(getRoute.auth).toBe('bearer');
    });

    it('sets summary', () => {
      const getRoute = route.get('/users').withSummary('Get all users').returns(z.string());
      expect(getRoute.summary).toBe('Get all users');
    });

    it('sets description', () => {
      const getRoute = route
        .get('/users')
        .withDescription('Returns a list of all users in the system')
        .returns(z.string());
      expect(getRoute.description).toBe('Returns a list of all users in the system');
    });

    it('sets single tag', () => {
      const getRoute = route.get('/users').withTags('Users').returns(z.string());
      expect(getRoute.tags).toEqual(['Users']);
    });

    it('sets multiple tags', () => {
      const getRoute = route.get('/users').withTags('Users', 'Admin').returns(z.string());
      expect(getRoute.tags).toEqual(['Users', 'Admin']);
    });

    it('accumulates tags across multiple calls', () => {
      const getRoute = route.get('/users').withTags('Users').withTags('Admin').returns(z.string());
      expect(getRoute.tags).toEqual(['Users', 'Admin']);
    });

    it('sets deprecated flag', () => {
      const getRoute = route.get('/users').markDeprecated().returns(z.string());
      expect(getRoute.deprecated).toBe(true);
    });

    it('sets custom operationId', () => {
      const getRoute = route.get('/users').withOperationId('listAllUsers').returns(z.string());
      expect(getRoute.operationId).toBe('listAllUsers');
    });
  });

  describe('additional responses', () => {
    it('sets additional response codes', () => {
      const errorSchema = z.object({ error: z.string() });
      const getRoute = route
        .get('/users/:id')
        .withResponses({ 404: errorSchema, 500: errorSchema })
        .returns(z.string());

      expect(getRoute.responses).toBeDefined();
      expect(getRoute.responses?.[404]).toBeDefined();
      expect(getRoute.responses?.[500]).toBeDefined();
    });

    it('accumulates responses across multiple calls', () => {
      const notFoundSchema = z.object({ error: z.string() });
      const serverErrorSchema = z.object({ message: z.string() });

      const getRoute = route
        .get('/users/:id')
        .withResponses({ 404: notFoundSchema })
        .withResponses({ 500: serverErrorSchema })
        .returns(z.string());

      expect(getRoute.responses?.[404]).toBeDefined();
      expect(getRoute.responses?.[500]).toBeDefined();
    });
  });

  describe('method chaining', () => {
    it('supports full method chain', () => {
      const bodySchema = z.object({ name: z.string() });
      const querySchema = z.object({ include: z.string().optional() });
      const paramsSchema = z.object({ id: z.string() });
      const responseSchema = z.object({ id: z.string(), name: z.string() });
      const errorSchema = z.object({ error: z.string() });

      const fullRoute = route
        .post('/users/:id')
        .body(bodySchema)
        .query(querySchema)
        .params(paramsSchema)
        .withAuth('bearer')
        .withSummary('Update a user')
        .withDescription('Updates an existing user by ID')
        .withTags('Users', 'Admin')
        .withOperationId('updateUser')
        .withResponses({ 404: errorSchema })
        .returns(responseSchema);

      expect(fullRoute.method).toBe('post');
      expect(fullRoute.path).toBe('/users/:id');
      expect(fullRoute.body).toBeDefined();
      expect(fullRoute.query).toBeDefined();
      expect(fullRoute.params).toBeDefined();
      expect(fullRoute.auth).toBe('bearer');
      expect(fullRoute.summary).toBe('Update a user');
      expect(fullRoute.description).toBe('Updates an existing user by ID');
      expect(fullRoute.tags).toEqual(['Users', 'Admin']);
      expect(fullRoute.operationId).toBe('updateUser');
      expect(fullRoute.responses?.[404]).toBeDefined();
      expect(fullRoute.response).toBeDefined();
    });

    it('works with minimal configuration', () => {
      const minimalRoute = route.get('/health').returns(z.string());

      expect(minimalRoute.method).toBe('get');
      expect(minimalRoute.path).toBe('/health');
      expect(minimalRoute.response).toBeDefined();
      expect(minimalRoute.body).toBeUndefined();
      expect(minimalRoute.query).toBeUndefined();
      expect(minimalRoute.params).toBeUndefined();
      expect(minimalRoute.auth).toBeUndefined();
      expect(minimalRoute.summary).toBeUndefined();
      expect(minimalRoute.description).toBeUndefined();
      expect(minimalRoute.tags).toBeUndefined();
      expect(minimalRoute.deprecated).toBeUndefined();
      expect(minimalRoute.operationId).toBeUndefined();
    });
  });

  describe('builder immutability', () => {
    it('does not mutate original builder when chaining', () => {
      const baseBuilder = route.get('/users').withSummary('Base summary');
      const derivedRoute1 = baseBuilder.withTags('Tag1').returns(z.string());
      const derivedRoute2 = baseBuilder.withTags('Tag2').returns(z.string());

      expect(derivedRoute1.tags).toEqual(['Tag1']);
      expect(derivedRoute2.tags).toEqual(['Tag2']);
    });

    it('does not share state between different routes', () => {
      const route1 = route.get('/route1').withAuth('bearer').returns(z.string());
      const route2 = route.get('/route2').withAuth('apiKey').returns(z.string());

      expect(route1.auth).toBe('bearer');
      expect(route2.auth).toBe('apiKey');
    });
  });

  describe('auth types', () => {
    it('supports bearer auth', () => {
      const r = route.get('/').withAuth('bearer').returns(z.string());
      expect(r.auth).toBe('bearer');
    });

    it('supports apiKey auth', () => {
      const r = route.get('/').withAuth('apiKey').returns(z.string());
      expect(r.auth).toBe('apiKey');
    });

    it('supports basic auth', () => {
      const r = route.get('/').withAuth('basic').returns(z.string());
      expect(r.auth).toBe('basic');
    });

    it('supports none auth', () => {
      const r = route.get('/').withAuth('none').returns(z.string());
      expect(r.auth).toBe('none');
    });
  });

  describe('order-independent chaining (FinalRoute)', () => {
    it('allows chaining .withSummary() after .returns()', () => {
      const r = route.get('/health').returns(z.string()).withSummary('Health check');
      expect(r.summary).toBe('Health check');
      expect(r.method).toBe('get');
    });

    it('allows chaining .withAuth() after .returns()', () => {
      const r = route.post('/users').returns(z.string()).withAuth('bearer');
      expect(r.auth).toBe('bearer');
    });

    it('allows chaining .withTags() after .returns()', () => {
      const r = route.get('/products').returns(z.string()).withTags('products', 'catalog');
      expect(r.tags).toEqual(['products', 'catalog']);
    });

    it('allows chaining .withDescription() after .returns()', () => {
      const r = route.get('/users').returns(z.string()).withDescription('Returns all users');
      expect(r.description).toBe('Returns all users');
    });

    it('allows chaining .markDeprecated() after .returns()', () => {
      const r = route.get('/old-endpoint').returns(z.string()).markDeprecated();
      expect(r.deprecated).toBe(true);
    });

    it('allows chaining .withOperationId() after .returns()', () => {
      const r = route.get('/users').returns(z.string()).withOperationId('listUsers');
      expect(r.operationId).toBe('listUsers');
    });

    it('allows chaining .withResponses() after .returns()', () => {
      const errorSchema = z.object({ error: z.string() });
      const r = route.get('/users/:id').returns(z.string()).withResponses({ 404: errorSchema });
      expect(r.responses?.[404]).toBeDefined();
    });

    it('allows multiple chained methods after .returns()', () => {
      const r = route
        .get('/products')
        .returns(z.string())
        .withSummary('List products')
        .withDescription('Returns a paginated list of products')
        .withTags('products')
        .withAuth('bearer');

      expect(r.summary).toBe('List products');
      expect(r.description).toBe('Returns a paginated list of products');
      expect(r.tags).toEqual(['products']);
      expect(r.auth).toBe('bearer');
    });

    it('maintains immutability after .returns()', () => {
      const baseRoute = route.get('/users').returns(z.string());
      const route1 = baseRoute.withSummary('Summary 1');
      const route2 = baseRoute.withSummary('Summary 2');

      expect(route1.summary).toBe('Summary 1');
      expect(route2.summary).toBe('Summary 2');
      expect(baseRoute.summary).toBeUndefined();
    });

    it('accumulates tags across multiple .withTags() calls after .returns()', () => {
      const r = route.get('/users').returns(z.string()).withTags('Users').withTags('Admin');
      expect(r.tags).toEqual(['Users', 'Admin']);
    });

    it('preserves response schema when chaining after .returns()', () => {
      const responseSchema = z.object({ id: z.string(), name: z.string() });
      const r = route
        .get('/users')
        .returns(responseSchema)
        .withSummary('Get users')
        .withAuth('bearer');

      expect(r.response).toBeDefined();
      const result = r.response.safeParse({ id: '1', name: 'test' });
      expect(result.success).toBe(true);
    });

    it('satisfies RouteDefinition structure for framework adapters', () => {
      const r = route
        .get('/health')
        .returns(z.string())
        .withSummary('Health check')
        .withTags('system');

      // FinalRoute should have all RouteDefinition properties
      expect(r.method).toBe('get');
      expect(r.path).toBe('/health');
      expect(r.response).toBeDefined();
      expect(r.summary).toBe('Health check');
      expect(r.tags).toEqual(['system']);
    });
  });
});
