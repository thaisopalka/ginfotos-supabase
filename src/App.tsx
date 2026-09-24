import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { clearCurrentUser, getCurrentUser, setCurrentUser, AppUser } from './lib/session';
import { apiFetch, setStoredToken, clearStoredToken } from './lib/apiClient';
import { syncPendingVisitsOnce } from './lib/visitSync';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { onGinfotosNotification, requestGinfotosNotificationPermission } from './lib/notifications';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Unidades from './pages/Unidades';
import NovaVisita from './pages/NovaVisita';
import Visitas from './pages/Visitas';
import Pastas from './pages/Pastas';
import Admin from './pages/Admin';
import Relatorios from './pages/Relatorios';
import WhatsappDiretores from './pages/WhatsappDiretores';
import Perfil from './pages/Perfil';
import NotFound from './pages/NotFound';

export interface UserProfile {
  id?: string;
  email?: string;
  name?: string;
  full_name?: string;
  role?: string;
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const MAGIC_ACCESS_KEY = 'ginfotos_magic_access';

function isIOSDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

async function renewWithStoredMagicAccess(): Promise<AppUser | null> {
  let token = '';
  try { token = localStorage.getItem(MAGIC_ACCESS_KEY) || ''; } catch { /* ignore */ }
  if (!token) return null;

  try {
    const response = await apiFetch('/api/magic-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const payload = await response.json().catch(() => ({})) as { ok?: boolean; user?: AppUser; token?: string };
    if (!response.ok || !payload.ok || !payload.user?.email) {
      try { localStorage.removeItem(MAGIC_ACCESS_KEY); } catch { /* ignore */ }
      return null;
    }
    if (payload.token) setStoredToken(payload.token);
    setCurrentUser(payload.user);
    return payload.user;
  } catch {
    return null;
  }
}

async function validateServerSession(localUser: AppUser) {
  try {
    const response = await apiFetch(`/api/login?check=${Date.now()}`, {
      method: 'GET'
    });

    if (response.status === 401) {
      const renewed = await renewWithStoredMagicAccess();
      if (renewed) return renewed;
      clearCurrentUser();
      clearStoredToken();
      sessionStorage.setItem('ginfotos_session_notice', 'Sua sessão precisa ser renovada. Entre novamente para sincronizar visitas, fotos e relatórios.');
      return null;
    }

    if (!response.ok) return localUser;

    const payload = await response.json().catch(() => ({})) as { user?: AppUser; token?: string };
    if (payload.user?.email) {
      if (payload.token) setStoredToken(payload.token);
      setCurrentUser(payload.user);
      return payload.user;
    }

    return localUser;
  } catch {
    return localUser;
  }
}

function SafeMapaUnidades() {
  const [MapComponent, setMapComponent] = useState<ComponentType | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    import('./pages/MapaUnidades')
      .then((module) => {
        if (active) setMapComponent(() => module.default);
      })
      .catch((error) => {
        console.error('Falha ao carregar Mapa das Unidades:', error);
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (failed) {
    return (
      <section className="page-card">
        <h1>Mapa das Unidades</h1>
        <p className="page-description">O mapa não conseguiu carregar neste dispositivo. As demais áreas do GINFOTOS continuam disponíveis normalmente.</p>
        <button type="button" className="empty-button" onClick={() => window.location.reload()} style={{ marginTop: 16 }}>Tentar novamente</button>
      </section>
    );
  }

  if (!MapComponent) return <div className="page-center">Carregando mapa das unidades…</div>;
  return <MapComponent />;
}

function App() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ title: string; body: string } | null>(null);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosInstall, setShowIosInstall] = useState(false);
  const location = useLocation();
  const isLoginRoute = location.pathname === '/login';

  useEffect(() => {
    let active = true;

    const initialize = async () => {
      const currentUser = getCurrentUser();
      const validatedUser = currentUser ? await validateServerSession(currentUser) : null;
      if (!active) return;
      setUser(validatedUser);
      setLoading(false);
    };

    void initialize();
    requestGinfotosNotificationPermission();

    const installHandler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', installHandler);

    if (isIOSDevice() && !isStandaloneMode()) setShowIosInstall(true);

    const unsubscribe = onGinfotosNotification((payload) => {
      setToast(payload);
      window.setTimeout(() => setToast(null), 5000);
    });

    return () => {
      active = false;
      window.removeEventListener('beforeinstallprompt', installHandler);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user?.email) return;
    let stopped = false;
    let running = false;

    const syncNow = async () => {
      if (stopped || running || !navigator.onLine) return;
      running = true;
      try {
        await syncPendingVisitsOnce();
        if (!stopped) window.dispatchEvent(new Event('ginfotos-visitas-updated'));
      } finally {
        running = false;
      }
    };

    const onOnline = () => { void syncNow(); };
    const onFocus = () => { void syncNow(); };
    const onVisible = () => { if (document.visibilityState === 'visible') void syncNow(); };
    const intervalId = window.setInterval(() => { void syncNow(); }, 20000);

    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    void syncNow();

    return () => {
      stopped = true;
      window.clearInterval(intervalId);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user?.email]);

  const handleInstall = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
      return;
    }
    setShowIosInstall(true);
  };

  const profile: UserProfile = user ? { id: user.email, email: user.email, name: user.name, full_name: user.name, role: user.role } : {};

  return (
    <div className={isLoginRoute ? 'public-shell' : 'app-shell'}>
      {!isLoginRoute && <aside className="sidebar-shell"><Sidebar isAdmin={user?.role === 'admin'} email={user?.email} name={user?.name} /></aside>}
      {!isLoginRoute && (installPrompt || showIosInstall) && !isStandaloneMode() && (
        <div className="install-banner">
          <div>
            <strong>Instalar GINFOTOS</strong>
            <p>{showIosInstall && !installPrompt ? 'No iPhone/iPad: toque em Compartilhar e depois em “Adicionar à Tela de Início”.' : 'Adicione o app à tela inicial para usar melhor no celular.'}</p>
          </div>
          {installPrompt ? <button type="button" onClick={handleInstall}>Adicionar</button> : <button type="button" onClick={() => setShowIosInstall(false)}>Entendi</button>}
        </div>
      )}
      <main className={isLoginRoute ? 'login-main' : 'app-main'}>
        {loading ? <div className="page-center">Verificando sessão e sincronização…</div> : <>
          <Routes>
            <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
            <Route path="/" element={<ProtectedRoute><Dashboard profile={profile} /></ProtectedRoute>} />
            <Route path="/unidades" element={<ProtectedRoute><Unidades /></ProtectedRoute>} />
            <Route path="/mapa-unidades" element={<ProtectedRoute><SafeMapaUnidades /></ProtectedRoute>} />
            <Route path="/nova-visita" element={<ProtectedRoute><NovaVisita profile={profile} /></ProtectedRoute>} />
            <Route path="/visitas" element={<ProtectedRoute><Visitas profile={profile} /></ProtectedRoute>} />
            <Route path="/pastas" element={<ProtectedRoute><Pastas /></ProtectedRoute>} />
            <Route path="/relatorios" element={<ProtectedRoute><Relatorios /></ProtectedRoute>} />
            <Route path="/whatsapp-diretores" element={<ProtectedRoute><WhatsappDiretores /></ProtectedRoute>} />
            <Route path="/perfil" element={<ProtectedRoute><Perfil user={user} onUserChange={setUser} /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>} />
            <Route path="/not-found" element={<NotFound />} />
            <Route path="*" element={<Navigate to={location.pathname === '/login' ? '/login' : '/not-found'} replace />} />
          </Routes>
          {toast && <div className="notification-toast"><strong>{toast.title}</strong><br />{toast.body}</div>}
        </>}
      </main>
    </div>
  );
}

export default App;
