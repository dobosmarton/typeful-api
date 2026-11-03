import fs from 'node:fs';
import path from 'node:path';

/**
 * Minimal view of an OpenAPI document, enough to build a client
 */
type OpenApiOperation = {
  operationId?: unknown;
  responses?: Record<string, unknown>;
  'x-typeful-route'?: unknown;
};
type OpenApiDocument = {
  openapi: string;
  paths?: Record<string, Partial<Record<string, OpenApiOperation>> | undefined>;
};

export type GenerateClientOptions = {
  /** A local file, an http(s) URL such as a service's `/api-doc`, or a parsed spec object */
  spec: string | object;
  /** Output file: `.ts` writes a typed client module, `.d.ts` writes types only */
  out: string;
  /** Headers sent when `spec` is a URL, e.g. `{ Authorization: 'Bearer …' }` */
  headers?: Record<string, string>;
};

export type GenerateClientResult = {
  outPath: string;
  kind: OutputKind;
  /** Number of client functions in the module (0 for types only) */
  routeCount: number;
};

type OutputKind = 'module' | 'types';

type RouteEntry = { method: string; path: string; statuses: number[] };
type RouteTree = { [key: string]: RouteEntry | RouteTree };

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
const STATUS_CODE = /^[1-5]\d\d$/;

export const isUrl = (source: string): boolean => /^https?:\/\//i.test(source);

/**
 * `.d.ts` → types only (as before 0.3.0); `.ts`, `.mts` or `.cts` → typed client module
 */
export const outputKind = (out: string): OutputKind => {
  if (/\.d\.[cm]?ts$/.test(out)) return 'types';
  if (/\.[cm]?ts$/.test(out)) return 'module';
  throw new Error(
    `--out must be a .ts file (typed client module) or a .d.ts file (types only), got "${out}"`,
  );
};

const assertOpenApi = (value: unknown, source: string): OpenApiDocument => {
  const doc = value as Partial<OpenApiDocument> | null;
  if (typeof doc !== 'object' || doc === null || typeof doc.openapi !== 'string') {
    throw new Error(`${source} is not an OpenAPI 3 document (no "openapi" version field)`);
  }
  return doc as OpenApiDocument;
};

/**
 * Read a spec from a local file or fetch it from a URL
 */
export const loadSpec = async (
  source: string | object,
  headers: Record<string, string> = {},
): Promise<{ spec: OpenApiDocument; label: string }> => {
  if (typeof source !== 'string') {
    return { spec: assertOpenApi(source, 'The spec object'), label: 'an OpenAPI document' };
  }

  if (isUrl(source)) {
    const response = await fetch(source, { headers: { accept: 'application/json', ...headers } });
    if (!response.ok) {
      throw new Error(
        `Could not fetch the OpenAPI spec from ${source}: ${response.status} ${response.statusText}`,
      );
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new Error(`${source} did not return JSON`);
    }
    return { spec: assertOpenApi(body, source), label: source };
  }

  const specPath = path.resolve(process.cwd(), source);
  if (!fs.existsSync(specPath)) throw new Error(`OpenAPI spec file not found: ${specPath}`);
  let body: unknown;
  try {
    body = JSON.parse(fs.readFileSync(specPath, 'utf-8'));
  } catch {
    throw new Error(`Invalid JSON in OpenAPI spec file: ${specPath}`);
  }
  return { spec: assertOpenApi(body, specPath), label: source };
};

/**
 * Where an operation goes in the client: its `x-typeful-route` (typeful-api specs), else its
 * `operationId`, else a name built from the method and path
 */
const routePosition = (operation: OpenApiOperation, method: string, pathName: string): string[] => {
  const position = operation['x-typeful-route'];
  if (
    Array.isArray(position) &&
    position.length > 0 &&
    position.every((segment) => typeof segment === 'string' && segment !== '')
  ) {
    return position as string[];
  }
  if (typeof operation.operationId === 'string' && operation.operationId !== '') {
    return [operation.operationId];
  }
  return [`${method}${pathName}`.replace(/[^A-Za-z0-9]+/g, '_').replace(/_+$/, '')];
};

/**
 * Build the nested route map a generated client module exports
 */
export const buildRouteMap = (spec: OpenApiDocument): RouteTree => {
  const tree: RouteTree = {};
  const routes = new WeakSet<RouteEntry>();
  const isRoute = (node: RouteEntry | RouteTree | undefined): node is RouteEntry =>
    node !== undefined && routes.has(node as RouteEntry);

  for (const [pathName, item] of Object.entries(spec.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const operation = item?.[method];
      if (!operation) continue;

      const position = routePosition(operation, method, pathName);
      const statuses = Object.keys(operation.responses ?? {})
        .filter((code) => STATUS_CODE.test(code))
        .map(Number)
        .sort((a, b) => a - b);
      const route: RouteEntry = { method, path: pathName, statuses };
      routes.add(route);

      let node = tree;
      for (const [index, segment] of position.slice(0, -1).entries()) {
        const existing = node[segment];
        if (isRoute(existing)) {
          throw new Error(
            `Cannot generate the client: "${position.slice(0, index + 1).join('.')}" is both a route and a group`,
          );
        }
        node = existing ?? (node[segment] = {});
      }

      const name = position[position.length - 1] as string;
      if (node[name] !== undefined) {
        const what = isRoute(node[name]) ? 'two operations' : 'a route and a group';
        throw new Error(`Cannot generate the client: ${what} map to "${position.join('.')}"`);
      }
      node[name] = route;
    }
  }

  return tree;
};

const countRoutes = (tree: RouteTree): number =>
  Object.values(tree).reduce(
    (count, node) =>
      count + (Array.isArray((node as RouteEntry).statuses) ? 1 : countRoutes(node as RouteTree)),
    0,
  );

/** JSON with each `statuses` array on one line */
const formatRoutes = (routes: RouteTree): string =>
  JSON.stringify(routes, null, 2).replace(
    /\[\s+([\d,\s]+?)\s+\]/g,
    (_match, codes: string) => `[${codes.split(/,\s*/).join(', ')}]`,
  );

const renderModule = (typesCode: string, routes: RouteTree, label: string): string =>
  [
    '/**',
    ` * Typed client for the API described by ${label}.`,
    ' * Generated by typeful-api. Do not edit: run `typeful-api generate-client` again instead.',
    ' */',
    "import { createSpecClient, type SpecClient, type SpecClientOptions } from '@typeful-api/core/client';",
    '',
    typesCode.trim(),
    '',
    `export const routes = ${formatRoutes(routes)} as const;`,
    '',
    '/** Client type: mirrors `routes`, with requests and responses typed by `paths` */',
    'export type ApiClient = SpecClient<typeof routes, paths>;',
    '',
    '/**',
    ' * Create a client for this API.',
    ' *',
    ' * @example',
    " * const api = createApiClient({ baseUrl: 'https://orders.internal/api' });",
    " * const res = await api.v1.orders.get({ params: { id: '42' } });",
    ' */',
    'export const createApiClient = (options: SpecClientOptions): ApiClient =>',
    '  createSpecClient<typeof routes, paths>(routes, options);',
    '',
  ].join('\n');

/**
 * Generate types (`.d.ts`) or a typed client module (`.ts`) from an OpenAPI spec
 */
export const generateClientFile = async (
  options: GenerateClientOptions,
): Promise<GenerateClientResult> => {
  const kind = outputKind(options.out);
  const { spec, label } = await loadSpec(options.spec, options.headers);

  const { default: openapiTS, astToString } = await import('openapi-typescript');
  const typesCode = astToString(await openapiTS(spec as Parameters<typeof openapiTS>[0]));

  const routes = kind === 'module' ? buildRouteMap(spec) : {};
  const output = kind === 'module' ? renderModule(typesCode, routes, label) : typesCode;

  const outPath = path.resolve(process.cwd(), options.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, output, 'utf-8');

  return { outPath, kind, routeCount: countRoutes(routes) };
};
