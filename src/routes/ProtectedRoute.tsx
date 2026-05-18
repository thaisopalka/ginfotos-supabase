import { ReactNode, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { getCurrentUser, AppUser } from '../lib/session';

interface ProtectedRouteProps {
  children: ReactNode;
  adminOnly?: boolean;
}

export function ProtectedRoute({ children, adminOnly = false }: ProtectedRouteProps) {
  const [user, setUser] = useState<AppUser | null | undefined>(undefined);

  useEffect(() => {
    const currentUser = getCurrentUser();
    setUser(currentUser);
  }, []);

  if (user === undefined) {
    return <div className="page-center">Verificando sessão…</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.status !== 'ATIVO') {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && user.role !== 'admin') {
    return <Navigate to="/not-found" replace />;
  }

  return <>{children}</>;
}
