import type {
  ApiContract,
  RouteDefinition,
  RouteGroup,
  RouteLeaves,
  VersionedRoutes,
} from './types';

/**
 * Define a set of named routes (route leaves)
 * This is a type-safe identity function that validates the route structure
 *
 * @example
 * ```ts
 * const productRoutes = defineRoutes({
 *   list: route.get('/').returns(z.array(ProductSchema)),
 *   get: route.get('/:id').params(IdParamsSchema).returns(ProductSchema),
 *   create: route.post('/').body(CreateProductSchema).returns(ProductSchema),
 * });
 * ```
 */
export function defineRoutes<T extends RouteLeaves>(routes: T): T {
  return routes;
}

/**
 * Define a route group with optional nested groups
 * Groups can contain routes, children (nested groups), middleware config, and tags
 *
 * @example
 * ```ts
 * const apiGroup = defineGroup({
 *   routes: {
 *     health: route.get('/health').returns(HealthSchema),
 *   },
 *   children: {
 *     products: defineGroup({ routes: productRoutes }),
 *     users: defineGroup({ routes: userRoutes }),
 *   },
 *   middleware: ['cors', 'logging'],
 *   tags: ['API'],
 * });
 * ```
 */
export function defineGroup<T extends RouteGroup>(group: T): T {
  return group;
}

/**
 * Define versioned routes (v1, v2, etc.)
 *
 * @example
 * ```ts
 * const versions = defineVersions({
 *   v1: defineGroup({
 *     children: {
 *       products: defineGroup({ routes: v1ProductRoutes }),
 *     },
 *   }),
 *   v2: defineGroup({
 *     children: {
 *       products: defineGroup({ routes: v2ProductRoutes }),
 *     },
 *   }),
 * });
 * ```
 */
export function defineVersions<T extends VersionedRoutes>(versions: T): T {
  return versions;
}

/**
 * Define a complete API contract
 * This is the main entry point for defining your API structure
 *
 * @example
 * ```ts
 * export const api = defineApi({
 *   v1: {
 *     children: {
 *       products: {
 *         routes: {
 *           list: route.get('/').returns(z.array(ProductSchema)),
 *           get: route.get('/:id').params(IdParams).returns(ProductSchema),
 *           create: route.post('/').body(CreateProduct).returns(ProductSchema).auth('bearer'),
 *         },
 *       },
 *       users: {
 *         routes: {
 *           me: route.get('/me').returns(UserSchema).auth('bearer'),
 *         },
 *       },
 *     },
 *   },
 * });
 * ```
 */
export function defineApi<T extends ApiContract>(contract: T): T {
  return contract;
}

/**
 * Helper to check if a value is a RouteDefinition
 */
export function isRouteDefinition(value: unknown): value is RouteDefinition {
  return (
    typeof value === 'object' &&
    value !== null &&
    'method' in value &&
    'path' in value &&
    'response' in value
  );
}

/**
 * Helper to check if a value is a RouteGroup
 */
export function isRouteGroup(value: unknown): value is RouteGroup {
  return (
    typeof value === 'object' &&
    value !== null &&
    ('routes' in value || 'children' in value)
  );
}

/**
 * Flatten all routes from a contract into a flat list with full paths
 * Useful for iteration and spec generation
 */
export function flattenRoutes(
  contract: ApiContract,
  basePath = '',
): Array<{
  version: string;
  group: string[];
  name: string;
  route: RouteDefinition;
  fullPath: string;
}> {
  const result: Array<{
    version: string;
    group: string[];
    name: string;
    route: RouteDefinition;
    fullPath: string;
  }> = [];

  function traverseGroup(
    group: RouteGroup,
    version: string,
    groupPath: string[],
    pathPrefix: string,
  ) {
    // Process routes at this level
    if (group.routes) {
      for (const [name, route] of Object.entries(group.routes)) {
        const routePath = route.path.startsWith('/')
          ? route.path
          : `/${route.path}`;
        const fullPath = `${basePath}/${version}${pathPrefix}${routePath}`.replace(
          /\/+/g,
          '/',
        );

        result.push({
          version,
          group: groupPath,
          name,
          route,
          fullPath,
        });
      }
    }

    // Recurse into children
    if (group.children) {
      for (const [childName, childGroup] of Object.entries(group.children)) {
        traverseGroup(
          childGroup,
          version,
          [...groupPath, childName],
          `${pathPrefix}/${childName}`,
        );
      }
    }
  }

  // Process each version
  for (const [version, versionGroup] of Object.entries(contract)) {
    traverseGroup(versionGroup, version, [], '');
  }

  return result;
}

/**
 * Get all unique tags from a contract
 */
export function extractTags(contract: ApiContract): string[] {
  const tags = new Set<string>();

  function traverseGroup(group: RouteGroup) {
    if (group.tags) {
      for (const tag of group.tags) {
        tags.add(tag);
      }
    }

    if (group.routes) {
      for (const route of Object.values(group.routes)) {
        if (route.tags) {
          for (const tag of route.tags) {
            tags.add(tag);
          }
        }
      }
    }

    if (group.children) {
      for (const childGroup of Object.values(group.children)) {
        traverseGroup(childGroup);
      }
    }
  }

  for (const versionGroup of Object.values(contract)) {
    traverseGroup(versionGroup);
  }

  return Array.from(tags).sort();
}
