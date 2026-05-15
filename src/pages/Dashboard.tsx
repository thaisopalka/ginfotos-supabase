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
    <div className="page-card">
      <h1 className="page-title">Painel de Controle</h1>
      <p className="page-description">Acompanhe seus dados, convites e registros de visitas.</p>
      {profile && (
        <div className="page-card">
          <h2>Bem-vindo, {profile.full_name ?? profile.email ?? 'Usuário'}</h2>
          <p>Seu ID: {profile.id}</p>
          <p>Função: {profile.role ?? 'Não definida'}</p>
        </div>
      )}
      {loading ? (
        <p>Carregando métricas...</p>
      ) : (
        <div className="page-card">
          <table className="table-list">
            <thead>
              <tr>
                <th>Recurso</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Visitas</td>
                <td>{stats.visitas}</td>
              </tr>
              <tr>
                <td>Unidades</td>
                <td>{stats.unidades}</td>
              </tr>
              <tr>
                <td>Pastas</td>
                <td>{stats.pastas}</td>
              </tr>
              <tr>
                <td>Convites</td>
                <td>{stats.invites}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
