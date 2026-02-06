import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { generateSpec, generateSpecJson } from '../../src/spec';
import { route } from '../../src/route';
import type { ApiContract, GenerateSpecOptions } from '../../src/types';

// Test schemas
const HealthSchema = z.object({ status: z.string() });
const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number(),
});
const CreateProductSchema = z.object({
  name: z.string(),
  price: z.number(),
});
const IdParamsSchema = z.object({ id: z.string() });
const PaginationSchema = z.object({
  page: z.number().optional(),
  limit: z.number().optional(),
});
const ErrorSchema = z.object({ error: z.string(), code: z.number() });

const defaultOptions: GenerateSpecOptions = {
  info: {
    title: 'Test API',
    version: '1.0.0',
  },
};

describe('generateSpec', () => {
  describe('basic structure', () => {
    it('generates valid OpenAPI 3.0 document', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            health: route.get('/health').returns(HealthSchema),
          },
        },
      };

      const spec = generateSpec(contract, defaultOptions);

      expect(spec.openapi).toBe('3.0.0');
      expect(spec.info.title).toBe('Test API');
      expect(spec.info.version).toBe('1.0.0');
    });

    it('includes info object with all fields', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            health: route.get('/health').returns(HealthSchema),
          },
        },
      };

      const spec = generateSpec(contract, {
        info: {
          title: 'My API',
          version: '2.0.0',
          description: 'A sample API',
          termsOfService: 'https://example.com/terms',
          contact: {
            name: 'API Support',
            url: 'https://example.com/support',
            email: 'support@example.com',
          },
          license: {
            name: 'MIT',
            url: 'https://opensource.org/licenses/MIT',
          },
        },
      });

      expect(spec.info.title).toBe('My API');
      expect(spec.info.version).toBe('2.0.0');
      expect(spec.info.description).toBe('A sample API');
      expect(spec.info.termsOfService).toBe('https://example.com/terms');
      expect(spec.info.contact?.name).toBe('API Support');
      expect(spec.info.license?.name).toBe('MIT');
    });

    it('includes servers when provided', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            health: route.get('/health').returns(HealthSchema),
          },
        },
      };

      const spec = generateSpec(contract, {
        ...defaultOptions,
        servers: [
          { url: 'https://api.example.com', description: 'Production' },
          { url: 'https://staging.example.com', description: 'Staging' },
        ],
      });

      expect(spec.servers).toHaveLength(2);
      expect(spec.servers?.[0]?.url).toBe('https://api.example.com');
      expect(spec.servers?.[1]?.description).toBe('Staging');
    });

    it('excludes servers when not provided', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            health: route.get('/health').returns(HealthSchema),
          },
        },
      };

      const spec = generateSpec(contract, defaultOptions);

      expect(spec.servers).toBeUndefined();
    });

    it('includes externalDocs when provided', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            health: route.get('/health').returns(HealthSchema),
          },
        },
      };

      const spec = generateSpec(contract, {
        ...defaultOptions,
        externalDocs: {
          description: 'Find more info here',
          url: 'https://docs.example.com',
        },
      });

      expect(spec.externalDocs?.description).toBe('Find more info here');
      expect(spec.externalDocs?.url).toBe('https://docs.example.com');
    });
  });

  describe('path generation', () => {
    it('generates correct path for simple route', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            health: route.get('/health').returns(HealthSchema),
          },
        },
      };

      const spec = generateSpec(contract, defaultOptions);

      expect(spec.paths['/v1/health']).toBeDefined();
      expect(spec.paths['/v1/health']?.get).toBeDefined();
    });

    it('converts :param to {param} syntax', () => {
      const contract: ApiContract = {
        v1: {
          children: {
            users: {
              routes: {
                get: route.get('/:id').params(IdParamsSchema).returns(ProductSchema),
              },
            },
          },
        },
      };

      const spec = generateSpec(contract, defaultOptions);

      expect(spec.paths['/v1/users/{id}']).toBeDefined();
      expect(spec.paths['/v1/users/:id']).toBeUndefined();
    });

    it('handles multiple path parameters', () => {
      const contract: ApiContract = {
        v1: {
          children: {
            users: {
              routes: {
                getPost: route
                  .get('/:userId/posts/:postId')
                  .params(z.object({ userId: z.string(), postId: z.string() }))
                  .returns(z.object({ content: z.string() })),
              },
            },
          },
        },
      };

      const spec = generateSpec(contract, defaultOptions);

      expect(spec.paths['/v1/users/{userId}/posts/{postId}']).toBeDefined();
    });

    it('generates paths for nested groups', () => {
      const contract: ApiContract = {
        v1: {
          children: {
            admin: {
              children: {
                users: {
                  routes: {
                    list: route.get('/').returns(z.array(ProductSchema)),
                  },
                },
              },
            },
          },
        },
      };

      const spec = generateSpec(contract, defaultOptions);

      expect(spec.paths['/v1/admin/users']).toBeDefined();
    });
  });

  describe('HTTP methods', () => {
    it('maps GET route correctly', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            get: route.get('/test').returns(HealthSchema),
          },
        },
      };

      const spec = generateSpec(contract, defaultOptions);

      expect(spec.paths['/v1/test']?.get).toBeDefined();
      expect(spec.paths['/v1/test']?.post).toBeUndefined();
    });

    it('maps POST route correctly', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            create: route.post('/test').body(CreateProductSchema).returns(ProductSchema),
          },
        },
      };

      const spec = generateSpec(contract, defaultOptions);

      expect(spec.paths['/v1/test']?.post).toBeDefined();
      expect(spec.paths['/v1/test']?.get).toBeUndefined();
    });

    it('maps PUT route correctly', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            update: route.put('/test').body(CreateProductSchema).returns(ProductSchema),
          },
        },
      };

      const spec = generateSpec(contract, defaultOptions);

      expect(spec.paths['/v1/test']?.put).toBeDefined();
    });

    it('maps PATCH route correctly', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            patch: route.patch('/test').body(CreateProductSchema).returns(ProductSchema),
          },
        },
      };

      const spec = generateSpec(contract, defaultOptions);

      expect(spec.paths['/v1/test']?.patch).toBeDefined();
    });

    it('maps DELETE route correctly', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            remove: route.delete('/test').returns(z.object({ success: z.boolean() })),
          },
        },
      };

      const spec = generateSpec(contract, defaultOptions);

      expect(spec.paths['/v1/test']?.delete).toBeDefined();
    });
  });

  describe('operation metadata', () => {
    it('generates default operationId', () => {
      const contract: ApiContract = {
        v1: {
          children: {
            products: {
              routes: {
                list: route.get('/').returns(z.array(ProductSchema)),
              },
            },
          },
        },
      };

      const spec = generateSpec(contract, defaultOptions);
      const operation = spec.paths['/v1/products']?.get;

      expect(operation?.operationId).toBe('v1_products_list');
    });

    it('uses custom operationId when provided', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            list: route
              .get('/products')
              .withOperationId('getAllProducts')
              .returns(z.array(ProductSchema)),
          },
        },
      };

      const spec = generateSpec(contract, defaultOptions);
      const operation = spec.paths['/v1/products']?.get;

      expect(operation?.operationId).toBe('getAllProducts');
    });

    it('includes summary', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            list: route
              .get('/products')
              .withSummary('Get all products')
              .returns(z.array(ProductSchema)),
          },
        },
      };

      const spec = generateSpec(contract, defaultOptions);
      const operation = spec.paths['/v1/products']?.get;

      expect(operation?.summary).toBe('Get all products');
    });

    it('includes description', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            list: route
              .get('/products')
              .withDescription('Returns a paginated list of all products')
              .returns(z.array(ProductSchema)),
          },
        },
      };

      const spec = generateSpec(contract, defaultOptions);
      const operation = spec.paths['/v1/products']?.get;

      expect(operation?.description).toBe('Returns a paginated list of all products');
    });

    it('includes explicit tags', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            list: route
              .get('/products')
              .withTags('Products', 'Catalog')
              .returns(z.array(ProductSchema)),
          },
        },
      };

      const spec = generateSpec(contract, defaultOptions);
      const operation = spec.paths['/v1/products']?.get;

      expect(operation?.tags).toEqual(['Products', 'Catalog']);
    });

    it('auto-generates tag from group when no explicit tags', () => {
      const contract: ApiContract = {
        v1: {
          children: {
            products: {
              routes: {
                list: route.get('/').returns(z.array(ProductSchema)),
              },
            },
          },
        },
      };

      const spec = generateSpec(contract, defaultOptions);
      const operation = spec.paths['/v1/products']?.get;

      expect(operation?.tags).toEqual(['products']);
    });

    it('includes deprecated flag', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            oldRoute: route.get('/old').markDeprecated().returns(HealthSchema),
          },
        },
      };

      const spec = generateSpec(contract, defaultOptions);
      const operation = spec.paths['/v1/old']?.get;

      expect(operation?.deprecated).toBe(true);
    });
  });

  describe('request body', () => {
    it('includes request body for POST', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            create: route.post('/products').body(CreateProductSchema).returns(ProductSchema),
          },
        },
      };

      const spec = generateSpec(contract, defaultOptions);
      const operation = spec.paths['/v1/products']?.post;

      expect(operation?.requestBody).toBeDefined();
      expect(operation?.requestBody?.required).toBe(true);
      expect(operation?.requestBody?.content['application/json']).toBeDefined();
    });

    it('includes request body for PUT', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            update: route.put('/products/:id').body(CreateProductSchema).returns(ProductSchema),
          },
        },
      };

      const spec = generateSpec(contract, defaultOptions);
      const operation = spec.paths['/v1/products/{id}']?.put;

      expect(operation?.requestBody).toBeDefined();
    });

    it('includes request body for PATCH', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            patch: route.patch('/products/:id').body(CreateProductSchema).returns(ProductSchema),
          },
        },
      };

      const spec = generateSpec(contract, defaultOptions);
      const operation = spec.paths['/v1/products/{id}']?.patch;

      expect(operation?.requestBody).toBeDefined();
    });

    it('excludes request body for GET', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            // Technically invalid, but testing the guard
            get: route.get('/products').returns(ProductSchema),
          },
        },
      };

      const spec = generateSpec(contract, defaultOptions);
      const operation = spec.paths['/v1/products']?.get;

      expect(operation?.requestBody).toBeUndefined();
    });

    it('excludes request body for DELETE', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            remove: route.delete('/products/:id').returns(z.object({ success: z.boolean() })),
          },
        },
      };

      const spec = generateSpec(contract, defaultOptions);
      const operation = spec.paths['/v1/products/{id}']?.delete;

      expect(operation?.requestBody).toBeUndefined();
    });
  });

  describe('parameters', () => {
    it('generates path parameters', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            get: route.get('/products/:id').params(IdParamsSchema).returns(ProductSchema),
          },
        },
      };

      const spec = generateSpec(contract, defaultOptions);
      const operation = spec.paths['/v1/products/{id}']?.get;

      expect(operation?.parameters).toHaveLength(1);
      expect(operation?.parameters?.[0]).toEqual(
        expect.objectContaining({
          name: 'id',
          in: 'path',
          required: true,
        }),
      );
    });

    it('generates query parameters', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            list: route.get('/products').query(PaginationSchema).returns(z.array(ProductSchema)),
          },
        },
      };

      const spec = generateSpec(contract, defaultOptions);
      const operation = spec.paths['/v1/products']?.get;

      expect(operation?.parameters).toHaveLength(2);
      const pageParam = operation?.parameters?.find((p) => p.name === 'page');
      const limitParam = operation?.parameters?.find((p) => p.name === 'limit');

      expect(pageParam).toBeDefined();
      expect(limitParam).toBeDefined();
      expect(pageParam?.in).toBe('query');
      expect(pageParam?.required).toBe(false); // Optional in schema
    });

    it('marks required query parameters correctly', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            search: route
              .get('/search')
              .query(z.object({ q: z.string(), limit: z.number().optional() }))
              .returns(z.array(ProductSchema)),
          },
        },
      };

      const spec = generateSpec(contract, defaultOptions);
      const operation = spec.paths['/v1/search']?.get;

      const qParam = operation?.parameters?.find((p) => p.name === 'q');
      const limitParam = operation?.parameters?.find((p) => p.name === 'limit');

      expect(qParam?.required).toBe(true);
      expect(limitParam?.required).toBe(false);
    });

    it('combines path and query parameters', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            getUserPosts: route
              .get('/users/:userId/posts')
              .params(z.object({ userId: z.string() }))
              .query(z.object({ page: z.number().optional() }))
              .returns(z.array(z.object({ title: z.string() }))),
          },
        },
      };

      const spec = generateSpec(contract, defaultOptions);
      const operation = spec.paths['/v1/users/{userId}/posts']?.get;

      expect(operation?.parameters).toHaveLength(2);

      const pathParam = operation?.parameters?.find((p) => p.in === 'path');
      const queryParam = operation?.parameters?.find((p) => p.in === 'query');

      expect(pathParam?.name).toBe('userId');
      expect(queryParam?.name).toBe('page');
    });
  });

  describe('security schemes', () => {
    it('adds bearer security scheme when used', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            protected: route.get('/protected').withAuth('bearer').returns(HealthSchema),
          },
        },
      };

      const spec = generateSpec(contract, defaultOptions);

      expect(spec.components?.securitySchemes?.Bearer).toEqual({
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      });

      const operation = spec.paths['/v1/protected']?.get;
      expect(operation?.security).toEqual([{ Bearer: [] }]);
    });

    it('adds apiKey security scheme when used', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            protected: route.get('/protected').withAuth('apiKey').returns(HealthSchema),
          },
        },
      };

      const spec = generateSpec(contract, defaultOptions);

      expect(spec.components?.securitySchemes?.ApiKey).toEqual({
        type: 'apiKey',
        name: 'X-API-Key',
        in: 'header',
      });

      const operation = spec.paths['/v1/protected']?.get;
      expect(operation?.security).toEqual([{ ApiKey: [] }]);
    });

    it('adds basic security scheme when used', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            protected: route.get('/protected').withAuth('basic').returns(HealthSchema),
          },
        },
      };

      const spec = generateSpec(contract, defaultOptions);

      expect(spec.components?.securitySchemes?.Basic).toEqual({
        type: 'http',
        scheme: 'basic',
      });

      const operation = spec.paths['/v1/protected']?.get;
      expect(operation?.security).toEqual([{ Basic: [] }]);
    });

    it('does not add security for none auth', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            public: route.get('/public').withAuth('none').returns(HealthSchema),
          },
        },
      };

      const spec = generateSpec(contract, defaultOptions);

      const operation = spec.paths['/v1/public']?.get;
      expect(operation?.security).toBeUndefined();
    });

    it('does not add security when no auth specified', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            public: route.get('/public').returns(HealthSchema),
          },
        },
      };

      const spec = generateSpec(contract, defaultOptions);

      const operation = spec.paths['/v1/public']?.get;
      expect(operation?.security).toBeUndefined();
    });

    it('only adds used security schemes', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            bearer: route.get('/bearer').withAuth('bearer').returns(HealthSchema),
            // No apiKey or basic auth routes
          },
        },
      };

      const spec = generateSpec(contract, defaultOptions);

      expect(spec.components?.securitySchemes?.Bearer).toBeDefined();
      expect(spec.components?.securitySchemes?.ApiKey).toBeUndefined();
      expect(spec.components?.securitySchemes?.Basic).toBeUndefined();
    });
  });

  describe('responses', () => {
    it('includes default 200 response', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            get: route.get('/test').returns(HealthSchema),
          },
        },
      };

      const spec = generateSpec(contract, defaultOptions);
      const operation = spec.paths['/v1/test']?.get;

      expect(operation?.responses['200']).toBeDefined();
      expect(operation?.responses['200'].description).toBe('Successful response');
      expect(operation?.responses['200'].content?.['application/json']).toBeDefined();
    });

    it('includes additional response codes', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            get: route
              .get('/products/:id')
              .params(IdParamsSchema)
              .withResponses({
                404: ErrorSchema,
                500: ErrorSchema,
              })
              .returns(ProductSchema),
          },
        },
      };

      const spec = generateSpec(contract, defaultOptions);
      const operation = spec.paths['/v1/products/{id}']?.get;

      expect(operation?.responses['200']).toBeDefined();
      expect(operation?.responses['404']).toBeDefined();
      expect(operation?.responses['500']).toBeDefined();
      expect(operation?.responses['404'].description).toBe('Response 404');
    });
  });

  describe('tags collection', () => {
    it('collects all unique tags from contract', () => {
      const contract: ApiContract = {
        v1: {
          children: {
            products: {
              tags: ['Products'],
              routes: {
                list: route.get('/').returns(z.array(ProductSchema)),
              },
            },
            users: {
              tags: ['Users'],
              routes: {
                list: route.get('/').returns(z.array(z.object({ name: z.string() }))),
              },
            },
          },
        },
      };

      const spec = generateSpec(contract, defaultOptions);

      expect(spec.tags).toBeDefined();
      expect(spec.tags?.map((t) => t.name)).toContain('Products');
      expect(spec.tags?.map((t) => t.name)).toContain('Users');
    });

    it('excludes tags when none defined', () => {
      const contract: ApiContract = {
        v1: {
          routes: {
            health: route.get('/health').returns(HealthSchema),
          },
        },
      };

      const spec = generateSpec(contract, defaultOptions);

      expect(spec.tags).toBeUndefined();
    });
  });
});

describe('schema descriptions', () => {
  it('preserves field descriptions in response schema', () => {
    const DescribedSchema = z.object({
      id: z.string().describe('Unique identifier'),
      name: z.string().describe('Display name'),
      count: z.number().describe('Total count'),
    });

    const contract: ApiContract = {
      v1: {
        routes: {
          get: route.get('/test').returns(DescribedSchema),
        },
      },
    };

    const spec = generateSpec(contract, defaultOptions);
    const responseSchema =
      spec.paths['/v1/test']?.get?.responses['200']?.content?.['application/json']?.schema;

    expect(responseSchema?.properties?.id?.description).toBe('Unique identifier');
    expect(responseSchema?.properties?.name?.description).toBe('Display name');
    expect(responseSchema?.properties?.count?.description).toBe('Total count');
  });

  it('preserves field descriptions in request body schema', () => {
    const CreateSchema = z.object({
      name: z.string().describe('Product name'),
      price: z.number().describe('Price in cents'),
    });

    const contract: ApiContract = {
      v1: {
        routes: {
          create: route
            .post('/test')
            .body(CreateSchema)
            .returns(z.object({ id: z.string() })),
        },
      },
    };

    const spec = generateSpec(contract, defaultOptions);
    const bodySchema =
      spec.paths['/v1/test']?.post?.requestBody?.content['application/json']?.schema;

    expect(bodySchema?.properties?.name?.description).toBe('Product name');
    expect(bodySchema?.properties?.price?.description).toBe('Price in cents');
  });

  it('preserves descriptions in query parameter schemas', () => {
    const QuerySchema = z.object({
      page: z.number().describe('Page number'),
      limit: z.number().describe('Items per page'),
    });

    const contract: ApiContract = {
      v1: {
        routes: {
          list: route
            .get('/test')
            .query(QuerySchema)
            .returns(z.array(z.object({}))),
        },
      },
    };

    const spec = generateSpec(contract, defaultOptions);
    const params = spec.paths['/v1/test']?.get?.parameters;

    const pageParam = params?.find((p) => p.name === 'page');
    const limitParam = params?.find((p) => p.name === 'limit');

    expect(pageParam?.schema?.description).toBe('Page number');
    expect(limitParam?.schema?.description).toBe('Items per page');
  });

  it('preserves descriptions in path parameter schemas', () => {
    const ParamsSchema = z.object({
      id: z.string().describe('Resource identifier'),
    });

    const contract: ApiContract = {
      v1: {
        routes: {
          get: route.get('/test/:id').params(ParamsSchema).returns(z.object({})),
        },
      },
    };

    const spec = generateSpec(contract, defaultOptions);
    const params = spec.paths['/v1/test/{id}']?.get?.parameters;

    const idParam = params?.find((p) => p.name === 'id');
    expect(idParam?.schema?.description).toBe('Resource identifier');
  });

  it('preserves nested object descriptions', () => {
    const NestedSchema = z.object({
      user: z
        .object({
          name: z.string().describe('User name'),
          email: z.string().describe('Email address'),
        })
        .describe('User details'),
    });

    const contract: ApiContract = {
      v1: {
        routes: {
          get: route.get('/test').returns(NestedSchema),
        },
      },
    };

    const spec = generateSpec(contract, defaultOptions);
    const responseSchema =
      spec.paths['/v1/test']?.get?.responses['200']?.content?.['application/json']?.schema;

    expect(responseSchema?.properties?.user?.description).toBe('User details');
    expect(responseSchema?.properties?.user?.properties?.name?.description).toBe('User name');
    expect(responseSchema?.properties?.user?.properties?.email?.description).toBe('Email address');
  });

  it('preserves array item descriptions', () => {
    const ArraySchema = z.object({
      items: z.array(z.string().describe('Item value')).describe('List of items'),
    });

    const contract: ApiContract = {
      v1: {
        routes: {
          get: route.get('/test').returns(ArraySchema),
        },
      },
    };

    const spec = generateSpec(contract, defaultOptions);
    const responseSchema =
      spec.paths['/v1/test']?.get?.responses['200']?.content?.['application/json']?.schema;

    expect(responseSchema?.properties?.items?.description).toBe('List of items');
    expect(responseSchema?.properties?.items?.items?.description).toBe('Item value');
  });
});

describe('generateSpecJson', () => {
  it('returns valid JSON string', () => {
    const contract: ApiContract = {
      v1: {
        routes: {
          health: route.get('/health').returns(HealthSchema),
        },
      },
    };

    const json = generateSpecJson(contract, defaultOptions);

    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('generates pretty JSON by default', () => {
    const contract: ApiContract = {
      v1: {
        routes: {
          health: route.get('/health').returns(HealthSchema),
        },
      },
    };

    const json = generateSpecJson(contract, defaultOptions);

    expect(json).toContain('\n');
    expect(json).toContain('  '); // Indentation
  });

  it('generates minified JSON when pretty=false', () => {
    const contract: ApiContract = {
      v1: {
        routes: {
          health: route.get('/health').returns(HealthSchema),
        },
      },
    };

    const json = generateSpecJson(contract, defaultOptions, false);

    expect(json).not.toContain('\n');
    expect(json).not.toContain('  ');
  });

  it('produces same data as generateSpec', () => {
    const contract: ApiContract = {
      v1: {
        routes: {
          health: route.get('/health').returns(HealthSchema),
        },
      },
    };

    const spec = generateSpec(contract, defaultOptions);
    const json = generateSpecJson(contract, defaultOptions);
    const parsed = JSON.parse(json);

    expect(parsed.openapi).toBe(spec.openapi);
    expect(parsed.info.title).toBe(spec.info.title);
  });
});
