import { useState, useEffect, createContext, useContext, ReactNode, useRef } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

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

  useEffect(() => {
    // Get initial session FIRST
    supabase.auth.getSession()
      .then(({ data: { session }, error }) => {
        if (error) {
          console.error('Auth session error:', error);
        }
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        initializedRef.current = true;
      })
      .catch((error) => {
        console.error('Failed to get auth session:', error);
        setLoading(false);
        initializedRef.current = true;
      });

    // Set up auth state listener AFTER getting initial session
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        // Only update state after initial session has been loaded
        // This prevents race condition where listener fires before getSession completes
        if (initializedRef.current) {
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, displayName?: string) => {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
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
