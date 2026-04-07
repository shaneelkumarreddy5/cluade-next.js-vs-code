import { supabase, supabaseUrl } from '@/lib/supabase';

function coerceValue(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;

  const parsed = Number(value);
  return Number.isNaN(parsed) ? value : parsed;
}

function parseInValues(rawValue) {
  const clean = rawValue.replace(/^\(/, '').replace(/\)$/, '');
  if (!clean) return [];
  return clean.split(',').map((item) => coerceValue(item.trim()));
}

function parseOrder(rawValue) {
  const [column, direction = 'asc'] = String(rawValue).split('.');
  return {
    column,
    ascending: direction !== 'desc',
  };
}

function applyFilters(query, filters = {}) {
  let next = query;

  Object.entries(filters || {}).forEach(([column, raw]) => {
    if (raw === undefined || raw === null || raw === '') {
      return;
    }

    if (column === 'order') {
      const { column: orderColumn, ascending } = parseOrder(raw);
      if (orderColumn) {
        next = next.order(orderColumn, { ascending });
      }
      return;
    }

    if (column === 'limit') {
      const limit = Number(raw);
      if (!Number.isNaN(limit)) {
        next = next.limit(limit);
      }
      return;
    }

    if (column === 'offset') {
      const offset = Number(raw);
      if (!Number.isNaN(offset)) {
        next = next.range(offset, offset + 999);
      }
      return;
    }

    const [operator, ...rest] = String(raw).split('.');
    const value = rest.join('.');

    switch (operator) {
      case 'eq':
        next = next.eq(column, coerceValue(value));
        break;
      case 'neq':
        next = next.neq(column, coerceValue(value));
        break;
      case 'gt':
        next = next.gt(column, coerceValue(value));
        break;
      case 'gte':
        next = next.gte(column, coerceValue(value));
        break;
      case 'lt':
        next = next.lt(column, coerceValue(value));
        break;
      case 'lte':
        next = next.lte(column, coerceValue(value));
        break;
      case 'like':
        next = next.like(column, value);
        break;
      case 'ilike':
        next = next.ilike(column, value);
        break;
      case 'is':
        next = next.is(column, coerceValue(value));
        break;
      case 'in':
        next = next.in(column, parseInValues(value));
        break;
      default:
        next = next.eq(column, coerceValue(String(raw)));
        break;
    }
  });

  return next;
}

export function createGlonniSupabaseBridge() {
  return {
    url: supabaseUrl,

    auth: {
      async signUp(email, password, meta = {}) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: meta },
        });

        if (error) {
          return { error };
        }

        return {
          ...data,
          access_token: data.session?.access_token || null,
          user: data.user || data.session?.user || null,
        };
      },

      async signIn(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          return { error };
        }

        return {
          ...data,
          access_token: data.session?.access_token || null,
          user: data.user || data.session?.user || null,
        };
      },
    },

    async get(table, select = '*', filters = {}) {
      let query = supabase.from(table).select(select);
      query = applyFilters(query, filters);

      const { data, error } = await query;
      if (error) {
        console.error('GET error:', table, error);
        return [];
      }

      return Array.isArray(data) ? data : [];
    },

    async ins(table, payload) {
      const { data, error } = await supabase.from(table).insert(payload).select();
      if (error) {
        console.error('INS error:', table, error);
        return [];
      }

      return Array.isArray(data) ? data : [];
    },

    async ups(table, payload) {
      const { data, error } = await supabase.from(table).upsert(payload).select();
      if (error) {
        console.error('UPS error:', table, error);
        return null;
      }

      return data;
    },

    async upd(table, payload, filters = {}) {
      let query = supabase.from(table).update(payload);
      query = applyFilters(query, filters);

      const { error } = await query;
      if (error) {
        console.error('UPD error:', table, error);
        return false;
      }

      return true;
    },

    async del(table, filters = {}) {
      let query = supabase.from(table).delete();
      query = applyFilters(query, filters);

      const { error } = await query;
      if (error) {
        console.error('DEL error:', table, error);
        return false;
      }

      return true;
    },

    async rpc(functionName, params = {}) {
      const { data, error } = await supabase.rpc(functionName, params);
      if (error) {
        console.error('RPC error:', functionName, error);
        return null;
      }

      return data;
    },

    async uploadPublicFile(bucket, path, file) {
      const { error } = await supabase.storage.from(bucket).upload(path, file, {
        upsert: true,
        contentType: file.type,
      });

      if (error) {
        return { error };
      }

      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      return { url: data.publicUrl };
    },

    async invokeFunction(name, body = {}) {
      const { data, error } = await supabase.functions.invoke(name, { body });
      return { data, error };
    },
  };
}
