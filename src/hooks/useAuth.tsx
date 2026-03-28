import { useState, useEffect, createContext, useContext, ReactNode, useRef } from 'react';
import { safeError } from '@/utils/safeLogger';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { setActiveSessionKeyForUser, clearStoredSessionKey } from '@/utils/activeSessionKey';
import { clearOnLogout } from '@/utils/authStorageCleanup';
import { logAuthBootstrap, logAuthSessionResult, logAuthStateChange } from '@/utils/authSessionDebug';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  /** true пока не завершена первая попытка восстановить сессию (getSession). */
  loading: boolean;
  /** true только после завершения первичного getSession(). Нужно, чтобы не показывать ложный empty state при медленном восстановлении сессии, stale storage и edge cases в Android browser. */
  authReady: boolean;
  signUp: (
    email: string,
    password: string,
    displayName?: string,
    options?: { acceptedTermsVersion?: string },
  ) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  /** Флаг завершения первичного восстановления сессии. До true не обрабатываем onAuthStateChange, чтобы избежать мигания SIGNED_OUT/SIGNED_IN на старте (Android/stale storage). */
  const initializedRef = useRef(false);

  useEffect(() => {
    // Порядок: сначала одна попытка восстановить сессию (getSession), затем подписка на изменения.
    // authReady станет true только после завершения getSession — тогда можно безопасно показывать user/null и грузить members/profile.
    const promise = supabase.auth.getSession();
    promise.then(({ data: { session }, error }) => {
      logAuthSessionResult('getSession', { session, error });
      if (error) safeError('Auth session error:', error);
      logAuthBootstrap('getSession', { session, error });
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      initializedRef.current = true;
    }).catch((err) => {
      safeError('Failed to get auth session:', err);
      setLoading(false);
      initializedRef.current = true;
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        logAuthStateChange(event, session);
        if (!initializedRef.current) return;
        logAuthBootstrap('onAuthStateChange', { session, event });
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (
    email: string,
    password: string,
    displayName?: string,
    options?: { acceptedTermsVersion?: string },
  ) => {
    try {
      const userData: Record<string, string> = {};
      if (displayName != null && displayName !== '') {
        userData.display_name = displayName;
      }
      if (options?.acceptedTermsVersion) {
        userData.accepted_terms_version = options.acceptedTermsVersion;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: userData,
        },
      });
      if (error) return { error };

      if (options?.acceptedTermsVersion && data.session?.user?.id) {
        const at = new Date().toISOString();
        const { error: patchErr } = await supabase
          .from('profiles_v2')
          .update({
            accepted_terms_at: at,
            accepted_terms_version: options.acceptedTermsVersion,
          })
          .eq('user_id', data.session.user.id);
        if (patchErr) {
          console.warn('[useAuth] Не удалось записать согласие в profiles_v2 (есть сессия):', patchErr);
        }
      }

      // Supabase может вернуть user=null/session=null при включённом email confirmation — согласие тогда только через триггер + metadata
      return { error: null };
    } catch (err) {
      const e = err as Error;
      let msg = e.message || 'Не удалось зарегистрироваться';
      if (e.message?.includes('Превышено время') || e.message?.includes('timeout') || e.message?.includes('aborted')) {
        msg = 'Превышено время ожидания. Проверьте интернет-соединение.';
      } else if (e.message === 'Failed to fetch' || e.message?.includes('NetworkError') || e.name === 'TypeError') {
        msg = 'Не удалось подключиться к серверу. Проверьте интернет-соединение.';
      }
      return { error: new Error(msg) };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) {
        // Улучшаем сообщения об ошибках для пользователя
        let userMessage = error.message;
        if (error.message?.includes('Invalid login credentials')) {
          userMessage = 'Неверный email или пароль';
        } else if (error.message?.includes('timeout') || error.message?.includes('timed out')) {
          userMessage = 'Превышено время ожидания. Проверьте интернет-соединение.';
        } else if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
          userMessage = 'Не удалось подключиться к серверу. Проверьте интернет-соединение.';
        }
        
        return { 
          error: {
            ...error,
            message: userMessage,
          } as Error
        };
      }

      if (data?.user?.id) {
        const { error: keyError } = await setActiveSessionKeyForUser(data.user.id);
        if (keyError) safeError('Failed to set active session key:', keyError);
      }
      
      return { error: null };
    } catch (err) {
      // Обрабатываем сетевые ошибки
      const error = err as Error;
      let userMessage = 'Произошла ошибка при входе';
      
      if (error.message?.includes('timeout') || error.message?.includes('timed out')) {
        userMessage = 'Превышено время ожидания. Проверьте интернет-соединение.';
      } else if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
        userMessage = 'Не удалось подключиться к серверу. Проверьте интернет-соединение.';
      } else if (error.message) {
        userMessage = error.message;
      }
      
      return { 
        error: new Error(userMessage)
      };
    }
  };

  const signOut = async () => {
    clearOnLogout();
    clearStoredSessionKey();
    // scope: 'local' — очистка только на этом устройстве без ожидания ответа сервера,
    // чтобы кнопка «Выйти» не зависала при проблемах с сетью или в PWA.
    await supabase.auth.signOut({ scope: 'local' });
  };

  const authReady = !loading;

  return (
    <AuthContext.Provider value={{ session, user, loading, authReady, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
