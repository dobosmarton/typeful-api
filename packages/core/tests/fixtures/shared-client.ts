// A client exported from a package built with declarations, imported through the subpath export
import { createClient } from '@typeful-api/core/client';
import { api } from './shared-contract';

export const client = createClient(api, { baseUrl: 'https://api.example.com' });

export const loadProduct = (id: string) => client.v1.products.get({ params: { id } });
