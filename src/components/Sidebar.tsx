import { NavLink } from 'react-router-dom';
import { clearCurrentUser } from '../lib/session';

interface SidebarProps {
  isAdmin: boolean;
  email?: string;
}

const menuItems = [
  { to: '/', label: 'Inicio', icon: 'home', end: true },
  { to: '/nova-visita', label: 'Nova Visita', icon: 'plus' },
  { to: '/visitas', label: 'Visitas Tecnicas', icon: 'list' },
  { to: '/unidades', label: 'Unidades Escolares', icon: 'grid' },
  { to: '/relatorios', label: 'Relatorios Word', icon: 'doc' },
  { to: '/whatsapp-diretores', label: 'WhatsApp Diretores', icon: 'msg' },
  { to: '/pastas', label: 'Pastas', icon: 'folder' },
  { to: '/historico', label: 'Arquivo / Historico', icon: 'box' }
];

export default function Sidebar({ isAdmin, email }: SidebarProps) {
  const handleSignOut = () => {
    clearCurrentUser();
    window.location.assign('/login');
  };

  return (
    <div className="sidebar-shell">
      <div>
        <div className="brand-block">
          <div className="brand-logo" aria-hidden="true">GIN</div>
          <div>
            <h2>GINFOTOS<br />6a CRE</h2>
            <p>DESENVOLVIDO POR THAIS OPALKA</p>
          </div>
        </div>

        <nav className="app-nav" aria-label="Menu principal">
          {menuItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              <span className="nav-chevron">&gt;</span>
            </NavLink>
          ))}

          {isAdmin && (
            <NavLink to="/admin">
              <span className="nav-icon">adm</span>
              <span>Admin</span>
              <span className="admin-badge">ADMIN</span>
            </NavLink>
          )}
        </nav>
      </div>

      <div className="sidebar-user-card">
        <div className="user-avatar">T</div>
        <div className="user-copy">
          <strong>Thais Opalka</strong>
          <span>{isAdmin ? 'ADMIN' : 'USUARIO'}</span>
        </div>
        {email && <p className="sidebar-email">{email}</p>}
        <button className="logout-link" type="button" onClick={handleSignOut}>
          Sair do sistema
        </button>
      </div>
    </div>
  );
}
