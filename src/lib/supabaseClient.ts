import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const localOnlyMessage = 'Supabase não configurado no Vercel. Usando base local do app.';

function localOnlyResult() {
  return Promise.resolve({ data: null, error: { message: localOnlyMessage } });
}

function makeLocalOnlyQuery(): any {
  const query: any = {
    select: () => query,
    insert: () => query,
    update: () => query,
    delete: () => query,
    upsert: () => query,
    order: () => query,
    eq: () => query,
    single: () => localOnlyResult(),
    maybeSingle: () => localOnlyResult(),
    abortSignal: () => query,
    then: (resolve: any, reject: any) => localOnlyResult().then(resolve, reject),
    catch: (reject: any) => localOnlyResult().catch(reject),
    finally: (callback: any) => localOnlyResult().finally(callback)
  };
  return query;
}

function makeLocalOnlyClient(): any {
  return {
    from: () => makeLocalOnlyQuery(),
    storage: {
      from: () => ({
        upload: () => localOnlyResult(),
        download: () => localOnlyResult(),
        getPublicUrl: () => ({ data: { publicUrl: '' } })
      })
    },
    auth: {
      getUser: () => localOnlyResult(),
      getSession: () => localOnlyResult(),
      signOut: () => localOnlyResult()
    }
  };
}

if (!isSupabaseConfigured) {
  console.warn('GINFOTOS: Supabase não configurado. Chamadas remotas foram desativadas para não travar o app.');
}

export const supabase: any = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      },
      global: {
        fetch: (input, init) => {
          const controller = new AbortController();
          const timeoutId = window.setTimeout(() => controller.abort(), 3500);
          return fetch(input, { ...init, signal: controller.signal }).finally(() => window.clearTimeout(timeoutId));
        }
      }
    })
  : makeLocalOnlyClient();
