import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { UserProfile } from '../App';

interface Stats {
  visitasTotal: number;
  visitasSupabase: number;
  visitasLocais: number;
  unidadesTotal: number;
  unidadesSupabase: number;
  unidadesLocais: number;
  pastas: number;
  invites: number;
  fotos: number;
  semLegenda: number;
}

interface DashboardProps {
  profile: UserProfile | null;
}

interface LocalVisitRecord {
  id: string;
  unidade_id?: string;
  unidade_nome?: string;
  designacao?: string | null;
  visit_date?: string;
  tipo?: string;
  representante?: string;
  servicos?: string;
  observacoes?: string;
  conclusao?: string;
  photo_count?: number;
  fotos?: { name: string; caption: string }[];
  created_at?: string;
}

interface LocalUnidade {
  id?: string;
  designacao?: string | null;
  name?: string | null;
  unidade?: string | null;
}

interface RecentVisit {
  id: string;
  data: string;
  designacao: string;
  unidade: string;
  tipo: string;
  representante: string;
  fotos: number;
  origem: string;
}

const LOCAL_VISITS_KEY = 'ginfotos_visitas_local';
const LOCAL_UNIDADES_KEY = 'ginfotos_unidades_local';

const initialStats: Stats = {
  visitasTotal: 0,
  visitasSupabase: 0,
  visitasLocais: 0,
  unidadesTotal: 115,
  unidadesSupabase: 0,
  unidadesLocais: 0,
  pastas: 0,
  invites: 0,
  fotos: 0,
  semLegenda: 0
};

function loadLocalArray<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]') as T[];
  } catch {
    return [];
  }
}

function formatDate(value?: string | null) {
  if (!value) return 'Nao informado';
  const [year, month, day] = value.slice(0, 10).split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function notesValue(notes: string | null | undefined, label: string) {
  if (!notes) return '';
  const line = notes.split('\n').find((item) => item.toLowerCase().startsWith(label.toLowerCase()));
  return line ? line.replace(new RegExp(`^${label}:?\\s*`, 'i'), '').trim() : '';
}

function countPhotos(visits: LocalVisitRecord[]) {
  return visits.reduce((total, visit) => total + (visit.photo_count || visit.fotos?.length || 0), 0);
}

function countPhotosWithoutCaption(visits: LocalVisitRecord[]) {
  return visits.reduce((total, visit) => {
    const photos = visit.fotos || [];
    return total + photos.filter((photo) => !photo.caption || !photo.caption.trim()).length;
  }, 0);
}

function unitKey(item: LocalUnidade) {
  return String(item.designacao || item.id || item.name || item.unidade || '').toLowerCase();
}

function localVisitToRecent(visit: LocalVisitRecord): RecentVisit {
  return {
    id: visit.id,
    data: visit.visit_date || visit.created_at || '',
    designacao: visit.designacao || visit.unidade_id || 'Sem designacao',
    unidade: visit.unidade_nome || 'Unidade nao informada',
    tipo: visit.tipo || 'VISTORIA TECNICA',
    representante: visit.representante || 'ENGA. MARCIA BRAGA',
    fotos: visit.photo_count || visit.fotos?.length || 0,
    origem: 'Dispositivo'
  };
}

function remoteVisitToRecent(item: { id: string; unidade_id?: string | null; visit_date?: string | null; visitor_name?: string | null; notes?: string | null }): RecentVisit {
  return {
    id: item.id,
    data: item.visit_date || '',
    designacao: notesValue(item.notes, 'Designacao') || item.unidade_id || 'Sem designacao',
    unidade: notesValue(item.notes, 'Unidade escolar') || item.unidade_id || 'Unidade nao informada',
    tipo: notesValue(item.notes, 'Tipo de visita/obra') || 'VISTORIA TECNICA',
    representante: item.visitor_name || notesValue(item.notes, 'Representante E/6 CRE/GIN') || 'ENGA. MARCIA BRAGA',
    fotos: 0,
    origem: 'Supabase'
  };
}

export default function Dashboard({ profile }: DashboardProps) {
  const [stats, setStats] = useState<Stats>(initialStats);
  const [recentVisits, setRecentVisits] = useState<RecentVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const navigate = useNavigate();

  const loadStats = async () => {
    setLoading(true);
    setNotice('Atualizando painel...');

    const localVisits = loadLocalArray<LocalVisitRecord>(LOCAL_VISITS_KEY);
    const localUnits = loadLocalArray<LocalUnidade>(LOCAL_UNIDADES_KEY);
    const localUnitKeys = new Set(localUnits.map(unitKey).filter(Boolean));

    let visitasSupabase = 0;
    let unidadesSupabase = 0;
    let pastas = 0;
    let invites = 0;
    let remoteRecent: RecentVisit[] = [];

    try {
      const [visitasCount, unidadesCount, pastasCount, invitesCount, visitasRecentes] = await Promise.all([
        supabase.from('visitas').select('*', { count: 'exact', head: true }),
        supabase.from('unidades').select('*', { count: 'exact', head: true }),
        supabase.from('pastas').select('*', { count: 'exact', head: true }),
        supabase.from('user_invites').select('*', { count: 'exact', head: true }),
        supabase.from('visitas').select('id, unidade_id, visit_date, visitor_name, notes').order('visit_date', { ascending: false }).limit(5)
      ]);

      visitasSupabase = typeof visitasCount.count === 'number' ? visitasCount.count : 0;
      unidadesSupabase = typeof unidadesCount.count === 'number' ? unidadesCount.count : 0;
      pastas = typeof pastasCount.count === 'number' ? pastasCount.count : 0;
      invites = typeof invitesCount.count === 'number' ? invitesCount.count : 0;

      if (!visitasRecentes.error && visitasRecentes.data) {
        remoteRecent = visitasRecentes.data.map((item) => remoteVisitToRecent(item));
      }

      if (visitasCount.error || unidadesCount.error) {
        setNotice('Painel carregado com dados locais e parte dos dados do Supabase.');
      } else {
        setNotice('Painel atualizado com sucesso.');
      }
    } catch {
      setNotice('Supabase nao respondeu. Painel carregado com dados salvos no dispositivo.');
    }

    const localRecent = localVisits.map(localVisitToRecent);
    const mergedRecent = [...localRecent, ...remoteRecent]
      .filter((item, index, array) => index === array.findIndex((candidate) => candidate.id === item.id))
      .sort((a, b) => (b.data || '').localeCompare(a.data || ''))
      .slice(0, 5);

    setRecentVisits(mergedRecent);

    setStats({
      visitasTotal: visitasSupabase + localVisits.length,
      visitasSupabase,
      visitasLocais: localVisits.length,
      unidadesTotal: Math.max(115, unidadesSupabase + localUnitKeys.size),
      unidadesSupabase,
      unidadesLocais: localUnitKeys.size,
      pastas,
      invites,
      fotos: countPhotos(localVisits),
      semLegenda: countPhotosWithoutCaption(localVisits)
    });

    setLoading(false);
  };

  useEffect(() => {
    loadStats();
  }, []);

  const userName = profile?.role === 'admin' ? 'Thaís Opalka' : (profile?.full_name ?? profile?.name ?? profile?.email ?? 'Usuário');

  const statusText = useMemo(() => {
    if (loading) return 'Atualizando';
    if (notice.toLowerCase().includes('supabase nao respondeu')) return 'Modo local';
    return 'Online';
  }, [loading, notice]);

  return (
    <div className="dashboard-page">
      <div className="top-row">
        <div>
          <p className="page-label">Página</p>
          <h1>Início</h1>
        </div>
        <div className="top-actions">
          <span className="status-pill online">{statusText}</span>
          <button type="button" className="status-pill sync-button" onClick={loadStats}>
            Sincronizar
          </button>
        </div>
      </div>

      <section className="hero-panel">
        <div>
          <p className="hero-eyebrow">Bem-vindo(a) ao sistema</p>
          <h2>{userName}</h2>
          <p className="hero-meta">ADMIN - E/6ª CRE/GIN</p>
          {notice && <p className="page-description" style={{ marginTop: 8 }}>{notice}</p>}
        </div>
        <div className="hero-actions">
          <button type="button" className="hero-button primary" onClick={() => navigate('/nova-visita')}>
            + NOVA VISITA
          </button>
          <button type="button" className="hero-button secondary" onClick={loadStats}>
            SINCRONIZAR
          </button>
        </div>
      </section>

      <div className="stats-grid">
        <article className="stat-card" onClick={() => navigate('/unidades')} style={{ cursor: 'pointer' }}>
          <div className="stat-icon" aria-hidden="true">🏫</div>
          <div>
            <p className="stat-value">{loading ? '—' : stats.unidadesTotal}</p>
            <p className="stat-label">Unidades</p>
            <p className="page-description">Supabase: {stats.unidadesSupabase} | Local: {stats.unidadesLocais}</p>
          </div>
        </article>

        <article className="stat-card" onClick={() => navigate('/visitas')} style={{ cursor: 'pointer' }}>
          <div className="stat-icon" aria-hidden="true">📋</div>
          <div>
            <p className="stat-value">{loading ? '—' : stats.visitasTotal}</p>
            <p className="stat-label">Visitas</p>
            <p className="page-description">Supabase: {stats.visitasSupabase} | Local: {stats.visitasLocais}</p>
          </div>
        </article>

        <article className="stat-card" onClick={() => navigate('/pastas')} style={{ cursor: 'pointer' }}>
          <div className="stat-icon" aria-hidden="true">📁</div>
          <div>
            <p className="stat-value">{loading ? '—' : stats.pastas || stats.unidadesTotal}</p>
            <p className="stat-label">Pastas</p>
            <p className="page-description">Organizadas por unidade</p>
          </div>
        </article>

        <article className="stat-card" onClick={() => navigate('/relatorios')} style={{ cursor: 'pointer' }}>
          <div className="stat-icon" aria-hidden="true">📄</div>
          <div>
            <p className="stat-value">{loading ? '—' : stats.visitasTotal}</p>
            <p className="stat-label">Relatórios possíveis</p>
            <p className="page-description">Gerados a partir das visitas</p>
          </div>
        </article>

        <article className="stat-card">
          <div className="stat-icon" aria-hidden="true">📷</div>
          <div>
            <p className="stat-value">{loading ? '—' : stats.fotos}</p>
            <p className="stat-label">Fotos locais</p>
            <p className="page-description">Registradas no dispositivo</p>
          </div>
        </article>

        <article className="stat-card">
          <div className="stat-icon" aria-hidden="true">✏️</div>
          <div>
            <p className="stat-value">{loading ? '—' : stats.semLegenda}</p>
            <p className="stat-label">Fotos sem legenda</p>
            <p className="page-description">Revisar antes do relatório</p>
          </div>
        </article>
      </div>

      <section className="recent-card">
        <div className="recent-header">
          <div>
            <p className="page-label">Visitas Recentes</p>
            <h2>Últimos registros</h2>
          </div>
          <button type="button" className="empty-link" onClick={() => navigate('/visitas')}>
            Ver todas →
          </button>
        </div>

        {recentVisits.length === 0 ? (
          <div className="empty-state">
            <p>Nenhuma visita registrada ainda.</p>
            <button type="button" className="empty-button" onClick={() => navigate('/nova-visita')}>
              Nova Visita
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table-list">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Designação</th>
                  <th>Unidade</th>
                  <th>Tipo</th>
                  <th>Representante</th>
                  <th>Fotos</th>
                  <th>Origem</th>
                </tr>
              </thead>
              <tbody>
                {recentVisits.map((visit) => (
                  <tr key={`${visit.origem}-${visit.id}`}>
                    <td>{formatDate(visit.data)}</td>
                    <td>{visit.designacao}</td>
                    <td>{visit.unidade}</td>
                    <td>{visit.tipo}</td>
                    <td>{visit.representante}</td>
                    <td>{visit.fotos}</td>
                    <td><span className="status-chip">{visit.origem}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
