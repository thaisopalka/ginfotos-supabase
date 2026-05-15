import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { UserProfile } from '../App';

interface Stats {
  visitas: number;
  unidades: number;
  pastas: number;
  invites: number;
}

interface DashboardProps {
  profile: UserProfile | null;
}

export default function Dashboard({ profile }: DashboardProps) {
  const [stats, setStats] = useState<Stats>({ visitas: 0, unidades: 0, pastas: 0, invites: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      const tables = ['visitas', 'unidades', 'pastas', 'user_invites'] as const;
      const result: Partial<Stats> = {};

      await Promise.all(
        tables.map(async (table) => {
          const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
          if (!error && typeof count === 'number') {
            if (table === 'user_invites') result.invites = count;
            else if (table === 'visitas') result.visitas = count;
            else if (table === 'unidades') result.unidades = count;
            else if (table === 'pastas') result.pastas = count;
          }
        })
      );

      setStats({ visitas: result.visitas ?? 0, unidades: result.unidades ?? 0, pastas: result.pastas ?? 0, invites: result.invites ?? 0 });
      setLoading(false);
    }

    loadStats();
  }, []);

  return (
    <div>
      <div className="page-card">
        <h1 className="page-title">GINFOTOS 6ª CRE</h1>
        <p className="page-description">Sistema de Visitas Técnicas — E/6ª CRE/GIN</p>
        {profile && <h2>Bem-vinda, {profile.full_name ?? profile.email ?? 'Usuário'}</h2>}
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginTop: 16 }}>
        <div className="page-card">
          <h3>Unidades Escolares</h3>
          <p style={{ fontSize: '1.6rem', margin: '8px 0' }}>{stats.unidades}</p>
        </div>
        <div className="page-card">
          <h3>Visitas Técnicas</h3>
          <p style={{ fontSize: '1.6rem', margin: '8px 0' }}>{stats.visitas}</p>
        </div>
        <div className="page-card">
          <h3>Fotos Registradas</h3>
          <p style={{ fontSize: '1.6rem', margin: '8px 0' }}>0</p>
        </div>
        <div className="page-card">
          <h3>Convites Pendentes</h3>
          <p style={{ fontSize: '1.6rem', margin: '8px 0' }}>{stats.invites}</p>
        </div>
      </div>
    </div>
  );
}
