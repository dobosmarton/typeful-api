/**
 * ProductList Component
 *
 * Demonstrates type-safe data fetching with TanStack Query.
 * All types are inferred from the API's OpenAPI spec.
 */

import { useQuery } from '@tanstack/react-query';
import { productQueries } from '../api/query-options';

export const ProductList = () => {
  const { data, isLoading, error } = useQuery(productQueries.all());

  if (isLoading) {
    return (
      <div style={styles.loading}>
        Loading products...
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.error}>
        Error: {error.message}
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div>
      <div style={styles.header}>
        <h2 style={styles.title}>Products</h2>
        <span style={styles.count}>
          Showing {data.products.length} of {data.total}
        </span>
      </div>

      <div style={styles.grid}>
        {data.products.map((product) => (
          <div key={product.id} style={styles.card}>
            <div style={styles.cardHeader}>
              <h3 style={styles.productName}>{product.name}</h3>
              <span
                style={{
                  ...styles.badge,
                  backgroundColor: product.inStock ? '#dcfce7' : '#fee2e2',
                  color: product.inStock ? '#166534' : '#991b1b',
                }}
              >
                {product.inStock ? 'In Stock' : 'Out of Stock'}
              </span>
            </div>

            {product.description && (
              <p style={styles.description}>{product.description}</p>
            )}

            <div style={styles.cardFooter}>
              <span style={styles.price}>
                ${(product.price / 100).toFixed(2)}
              </span>
              <span style={styles.date}>
                Added {new Date(product.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div style={styles.pagination}>
        Page {data.page} | {data.limit} items per page
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  loading: {
    padding: '2rem',
    textAlign: 'center',
    color: '#666',
  },
  error: {
    padding: '1rem',
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    borderRadius: '8px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
  },
  title: {
    fontSize: '1.25rem',
    fontWeight: 600,
  },
  count: {
    color: '#666',
    fontSize: '0.875rem',
  },
  grid: {
    display: 'grid',
    gap: '1rem',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: '8px',
    padding: '1rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '0.5rem',
  },
  productName: {
    fontSize: '1rem',
    fontWeight: 500,
    margin: 0,
  },
  badge: {
    fontSize: '0.75rem',
    padding: '0.25rem 0.5rem',
    borderRadius: '4px',
    fontWeight: 500,
  },
  description: {
    color: '#666',
    fontSize: '0.875rem',
    marginBottom: '0.75rem',
  },
  cardFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: '0.75rem',
    borderTop: '1px solid #eee',
  },
  price: {
    fontSize: '1.125rem',
    fontWeight: 600,
    color: '#059669',
  },
  date: {
    fontSize: '0.75rem',
    color: '#999',
  },
  pagination: {
    marginTop: '1.5rem',
    textAlign: 'center',
    color: '#666',
    fontSize: '0.875rem',
  },
};
