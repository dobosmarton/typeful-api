import { ProductList } from './components/ProductList';

export const App = () => {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>
          Typi Fullstack Example
        </h1>
        <p style={{ color: '#666', marginTop: '0.5rem' }}>
          React + TanStack Query with type-safe API calls using generated OpenAPI types
        </p>
      </header>

      <main>
        <ProductList />
      </main>
    </div>
  );
};
