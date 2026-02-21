import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { SUPABASE_DEBOUNCE_MS } from '@/lib/supabase-constants';

/** Из .env (обязателен префикс VITE_ для Vite). */
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (import.meta.env.DEV) {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    console.error("Missing VITE_SUPABASE_* env", { url: !!SUPABASE_URL, key: !!SUPABASE_PUBLISHABLE_KEY });
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Check .env.");
  }
}

/** Rate-limit: debounce 200ms между запросами к Supabase. Auth-запросы не троттлятся. */
let lastSupabaseFetch = 0;
const throttledFetch = (url: string, options?: RequestInit): Promise<Response> => {
  const isAuth = typeof url === 'string' && url.includes('/auth/v1/');
  const now = Date.now();
  const elapsed = now - lastSupabaseFetch;
  const delay = isAuth ? 0 : (elapsed < SUPABASE_DEBOUNCE_MS ? SUPABASE_DEBOUNCE_MS - elapsed : 0);
  return new Promise((resolve, reject) => {
    const run = () => {
      lastSupabaseFetch = Date.now();
      const timeout = 60000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const fetchOptions = { ...options, signal: options?.signal ?? controller.signal };
      fetch(url, fetchOptions)
        .then((r) => { clearTimeout(timeoutId); return r; })
        .then(resolve)
        .catch((err) => {
          clearTimeout(timeoutId);
          if (err.name === 'AbortError' || err.message?.includes('aborted')) {
            reject(new Error('Превышено время ожидания ответа от сервера. Проверьте интернет-соединение.'));
          } else if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
            reject(new Error('Не удалось подключиться к серверу. Проверьте интернет-соединение.'));
          } else reject(err);
        });
    };
    if (delay > 0) setTimeout(run, delay); else run();
  });
};

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, // Отключаем для мобильных приложений
  },
  global: {
    fetch: throttledFetch,
  },
});
