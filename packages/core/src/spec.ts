import type { ZodSchema } from 'zod';
import { extractTags, flattenRoutes } from './contract';
import type {
  ApiContract,
  AuthType,
  GenerateSpecOptions,
  RouteDefinition,
} from './types';

/**
 * OpenAPI 3.0 document structure
 */
export type OpenApiDocument = {
  openapi: '3.0.0';
  info: {
    title: string;
    version: string;
    description?: string;
    termsOfService?: string;
    contact?: {
      name?: string;
      url?: string;
      email?: string;
    };
    license?: {
      name: string;
      url?: string;
    };
  };
  servers?: Array<{
    url: string;
    description?: string;
  }>;
  paths: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, JsonSchema>;
    securitySchemes?: Record<string, SecurityScheme>;
  };
  tags?: Array<{
    name: string;
    description?: string;
  }>;
  externalDocs?: {
    description?: string;
    url: string;
  };
};

type PathItem = {
  get?: Operation;
  post?: Operation;
  put?: Operation;
  patch?: Operation;
  delete?: Operation;
};

type Operation = {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  deprecated?: boolean;
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses: Record<string, Response>;
  security?: Array<Record<string, string[]>>;
};

type Parameter = {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  schema: JsonSchema;
};

type RequestBody = {
  required?: boolean;
  content: {
    'application/json': {
      schema: JsonSchema;
    };
  };
};

type Response = {
  description: string;
  content?: {
    'application/json': {
      schema: JsonSchema;
    };
  };
};

type SecurityScheme = {
  type: 'http' | 'apiKey' | 'oauth2' | 'openIdConnect';
  scheme?: string;
  bearerFormat?: string;
  name?: string;
  in?: 'query' | 'header' | 'cookie';
};

type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  format?: string;
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  nullable?: boolean;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
  $ref?: string;
  additionalProperties?: boolean | JsonSchema;
};

/**
 * Convert a Zod schema to JSON Schema
 * This is a simplified converter - for full support, use zod-to-json-schema
 */
function zodToJsonSchema(schema: ZodSchema): JsonSchema {
  // Get the underlying Zod definition
  const def = (schema as unknown as { _def: ZodDef })._def;

  return convertZodDef(def);
}

type ZodDef = {
  typeName: string;
  shape?: () => Record<string, ZodSchema>;
  type?: ZodSchema;
  innerType?: ZodSchema;
  options?: ZodSchema[];
  values?: readonly string[];
  checks?: Array<{ kind: string; value?: unknown }>;
  defaultValue?: () => unknown;
  description?: string;
};

function convertZodDef(def: ZodDef): JsonSchema {
  const result: JsonSchema = {};

  if (def.description) {
    result.description = def.description;
  }

  switch (def.typeName) {
    case 'ZodString':
      result.type = 'string';
      applyStringChecks(result, def.checks);
      break;

    case 'ZodNumber':
      result.type = 'number';
      applyNumberChecks(result, def.checks);
      break;

    case 'ZodBoolean':
      result.type = 'boolean';
      break;

    case 'ZodNull':
      result.type = 'null';
      break;

    case 'ZodArray':
      result.type = 'array';
      if (def.type) {
        result.items = zodToJsonSchema(def.type);
      }
      break;

    case 'ZodObject':
      result.type = 'object';
      if (def.shape) {
        const shape = def.shape();
        result.properties = {};
        result.required = [];

        for (const [key, value] of Object.entries(shape)) {
          result.properties[key] = zodToJsonSchema(value);
          // Check if the field is required (not optional)
          const valueDef = (value as unknown as { _def: ZodDef })._def;
          if (valueDef.typeName !== 'ZodOptional' && valueDef.typeName !== 'ZodDefault') {
            result.required.push(key);
          }
        }

        if (result.required.length === 0) {
          delete result.required;
        }
      }
      break;

    case 'ZodEnum':
      result.type = 'string';
      if (def.values) {
        result.enum = [...def.values];
      }
      break;

    case 'ZodNativeEnum':
      result.type = 'string';
      break;

    case 'ZodUnion':
      if (def.options) {
        result.oneOf = def.options.map(zodToJsonSchema);
      }
      break;

    case 'ZodOptional':
      if (def.innerType) {
        return zodToJsonSchema(def.innerType);
      }
      break;

    case 'ZodNullable':
      if (def.innerType) {
        const inner = zodToJsonSchema(def.innerType);
        return { ...inner, nullable: true };
      }
      break;

    case 'ZodDefault':
      if (def.innerType) {
        const inner = zodToJsonSchema(def.innerType);
        if (def.defaultValue) {
          inner.default = def.defaultValue();
        }
        return inner;
      }
      break;

    case 'ZodLiteral':
      // Handle literal types
      result.enum = [(def as unknown as { value: unknown }).value];
      break;

    case 'ZodRecord':
      result.type = 'object';
      result.additionalProperties = true;
      break;

    case 'ZodAny':
    case 'ZodUnknown':
      // No schema restriction
      break;

    default:
      // For unsupported types, return empty schema
      break;
  }

  return result;
}

function applyStringChecks(
  schema: JsonSchema,
  checks?: Array<{ kind: string; value?: unknown }>,
) {
  if (!checks) return;

  for (const check of checks) {
    switch (check.kind) {
      case 'min':
        schema.minLength = check.value as number;
        break;
      case 'max':
        schema.maxLength = check.value as number;
        break;
      case 'email':
        schema.format = 'email';
        break;
      case 'url':
        schema.format = 'uri';
        break;
      case 'uuid':
        schema.format = 'uuid';
        break;
      case 'datetime':
        schema.format = 'date-time';
        break;
      case 'regex':
        schema.pattern = String((check as { regex: RegExp }).regex);
        break;
    }
  }
}

function applyNumberChecks(
  schema: JsonSchema,
  checks?: Array<{ kind: string; value?: unknown }>,
) {
  if (!checks) return;

  for (const check of checks) {
    switch (check.kind) {
      case 'min':
        schema.minimum = check.value as number;
        break;
      case 'max':
        schema.maximum = check.value as number;
        break;
      case 'int':
        schema.type = 'integer';
        break;
    }
  }
}

/**
 * Get the security scheme for an auth type
 */
function getSecurityScheme(auth: AuthType): SecurityScheme | null {
  switch (auth) {
    case 'bearer':
      return {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      };
    case 'apiKey':
      return {
        type: 'apiKey',
        name: 'X-API-Key',
        in: 'header',
      };
    case 'basic':
      return {
        type: 'http',
        scheme: 'basic',
      };
    default:
      return null;
  }
}

/**
 * Convert a path with :param syntax to OpenAPI {param} syntax
 */
function convertPathParams(path: string): string {
  return path.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '{$1}');
}

/**
 * Generate parameter definitions from a route
 */
function generateParameters(route: RouteDefinition): Parameter[] {
  const parameters: Parameter[] = [];

  // Path parameters
  if (route.params) {
    const paramSchema = zodToJsonSchema(route.params);
    if (paramSchema.properties) {
      for (const [name, schema] of Object.entries(paramSchema.properties)) {
        parameters.push({
          name,
          in: 'path',
          required: true,
          schema: schema as JsonSchema,
        });
      }
    }
  }

  // Query parameters
  if (route.query) {
    const querySchema = zodToJsonSchema(route.query);
    if (querySchema.properties) {
      const required = querySchema.required ?? [];
      for (const [name, schema] of Object.entries(querySchema.properties)) {
        parameters.push({
          name,
          in: 'query',
          required: required.includes(name),
          schema: schema as JsonSchema,
        });
      }
    }
  }

  return parameters;
}

/**
 * Generate an OpenAPI specification from an API contract
 *
 * @example
 * ```ts
 * const spec = generateSpec(api, {
 *   info: {
 *     title: 'My API',
 *     version: '1.0.0',
 *     description: 'A sample API',
 *   },
 *   servers: [{ url: 'https://api.example.com' }],
 * });
 * ```
 */
export function generateSpec(
  contract: ApiContract,
  options: GenerateSpecOptions,
): OpenApiDocument {
  const flatRoutes = flattenRoutes(contract);
  const allTags = extractTags(contract);

  const doc: OpenApiDocument = {
    openapi: '3.0.0',
    info: options.info,
    paths: {},
    components: {
      schemas: {},
      securitySchemes: {},
    },
  };

  if (options.servers?.length) {
    doc.servers = options.servers;
  }

  if (options.externalDocs) {
    doc.externalDocs = options.externalDocs;
  }

  if (allTags.length > 0) {
    doc.tags = allTags.map((name) => ({ name }));
  }

  // Track which security schemes are used
  const usedSecuritySchemes = new Set<AuthType>();

  // Generate paths
  for (const { route, fullPath, version, group, name } of flatRoutes) {
    const openApiPath = convertPathParams(fullPath);

    if (!doc.paths[openApiPath]) {
      doc.paths[openApiPath] = {};
    }

    const operation: Operation = {
      operationId: route.operationId ?? `${version}_${group.join('_')}_${name}`,
      responses: {
        '200': {
          description: 'Successful response',
          content: {
            'application/json': {
              schema: zodToJsonSchema(route.response),
            },
          },
        },
      },
    };

    if (route.summary) {
      operation.summary = route.summary;
    }

    if (route.description) {
      operation.description = route.description;
    }

    if (route.tags?.length) {
      operation.tags = [...route.tags];
    } else if (group.length > 0) {
      // Auto-generate tag from group path
      operation.tags = [group[0] as string];
    }

    if (route.deprecated) {
      operation.deprecated = true;
    }

    // Parameters
    const parameters = generateParameters(route);
    if (parameters.length > 0) {
      operation.parameters = parameters;
    }

    // Request body
    if (route.body && ['post', 'put', 'patch'].includes(route.method)) {
      operation.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: zodToJsonSchema(route.body),
          },
        },
      };
    }

    // Security
    if (route.auth && route.auth !== 'none') {
      usedSecuritySchemes.add(route.auth);
      const schemeName =
        route.auth === 'bearer'
          ? 'Bearer'
          : route.auth === 'apiKey'
            ? 'ApiKey'
            : 'Basic';
      operation.security = [{ [schemeName]: [] }];
    }

    // Additional responses
    if (route.responses) {
      for (const [code, schema] of Object.entries(route.responses)) {
        operation.responses[code] = {
          description: `Response ${code}`,
          content: {
            'application/json': {
              schema: zodToJsonSchema(schema),
            },
          },
        };
      }
    }

    doc.paths[openApiPath]![route.method] = operation;
  }

  // Add security schemes
  for (const auth of usedSecuritySchemes) {
    const scheme = getSecurityScheme(auth);
    if (scheme && doc.components?.securitySchemes) {
      const schemeName =
        auth === 'bearer' ? 'Bearer' : auth === 'apiKey' ? 'ApiKey' : 'Basic';
      doc.components.securitySchemes[schemeName] = scheme;
    }
  }

  return doc;
}

/**
 * Generate OpenAPI spec as a JSON string
 */
export function generateSpecJson(
  contract: ApiContract,
  options: GenerateSpecOptions,
  pretty = true,
): string {
  const spec = generateSpec(contract, options);
  return JSON.stringify(spec, null, pretty ? 2 : undefined);
}
