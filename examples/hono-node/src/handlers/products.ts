import { randomUUID } from 'node:crypto';
import type { Product } from '../api';
import type { ProductHandlers } from '../types';

export const list: ProductHandlers['list'] = async ({ c, query }) => {
  const allProducts = c.get('products');
  const { page, limit } = query;
  const start = (page - 1) * limit;
  const paginatedProducts = allProducts.slice(start, start + limit);

  return {
    products: paginatedProducts,
    total: allProducts.length,
    page,
    limit,
  };
};

export const get: ProductHandlers['get'] = async ({ c, params }) => {
  const allProducts = c.get('products');
  const product = allProducts.find((p) => p.id === params.id);

  if (!product) {
    throw new Error('Product not found');
  }

  return product;
};

export const create: ProductHandlers['create'] = async ({ c, body }) => {
  const allProducts = c.get('products');
  const newProduct: Product = {
    id: randomUUID(),
    ...body,
    createdAt: new Date().toISOString(),
  };

  allProducts.push(newProduct);
  return newProduct;
};

export const update: ProductHandlers['update'] = async ({ c, params, body }) => {
  const allProducts = c.get('products');
  const index = allProducts.findIndex((p) => p.id === params.id);

  if (index === -1) {
    throw new Error('Product not found');
  }

  const updated = { ...allProducts[index]!, ...body };
  allProducts[index] = updated;
  return updated;
};

export const deleteProduct: ProductHandlers['delete'] = async ({ c, params }) => {
  const allProducts = c.get('products');
  const index = allProducts.findIndex((p) => p.id === params.id);

  if (index === -1) {
    throw new Error('Product not found');
  }

  allProducts.splice(index, 1);
  return { success: true };
};
