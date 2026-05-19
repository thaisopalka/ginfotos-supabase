import { NavLink, useNavigate } from 'react-router-dom';
import { clearCurrentUser } from '../lib/session';

interface SidebarProps {
  isAdmin: boolean;
  email?: string;
  name?: string;
}

const navItems = [
  { to: '/', label: 'Início', icon: '🏠', end: true },
  { to: '/nova-visita', label: 'Nova Visita', icon: '➕' },
  { to: '/visitas', label: 'Visitas Técnicas', icon: '📋' },
  { to: '/unidades', label: 'Unidades Escolares', icon: '🏫' },
  { to: '/relatorios', label: 'Relatórios Word', icon: '📄' },
  { to: '/whatsapp-diretores', label: 'WhatsApp Diretores', icon: '💬' },
  { to: '/pastas', label: 'Pastas', icon: '📁' },
  { to: '/historico', label: 'Arquivo / Histórico', icon: '🗂️' }
];

export default function Sidebar({ isAdmin, email, name }: SidebarProps) {
  const displayName = isAdmin ? 'Thaís Opalka' : (name ?? 'Usuário');
  const navigate = useNavigate();
  const handleSignOut = () => {
    clearCurrentUser();
    window.location.assign('/login');
  };

  return (
    <div className="sidebar-content">
      <div>
        <div className="brand-block"><div className="brand-logo">G</div><div><p className="brand-title">GINFOTOS 6ª CRE</p><p className="brand-subtitle">DESENVOLVIDO POR THAÍS OPALKA</p></div></div>
        <nav className="app-nav" aria-label="Menu principal">
          {navItems.map((item) => <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}><span className="nav-icon" aria-hidden="true">{item.icon}</span>{item.label}</NavLink>)}
          {isAdmin && <NavLink to="/admin" className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}><span className="nav-icon" aria-hidden="true">⚙️</span>Admin<span className="admin-badge">ADMIN</span></NavLink>}
        </nav>
      </div>
      <div>
        <button type="button" className="sidebar-user-card sidebar-user-button" onClick={() => navigate('/perfil')} title="Editar perfil e senha">
          <div className="user-avatar">{displayName.charAt(0)}</div><div className="user-details"><p className="user-name">{displayName}</p><p className="user-role">{isAdmin ? 'ADMIN' : 'USUÁRIO'} · EDITAR PERFIL</p></div>
        </button>
        <button type="button" className="logout-link" onClick={handleSignOut}>Sair do sistema</button>
      </div>
    </div>
  );
}
