import type { ZodType } from 'zod';
import { unauthorizedError, unprocessableError } from './helpers/errors';
import { PROBLEM_CONTENT_TYPE } from './helpers/problem';
import { statusText } from './helpers/status';
import type { HttpMethod, RouteDefinition } from './types';

/**
 * One response a route can produce
 */
export type ResolvedResponse = {
  status: number;
  description: string;
  mediaType: 'application/json' | typeof PROBLEM_CONTENT_TYPE;
  schema: ZodType;
  /** Added by typeful-api because the framework itself can send it (422 or 401) */
  implicit: boolean;
};

const BODY_METHODS: ReadonlySet<HttpMethod> = new Set(['post', 'put', 'patch']);
const PROBLEM_MEMBERS = ['type', 'title', 'status'] as const;

/**
 * Whether the adapters validate any request input for this route (so it can fail with 422)
 */
export const routeHasInput = (route: RouteDefinition): boolean =>
  Boolean(route.params || route.query || (route.body && BODY_METHODS.has(route.method)));

/**
 * Whether the route declares an auth requirement (so it can fail with 401)
 */
export const routeRequiresAuth = (route: RouteDefinition): boolean =>
  route.auth !== undefined && route.auth !== 'none';

/**
 * Whether a schema describes a Problem Details object (has `type`, `title` and `status`)
 */
export const isProblemSchema = (schema: ZodType): boolean => {
  const def = (schema as { _zod?: { def?: { type?: string; shape?: object } } })._zod?.def;
  const shape = def?.shape;
  return def?.type === 'object' && shape !== undefined && PROBLEM_MEMBERS.every((m) => m in shape);
};

/**
 * Every response a route can produce: the 200 success response, the declared responses, and
 * the responses the framework sends on its own (422 for invalid input, 401 for failed auth)
 * unless the route declares those statuses itself. For adapter authors and tooling.
 */
export const resolveRouteResponses = (route: RouteDefinition): ResolvedResponse[] => {
  const declared = route.responses ?? {};
  const implicit: Array<[number, ZodType]> = [];
  if (routeHasInput(route) && !(422 in declared)) implicit.push([422, unprocessableError()]);
  if (routeRequiresAuth(route) && !(401 in declared)) implicit.push([401, unauthorizedError()]);

  const describe = (status: number) => statusText(status) ?? `Response ${status}`;

  return [
    {
      status: 200,
      description: 'Successful response',
      mediaType: 'application/json',
      schema: route.response,
      implicit: false,
    },
    ...implicit.map(([status, schema]): ResolvedResponse => ({
      status,
      description: describe(status),
      mediaType: PROBLEM_CONTENT_TYPE,
      schema,
      implicit: true,
    })),
    ...Object.entries(declared).map(([code, schema]): ResolvedResponse => ({
      status: Number(code),
      description: describe(Number(code)),
      mediaType: isProblemSchema(schema) ? PROBLEM_CONTENT_TYPE : 'application/json',
      schema,
      implicit: false,
    })),
  ];
};
