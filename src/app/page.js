'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function fetchCategories() {
      setLoading(true);
      setError('');

      const { data, error: fetchError } = await supabase
        .from('categories')
        .select('id,name')
        .limit(5);

      if (!active) return;

      if (fetchError) {
        setError(fetchError.message);
        setItems([]);
      } else {
        setItems(Array.isArray(data) ? data : []);
      }

      setLoading(false);
    }

    fetchCategories();

    return () => {
      active = false;
    };
  }, []);

  return (
    <main style={{ padding: '24px', maxWidth: 760, margin: '0 auto' }}>
      <section
        style={{
          border: '1px solid #e8e8e8',
          borderRadius: 12,
          padding: 16,
          background: '#fff',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 24 }}>Supabase Fetch Test</h1>
        <p style={{ marginTop: 8, color: '#555' }}>
          Reading up to 5 rows from categories using your Supabase client.
        </p>

        {loading && <p style={{ marginTop: 12 }}>Loading...</p>}

        {!loading && error && (
          <p style={{ marginTop: 12, color: '#b3261e' }}>Could not fetch data: {error}</p>
        )}

        {!loading && !error && items.length === 0 && (
          <p style={{ marginTop: 12, color: '#555' }}>
            No rows found in categories (empty state).
          </p>
        )}

        {!loading && !error && items.length > 0 && (
          <ul style={{ marginTop: 12, paddingLeft: 18 }}>
            {items.map((item) => (
              <li key={item.id}>
                {item.name || 'Untitled'} ({item.id})
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
