import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { getCurrentUser, AppUser } from './lib/session';
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
import MapaUnidades from './pages/MapaUnidades';
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

function isIOSDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
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
    const currentUser = getCurrentUser();
    setUser(currentUser);
    setLoading(false);
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
      window.removeEventListener('beforeinstallprompt', installHandler);
      unsubscribe();
    };
  }, []);

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
        {loading ? <div className="page-center">Carregando aplicação…</div> : <>
          <Routes>
            <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
            <Route path="/" element={<ProtectedRoute><Dashboard profile={profile} /></ProtectedRoute>} />
            <Route path="/unidades" element={<ProtectedRoute><Unidades /></ProtectedRoute>} />
            <Route path="/mapa-unidades" element={<ProtectedRoute><MapaUnidades /></ProtectedRoute>} />
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
