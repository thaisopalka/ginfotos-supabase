import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserProfile } from '../App';
import { apiFetch, apiReadJson } from '../lib/apiClient';

interface Stats {
  visitasTotal: number;
  visitasServidor: number;
  visitasPendentes: number;
  unidadesTotal: number;
  fotos: number;
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
  photo_count?: number;
  fotos?: { name: string; caption: string }[];
  created_at?: string;
}

interface ApiVisit {
  id: string;
  unidade_id?: string | null;
  visit_date?: string | null;
  visitor_name?: string | null;
  notes?: string | null;
  photo_count?: number;
  created_at?: string | null;
}

interface RecentVisit {
  id: string;
  data: string;
  createdAt: string;
  designacao: string;
  unidade: string;
  tipo: string;
  representante: string;
  fotos: number;
  origem: string;
}

const LOCAL_VISITS_KEY = 'ginfotos_visitas_local';

const initialStats: Stats = {
  visitasTotal: 0,
  visitasServidor: 0,
  visitasPendentes: 0,
  unidadesTotal: 115,
  fotos: 0
};

function loadLocalVisits(): LocalVisitRecord[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_VISITS_KEY) || '[]') as LocalVisitRecord[]; }
  catch { return []; }
}

function formatDate(value?: string | null) {
  if (!value) return 'Não informado';
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function notesValue(notes: string | null | undefined, label: string) {
  if (!notes) return '';
  const line = notes.split('\n').find((item) => item.toLowerCase().startsWith(label.toLowerCase()));
  return line ? line.replace(new RegExp(`^${label}:?\\s*`, 'i'), '').trim() : '';
}

function localVisitToRecent(visit: LocalVisitRecord): RecentVisit {
  return {
    id: visit.id,
    data: visit.visit_date || visit.created_at || '',
    createdAt: visit.created_at || visit.visit_date || '',
    designacao: visit.designacao || visit.unidade_id || 'Sem designação',
    unidade: visit.unidade_nome || 'Unidade não informada',
    tipo: visit.tipo || 'VISTORIA TÉCNICA',
    representante: visit.representante || 'GIN 6ª CRE',
    fotos: visit.photo_count || visit.fotos?.length || 0,
    origem: visit.id.startsWith('local-') ? 'Pendente' : 'Dispositivo'
  };
}

function remoteVisitToRecent(item: ApiVisit): RecentVisit {
  return {
    id: item.id,
    data: item.visit_date || '',
    createdAt: item.created_at || item.visit_date || '',
    designacao: notesValue(item.notes, 'Designacao') || item.unidade_id || 'Sem designação',
    unidade: notesValue(item.notes, 'Unidade escolar') || item.unidade_id || 'Unidade não informada',
    tipo: notesValue(item.notes, 'Tipo de visita/obra') || 'VISTORIA TÉCNICA',
    representante: item.visitor_name || notesValue(item.notes, 'Representante E/6 CRE/GIN') || 'GIN 6ª CRE',
    fotos: Number(item.photo_count || 0),
    origem: 'Servidor'
  };
}

async function fetchVisits() {
  const response = await apiFetch(`/api/visitas?ts=${Date.now()}`, {
    method: 'GET'
  });
  const payload = await apiReadJson<{ data?: ApiVisit[]; error?: string }>(response);
  if (!response.ok) throw new Error(payload.error || 'Servidor de visitas não respondeu.');
  return (Array.isArray(payload.data) ? payload.data : []) as ApiVisit[];
}

async function fetchUnitCount() {
  try {
    const response = await apiFetch(`/api/unidades?ts=${Date.now()}`, {
      method: 'GET'
    });
    const payload = await apiReadJson<{ count?: number; data?: unknown[] }>(response);
    if (!response.ok) return 115;
    return Number(payload.count || (Array.isArray(payload.data) ? payload.data.length : 115) || 115);
  } catch {
    return 115;
  }
}

export default function Dashboard({ profile }: DashboardProps) {
  const [stats, setStats] = useState<Stats>(initialStats);
  const [recentVisits, setRecentVisits] = useState<RecentVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const navigate = useNavigate();

  const loadStats = async () => {
    setLoading(true);
    const local = loadLocalVisits();
    const pending = local.filter((item) => item.id.startsWith('local-'));

    try {
      const [remote, unidadesTotal] = await Promise.all([fetchVisits(), fetchUnitCount()]);
      const remoteRecent = remote.map(remoteVisitToRecent);
      const pendingRecent = pending.map(localVisitToRecent);
      const remoteIds = new Set(remote.map((item) => item.id));
      const uniquePending = pendingRecent.filter((item) => !remoteIds.has(item.id));
      const mergedRecent = [...remoteRecent, ...uniquePending]
        .sort((a, b) => (b.createdAt || b.data).localeCompare(a.createdAt || a.data))
        .slice(0, 5);

      setRecentVisits(mergedRecent);
      setStats({
        visitasTotal: remote.length + uniquePending.length,
        visitasServidor: remote.length,
        visitasPendentes: uniquePending.length,
        unidadesTotal: Math.max(115, unidadesTotal),
        fotos: remote.reduce((total, visit) => total + Number(visit.photo_count || 0), 0) + pending.reduce((total, visit) => total + Number(visit.photo_count || visit.fotos?.length || 0), 0)
      });
      setNotice(uniquePending.length ? `${remote.length} visita(s) no servidor e ${uniquePending.length} pendente(s) neste aparelho. A sincronização automática está ativa.` : `Tudo sincronizado. ${remote.length} visita(s) no servidor.`);
    } catch (error) {
      setRecentVisits(pending.map(localVisitToRecent).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 5));
      setStats({
        visitasTotal: pending.length,
        visitasServidor: 0,
        visitasPendentes: pending.length,
        unidadesTotal: 115,
        fotos: pending.reduce((total, visit) => total + Number(visit.photo_count || visit.fotos?.length || 0), 0)
      });
      setNotice(`Servidor temporariamente indisponível: ${error instanceof Error ? error.message : 'erro desconhecido'}. Rascunhos e pendências continuam protegidos.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStats();
    const refresh = () => { void loadStats(); };
    const visible = () => { if (document.visibilityState === 'visible') void loadStats(); };
    window.addEventListener('ginfotos-visitas-updated', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('ginfotos-visitas-updated', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);

  const userName = profile?.role === 'admin' ? 'Thaís Opalka' : (profile?.full_name ?? profile?.name ?? profile?.email ?? 'Usuário');
  const statusText = useMemo(() => loading ? 'Atualizando' : (stats.visitasPendentes ? 'Sincronizando' : 'Online'), [loading, stats.visitasPendentes]);

  return (
    <div className="dashboard-page">
      <div className="top-row">
        <div><p className="page-label">Página</p><h1>Início</h1></div>
        <div className="top-actions">
          <span className="status-pill online">{statusText}</span>
          <button type="button" className="status-pill sync-button" onClick={loadStats}>SINCRONIZAR AGORA</button>
        </div>
      </div>

      <section className="hero-panel">
        <div>
          <p className="hero-eyebrow">Bem-vindo(a) ao sistema</p>
          <h2>{userName}</h2>
          <p className="hero-meta">E/6ª CRE/GIN</p>
          {notice && <p className="page-description" style={{ marginTop: 8 }}>{notice}</p>}
        </div>
        <div className="hero-actions">
          <button type="button" className="hero-button primary" onClick={() => navigate('/nova-visita')}>+ NOVA VISITA</button>
          <button type="button" className="hero-button secondary" onClick={loadStats}>SINCRONIZAR AGORA</button>
        </div>
      </section>

      <div className="stats-grid">
        <article className="stat-card" onClick={() => navigate('/unidades')} style={{ cursor: 'pointer' }}>
          <div className="stat-icon">🏫</div><div><p className="stat-value">{loading ? '—' : stats.unidadesTotal}</p><p className="stat-label">Unidades</p><p className="page-description">Base oficial</p></div>
        </article>
        <article className="stat-card" onClick={() => navigate('/visitas')} style={{ cursor: 'pointer' }}>
          <div className="stat-icon">📋</div><div><p className="stat-value">{loading ? '—' : stats.visitasTotal}</p><p className="stat-label">Visitas</p><p className="page-description">Servidor: {stats.visitasServidor} | Pendentes: {stats.visitasPendentes}</p></div>
        </article>
        <article className="stat-card" onClick={() => navigate('/relatorios')} style={{ cursor: 'pointer' }}>
          <div className="stat-icon">📄</div><div><p className="stat-value">{loading ? '—' : stats.visitasServidor}</p><p className="stat-label">Relatórios disponíveis</p><p className="page-description">Visitas já sincronizadas</p></div>
        </article>
        <article className="stat-card">
          <div className="stat-icon">📷</div><div><p className="stat-value">{loading ? '—' : stats.fotos}</p><p className="stat-label">Fotos</p><p className="page-description">Servidor + pendências deste aparelho</p></div>
        </article>
      </div>

      <section className="recent-card">
        <div className="recent-header">
          <div><p className="page-label">Visitas Recentes</p><h2>Últimos registros</h2></div>
          <button type="button" className="empty-link" onClick={() => navigate('/visitas')}>Ver todas →</button>
        </div>
        {recentVisits.length === 0 ? <div className="empty-state"><p>Nenhuma visita disponível.</p><button type="button" className="empty-button" onClick={() => navigate('/nova-visita')}>Nova Visita</button></div> : (
          <div style={{ overflowX: 'auto' }}><table className="table-list"><thead><tr><th>Data</th><th>Designação</th><th>Unidade</th><th>Tipo</th><th>Representante</th><th>Fotos</th><th>Origem</th></tr></thead><tbody>{recentVisits.map((visit) => <tr key={`${visit.origem}-${visit.id}`}><td>{formatDate(visit.data)}</td><td>{visit.designacao}</td><td>{visit.unidade}</td><td>{visit.tipo}</td><td>{visit.representante}</td><td>{visit.fotos}</td><td><span className="status-chip">{visit.origem}</span></td></tr>)}</tbody></table></div>
        )}
      </section>
    </div>
  );
}
