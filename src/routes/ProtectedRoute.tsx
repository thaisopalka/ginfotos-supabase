import { ReactNode, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

interface ProtectedRouteProps {
  children: ReactNode;
  adminOnly?: boolean;
}

const adminEmails = ['thaisopalka@gmail.com'];

export function ProtectedRoute({ children, adminOnly = false }: ProtectedRouteProps) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  if (session === undefined) {
    return <div className="page-center">Verificando sessão…</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && !adminEmails.includes(session.user.email ?? '')) {
    return <Navigate to="/not-found" replace />;
  }

  return <>{children}</>;
}
