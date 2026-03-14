import { useState, useEffect, createContext, useContext, ReactNode, useRef } from 'react';
import { safeError } from '@/utils/safeLogger';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import {
  setActiveSessionKeyForUser,
  validateActiveSession,
  clearStoredSessionKey,
  setSessionInvalidReason,
  SESSION_INVALID_REASON_REPLACED,
} from '@/utils/activeSessionKey';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const initializedRef = useRef(false);
  /** Защита от повторных вызовов signOut (зацикливание при 403 и т.д.). */
  const isSigningOutRef = useRef(false);

  const checkSessionValid = useRef(async (userId: string) => {
    if (isSigningOutRef.current) return;
    const result = await validateActiveSession(userId);
    if (!result.valid && result.reason === SESSION_INVALID_REASON_REPLACED) {
      if (isSigningOutRef.current) return;
      isSigningOutRef.current = true;
      try {
        setSessionInvalidReason(SESSION_INVALID_REASON_REPLACED);
        clearStoredSessionKey();
        // Локальный выход без запроса global logout (избегаем 403 и повторных вызовов).
        await supabase.auth.signOut({ scope: 'local' });
      } catch (err) {
        safeError('Auth signOut (replaced session):', err);
      } finally {
        isSigningOutRef.current = false;
      }
    }
  });

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) safeError('Auth session error:', error);
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      initializedRef.current = true;

      if (!cancelled && session?.user?.id && !isSigningOutRef.current) {
        checkSessionValid.current(session.user.id);
      }
    }).catch((err) => {
      safeError('Failed to get auth session:', err);
      setLoading(false);
      initializedRef.current = true;
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!initializedRef.current) return;
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        if (session?.user?.id && !isSigningOutRef.current) {
          checkSessionValid.current(session.user.id);
        }
      }
    );

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (isSigningOutRef.current) return;
      supabase.auth.getSession().then(({ data: { session: s } }) => {
        if (!s?.user?.id || isSigningOutRef.current) return;
        checkSessionValid.current(s.user.id);
      });
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const signUp = async (email: string, password: string, displayName?: string) => {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            display_name: displayName,
          },
        },
      });
      if (error) return { error };
      // Supabase может вернуть user=null при включённом email confirmation — это нормально
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
    clearStoredSessionKey();
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, signUp, signIn, signOut }}>
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
