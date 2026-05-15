import { NavLink } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

interface SidebarProps {
  isAdmin: boolean;
  email?: string;
}

export default function Sidebar({ isAdmin, email }: SidebarProps) {
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <nav>
      <h2>Menu</h2>
      <NavLink to="/" end>
        Dashboard
      </NavLink>
      <NavLink to="/unidades">Unidades</NavLink>
      <NavLink to="/nova-visita">Nova Visita</NavLink>
      <NavLink to="/visitas">Visitas</NavLink>
      <NavLink to="/pastas">Pastas</NavLink>
      {isAdmin && <NavLink to="/admin">Admin</NavLink>}
      <div className="sidebar-footer">
        <p>{email ?? 'Sem usuário'}</p>
        <button className="secondary" type="button" onClick={handleSignOut}>
          Sair
        </button>
      </div>
    </nav>
  );
}
