import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();

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

      setStats({
        visitas: result.visitas ?? 0,
        unidades: result.unidades ?? 0,
        pastas: result.pastas ?? 0,
        invites: result.invites ?? 0
      });
      setLoading(false);
    }

    loadStats();
  }, []);

  const userName = profile?.full_name ?? profile?.name ?? profile?.email ?? 'Usuário';

  return (
    <div className="dashboard-page">
      <div className="top-row">
        <div>
          <p className="page-label">Página</p>
          <h1>Início</h1>
        </div>
        <div className="top-actions">
          <span className="status-pill online">Online</span>
          <button type="button" className="status-pill sync-button">
            Sincronizar
          </button>
        </div>
      </div>

      <section className="hero-panel">
        <div>
          <p className="hero-eyebrow">Bem-vindo(a) ao sistema</p>
          <h2>{userName}</h2>
          <p className="hero-meta">ADMIN - E/6ª CRE/GIN</p>
        </div>
        <div className="hero-actions">
          <button type="button" className="hero-button primary" onClick={() => navigate('/nova-visita')}>
            + NOVA VISITA
          </button>
          <button type="button" className="hero-button secondary">
            SINCRONIZAR
          </button>
        </div>
      </section>

      <div className="stats-grid">
        <article className="stat-card">
          <div className="stat-icon" aria-hidden="true">
            🏫
          </div>
          <div>
            <p className="stat-value">{loading ? '—' : stats.unidades}</p>
            <p className="stat-label">Unidades</p>
          </div>
        </article>
        <article className="stat-card">
          <div className="stat-icon" aria-hidden="true">
            📋
          </div>
          <div>
            <p className="stat-value">{loading ? '—' : stats.visitas}</p>
            <p className="stat-label">Visitas</p>
          </div>
        </article>
        <article className="stat-card">
          <div className="stat-icon" aria-hidden="true">
            📝
          </div>
          <div>
            <p className="stat-value">0</p>
            <p className="stat-label">Rascunhos</p>
          </div>
        </article>
        <article className="stat-card">
          <div className="stat-icon" aria-hidden="true">
            ⏳
          </div>
          <div>
            <p className="stat-value">0</p>
            <p className="stat-label">Pendentes</p>
          </div>
        </article>
        <article className="stat-card">
          <div className="stat-icon" aria-hidden="true">
            📄
          </div>
          <div>
            <p className="stat-value">0</p>
            <p className="stat-label">Relatórios</p>
          </div>
        </article>
        <article className="stat-card">
          <div className="stat-icon" aria-hidden="true">
            📷
          </div>
          <div>
            <p className="stat-value">0</p>
            <p className="stat-label">Sem Legenda</p>
          </div>
        </article>
      </div>

      <section className="recent-card">
        <div className="recent-header">
          <div>
            <p className="page-label">Visitas Recentes</p>
            <h2>Visitas Recentes</h2>
          </div>
          <button type="button" className="empty-link" onClick={() => navigate('/visitas')}>
            Ver todas →
          </button>
        </div>

        <div className="empty-state">
          <p>Nenhuma visita registrada ainda.</p>
          <button type="button" className="empty-button" onClick={() => navigate('/nova-visita')}>
            Nova Visita
          </button>
        </div>
      </section>
    </div>
  );
}
