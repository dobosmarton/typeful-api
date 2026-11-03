import { flattenRoutes } from '../contract';
import { resolveRouteResponses } from '../responses';
import type { ApiContract } from '../types';
import { createCaller, type Caller } from './request';
import type { ClientOptions, ContractClient } from './types';

type ClientNode = { [key: string]: ClientNode | Caller };

const describeNode = (version: string, group: string[], name?: string) =>
  [version, ...group, ...(name ? [name] : [])].join('/');

/**
 * Creates a typed HTTP client from an API contract. The client mirrors the contract, and each
 * route becomes a function that returns `{ status, body, headers }` typed for every status the
 * route can answer with.
 *
 * @example
 * ```ts
 * import { createClient, unwrap } from '@typeful-api/core/client';
 * import { api } from '@acme/contract';
 *
 * const client = createClient(api, {
 *   baseUrl: 'https://api.example.com',
 *   headers: () => ({ Authorization: `Bearer ${getToken()}` }),
 * });
 *
 * const res = await client.v1.products.get({ params: { id: '42' } });
 * if (res.status === 200) console.log(res.body.name);
 * else if (res.status === 404) console.log(res.body.detail);
 *
 * const products = await client.v1.products.list({ query: { page: 2 } }).then(unwrap);
 * ```
 */
export function createClient<C extends ApiContract>(
  contract: C,
  options: ClientOptions,
): ContractClient<C> {
  const root: ClientNode = {};

  for (const { version, group, name, route, fullPath } of flattenRoutes(contract)) {
    let node = root;
    for (const [index, segment] of [version, ...group].entries()) {
      const existing = node[segment];
      if (typeof existing === 'function') {
        throw new Error(
          `typeful-api client: "${describeNode(version, group.slice(0, index))}" is both a route and a group`,
        );
      }
      node = existing ?? (node[segment] = {});
    }
    if (name in node) {
      throw new Error(
        `typeful-api client: "${describeNode(version, group, name)}" is both a route and a group`,
      );
    }
    const responses = new Map(resolveRouteResponses(route).map((r) => [r.status, r.schema]));
    node[name] = createCaller({ method: route.method, path: fullPath, responses }, options);
  }

  return root as unknown as ContractClient<C>;
}
