import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { UserProfile } from '../App';

interface SupabaseVisita {
  id: string;
  visitor_name?: string | null;
  unidade_id?: string | null;
  visit_date?: string | null;
  notes?: string | null;
  created_by?: string | null;
}

interface LocalVisitRecord {
  id: string;
  unidade_id: string;
  unidade_nome: string;
  designacao?: string | null;
  endereco?: string | null;
  bairro?: string | null;
  telefone?: string | null;
  diretor_geral?: string | null;
  celular_diretor_geral?: string | null;
  diretor_adjunto?: string | null;
  celular_diretor_adjunto?: string | null;
  visit_date: string;
  tipo: string;
  representante: string;
  servicos: string;
  observacoes: string;
  conclusao: string;
  photo_count: number;
  fotos?: { name: string; caption: string }[];
  created_by?: string;
  created_at: string;
}

interface UnifiedVisit {
  id: string;
  source: 'supabase' | 'local';
  data: string;
  designacao: string;
  unidade: string;
  bairro: string;
  telefone: string;
  diretor: string;
  tipo: string;
  status: string;
  fotos: number;
  representante: string;
  servicos: string;
  observacoes: string;
  conclusao: string;
  criadoPor?: string | null;
}

interface VisitasProps {
  profile: UserProfile | null;
}

const LOCAL_VISITS_KEY = 'ginfotos_visitas_local';

function loadLocalVisits(): LocalVisitRecord[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_VISITS_KEY) || '[]') as LocalVisitRecord[];
  } catch {
    return [];
  }
}

function formatDate(value?: string | null) {
  if (!value) return 'Não informado';
  const [year, month, day] = value.slice(0, 10).split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function notesValue(notes: string | null | undefined, label: string) {
  if (!notes) return '';
  const line = notes.split('\n').find((item) => item.toLowerCase().startsWith(label.toLowerCase()));
  return line ? line.replace(new RegExp(`^${label}:?\\s*`, 'i'), '').trim() : '';
}

function fromSupabase(item: SupabaseVisita): UnifiedVisit {
  const tipo = notesValue(item.notes, 'Tipo de visita/obra') || 'VISTORIA TÉCNICA';
  const designacao = notesValue(item.notes, 'Designacao') || item.unidade_id || '—';
  const unidade = notesValue(item.notes, 'Unidade escolar') || item.unidade_id || 'Unidade não informada';
  return {
    id: item.id,
    source: 'supabase',
    data: item.visit_date || '',
    designacao,
    unidade,
    bairro: notesValue(item.notes, 'Bairro') || '—',
    telefone: notesValue(item.notes, 'Telefone') || '—',
    diretor: notesValue(item.notes, 'Diretor') || '—',
    tipo,
    status: 'SINCRONIZADA',
    fotos: 0,
    representante: item.visitor_name || notesValue(item.notes, 'Representante E/6 CRE/GIN') || 'ENGA. MARCIA BRAGA',
    servicos: notesValue(item.notes, 'Servicos verificados') || item.notes || '—',
    observacoes: notesValue(item.notes, 'Observacoes') || '—',
    conclusao: notesValue(item.notes, 'Conclusao') || '—',
    criadoPor: item.created_by
  };
}

function fromLocal(item: LocalVisitRecord): UnifiedVisit {
  return {
    id: item.id,
    source: 'local',
    data: item.visit_date,
    designacao: item.designacao || item.unidade_id || '—',
    unidade: item.unidade_nome,
    bairro: item.bairro || '—',
    telefone: item.telefone || '—',
    diretor: item.diretor_geral || '—',
    tipo: item.tipo || 'VISTORIA TÉCNICA',
    status: 'SALVA NO DISPOSITIVO',
    fotos: item.photo_count || item.fotos?.length || 0,
    representante: item.representante || 'ENGA. MARCIA BRAGA',
    servicos: item.servicos || '—',
    observacoes: item.observacoes || '—',
    conclusao: item.conclusao || '—',
    criadoPor: item.created_by
  };
}

export default function Visitas({ profile }: VisitasProps) {
  const [visitas, setVisitas] = useState<UnifiedVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<UnifiedVisit | null>(null);
  const navigate = useNavigate();

  const loadVisitas = async () => {
    setLoading(true);
    const localVisits = loadLocalVisits().map(fromLocal);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 3500);

    try {
      const { data, error } = await supabase
        .from('visitas')
        .select('*')
        .order('visit_date', { ascending: false })
        .abortSignal(controller.signal);

      if (error) {
        setMessage('Não foi possível carregar visitas do Supabase. Mostrando visitas salvas no dispositivo.');
        setVisitas(localVisits);
      } else {
        const remoteVisits = (data || []).map((item) => fromSupabase(item as SupabaseVisita));
        const merged = [...localVisits, ...remoteVisits].filter(
          (item, index, array) => index === array.findIndex((candidate) => candidate.id === item.id)
        );
        setVisitas(merged.sort((a, b) => (b.data || '').localeCompare(a.data || '')));
        setMessage(localVisits.length ? 'Visitas locais carregadas e disponíveis para relatório.' : 'Visitas carregadas.');
      }
    } catch {
      setMessage('Tempo esgotado ao carregar o Supabase. Mostrando visitas salvas no dispositivo.');
      setVisitas(localVisits);
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVisitas();
    const handler = () => loadVisitas();
    window.addEventListener('ginfotos-visitas-updated', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('ginfotos-visitas-updated', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return visitas;
    return visitas.filter((item) =>
      [item.data, item.designacao, item.unidade, item.bairro, item.telefone, item.diretor, item.tipo, item.status, item.representante]
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }, [query, visitas]);

  return (
    <div className="dashboard-page">
      <div className="top-row">
        <div><p className="page-label">Registros</p><h1>Visitas Técnicas</h1></div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><button type="button" className="empty-button" onClick={loadVisitas}>Atualizar</button><button type="button" className="empty-button" onClick={() => navigate('/nova-visita')}>+ Nova Visita</button></div>
      </div>

      <section className="page-card">
        <p className="page-description">Consulte as visitas sincronizadas e as visitas salvas no dispositivo. As visitas criadas localmente aparecem aqui e também alimentam Relatórios Word.</p>
        <div style={{ display: 'flex', gap: 12, margin: '18px 0', flexWrap: 'wrap' }}><input aria-label="Buscar visitas" placeholder="Buscar por data, unidade, designação, tipo ou status" value={query} onChange={(event) => setQuery(event.target.value)} style={{ flex: '1 1 260px' }} /><span className="status-pill">{filtered.length} visita(s)</span></div>
        {message && <p className="notice">{message}</p>}
        {loading ? <div className="empty-state"><p>Carregando visitas...</p></div> : filtered.length === 0 ? <div className="empty-state"><p>Nenhuma visita registrada ainda.</p><button type="button" className="empty-button" onClick={() => navigate('/nova-visita')}>Nova Visita</button></div> : <div style={{ overflowX: 'auto' }}><table className="table-list"><thead><tr><th>Data</th><th>Designação</th><th>Unidade</th><th>Tipo</th><th>Status</th><th>Fotos</th><th>Ações</th></tr></thead><tbody>{filtered.map((item) => <tr key={`${item.source}-${item.id}`}><td>{formatDate(item.data)}</td><td>{item.designacao}</td><td>{item.unidade}</td><td>{item.tipo}</td><td><span className="status-chip">{item.status}</span></td><td>{item.fotos}</td><td><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" className="empty-link" onClick={() => setSelected(item)}>Abrir</button><button type="button" className="empty-link" onClick={() => navigate('/relatorios')}>Gerar Word</button></div></td></tr>)}</tbody></table></div>}
      </section>

      {selected && <section className="page-card"><div className="recent-header"><div><p className="page-label">Detalhes da visita</p><h2>{selected.designacao} - {selected.unidade}</h2></div><button type="button" className="empty-link" onClick={() => setSelected(null)}>Fechar</button></div><p><strong>Data:</strong> {formatDate(selected.data)}</p><p><strong>Tipo:</strong> {selected.tipo}</p><p><strong>Status:</strong> {selected.status}</p><p><strong>Representante:</strong> {selected.representante}</p><p><strong>Serviços verificados:</strong> {selected.servicos}</p><p><strong>Observações:</strong> {selected.observacoes}</p><p><strong>Conclusão:</strong> {selected.conclusao}</p><p><strong>Fotos:</strong> {selected.fotos}</p><p><strong>Criado por:</strong> {selected.criadoPor === profile?.id || selected.criadoPor === profile?.email ? 'Você' : selected.criadoPor || '—'}</p></section>}
    </div>
  );
}
