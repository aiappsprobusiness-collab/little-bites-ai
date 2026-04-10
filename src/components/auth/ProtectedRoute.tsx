import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading, isRecoverySession } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen min-h-dvh flex items-center justify-center bg-splash">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (isRecoverySession) {
    return <Navigate to="/auth/reset-password" replace />;
  }

  return <>{children}</>;
}
