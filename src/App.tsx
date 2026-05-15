import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './lib/supabaseClient';
import { ProtectedRoute } from './routes/ProtectedRoute';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Unidades from './pages/Unidades';
import NovaVisita from './pages/NovaVisita';
import Visitas from './pages/Visitas';
import Pastas from './pages/Pastas';
import Admin from './pages/Admin';
import NotFound from './pages/NotFound';

export interface UserProfile {
  id: string;
  full_name?: string | null;
  email?: string | null;
  role?: string | null;
}

const adminEmails = ['thaisopalka@gmail.com'];

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const isLoginRoute = location.pathname === '/login';

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    }

    loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    async function loadProfile(user: User) {
      const { data } = await supabase
        .from('user_profiles')
        .select('id, full_name, email, role')
        .eq('id', user.id)
        .single();

      if (data) {
        setProfile(data as UserProfile);
      } else {
        setProfile({ id: user.id, email: user.email ?? '' });
      }
    }

    if (session?.user) {
      loadProfile(session.user);
    } else {
      setProfile(null);
    }
  }, [session]);

  const isAdmin = session?.user.email ? adminEmails.includes(session.user.email) : false;

  return (
    <div className={isLoginRoute ? 'public-shell' : 'app-shell'}>
      {!isLoginRoute && (
        <aside>
          <Sidebar isAdmin={isAdmin} email={session?.user.email ?? undefined} />
          <div className="sidebar-footer">DESENVOLVIDO POR THAÍS OPALKA</div>
        </aside>
      )}
      <main className={isLoginRoute ? 'login-main' : undefined}>
        {loading ? (
          <div className="page-center">Carregando aplicação…</div>
        ) : (
          <Routes>
            <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Dashboard profile={profile} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/unidades"
              element={
                <ProtectedRoute>
                  <Unidades />
                </ProtectedRoute>
              }
            />
            <Route
              path="/nova-visita"
              element={
                <ProtectedRoute>
                  <NovaVisita profile={profile} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/visitas"
              element={
                <ProtectedRoute>
                  <Visitas profile={profile} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/pastas"
              element={
                <ProtectedRoute>
                  <Pastas />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute adminOnly>
                  <Admin />
                </ProtectedRoute>
              }
            />
            <Route path="/not-found" element={<NotFound />} />
            <Route path="*" element={<Navigate to={location.pathname === '/login' ? '/login' : '/not-found'} replace />} />
          </Routes>
        )}
      </main>
    </div>
  );
}

export default App;
