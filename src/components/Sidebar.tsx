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
      <h2>GINFOTOS 6ª CRE</h2>
      <NavLink to="/" end>
        Início
      </NavLink>
      <NavLink to="/nova-visita">Nova Visita</NavLink>
      <NavLink to="/visitas">Visitas Técnicas</NavLink>
      <NavLink to="/unidades">Unidades Escolares</NavLink>
      <NavLink to="/pastas">Pastas</NavLink>
      {isAdmin && <NavLink to="/admin">Admin</NavLink>}
      <div className="sidebar-footer">
        {email && <p className="sidebar-email">{email}</p>}
        <button className="secondary" type="button" onClick={handleSignOut}>
          Sair
        </button>
      </div>
    </nav>
  );
}
