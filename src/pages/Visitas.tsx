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
  return {
    id: item.id,
    source: 'supabase',
    data: item.visit_date || '',
    designacao: item.unidade_id || '—',
    unidade: item.unidade_id || 'Unidade não informada',
    tipo,
    status: 'SINCRONIZADA',
    fotos: 0,
    representante: item.visitor_name || notesValue(item.notes, 'Representante E/6ª CRE/GIN') || 'ENGª. MÁRCIA BRAGA',
    servicos: notesValue(item.notes, 'Serviços verificados') || item.notes || '—',
    observacoes: notesValue(item.notes, 'Observações') || '—',
    conclusao: notesValue(item.notes, 'Conclusão') || '—',
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
    tipo: item.tipo || 'VISTORIA TÉCNICA',
    status: 'SALVA NO DISPOSITIVO',
    fotos: item.photo_count || item.fotos?.length || 0,
    representante: item.representante || 'ENGª. MÁRCIA BRAGA',
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

  useEffect(() => {
    let active = true;

    async function loadVisitas() {
      setLoading(true);
      const localVisits = loadLocalVisits().map(fromLocal);

      try {
        const timeout = new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error('timeout')), 5000);
        });

        const request = supabase.from('visitas').select('*').order('visit_date', { ascending: false });
        const { data, error } = await Promise.race([request, timeout]);

        if (!active) return;

        if (error) {
          setMessage('Não foi possível carregar visitas do Supabase. Mostrando visitas salvas no dispositivo.');
          setVisitas(localVisits);
        } else {
          const remoteVisits = (data || []).map((item) => fromSupabase(item as SupabaseVisita));
          const merged = [...localVisits, ...remoteVisits].filter(
            (item, index, array) => index === array.findIndex((candidate) => candidate.id === item.id)
          );
          setVisitas(merged);
        }
      } catch {
        if (!active) return;
        setMessage('Tempo esgotado ao carregar o Supabase. Mostrando visitas salvas no dispositivo.');
        setVisitas(localVisits);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadVisitas();

    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return visitas;
    return visitas.filter((item) =>
      [item.data, item.designacao, item.unidade, item.tipo, item.status, item.representante]
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }, [query, visitas]);

  return (
    <div className="dashboard-page">
      <div className="top-row">
        <div>
          <p className="page-label">Registros</p>
          <h1>Visitas Técnicas</h1>
        </div>
        <button type="button" className="empty-button" onClick={() => navigate('/nova-visita')}>
          + Nova Visita
        </button>
      </div>

      <section className="page-card">
        <p className="page-description">
          Consulte as visitas sincronizadas e as visitas salvas no dispositivo. A tela não fica mais presa em carregamento infinito.
        </p>

        <div style={{ display: 'flex', gap: 12, margin: '18px 0', flexWrap: 'wrap' }}>
          <input
            aria-label="Buscar visitas"
            placeholder="Buscar por data, unidade, designação, tipo ou status"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            style={{ flex: '1 1 260px' }}
          />
          <span className="status-pill">{filtered.length} visita(s)</span>
        </div>

        {message && <p className="notice">{message}</p>}

        {loading ? (
          <div className="empty-state">
            <p>Carregando visitas...</p>
          </div>
        ) : filtered.length === 0 ? (
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
                  <th>Status</th>
                  <th>Fotos</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={`${item.source}-${item.id}`}>
                    <td>{formatDate(item.data)}</td>
                    <td>{item.designacao}</td>
                    <td>{item.unidade}</td>
                    <td>{item.tipo}</td>
                    <td><span className="status-chip">{item.status}</span></td>
                    <td>{item.fotos}</td>
                    <td>
                      <button type="button" className="empty-link" onClick={() => setSelected(item)}>
                        Abrir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <section className="page-card">
          <div className="recent-header">
            <div>
              <p className="page-label">Detalhes da visita</p>
              <h2>{selected.designacao} - {selected.unidade}</h2>
            </div>
            <button type="button" className="empty-link" onClick={() => setSelected(null)}>
              Fechar
            </button>
          </div>
          <p><strong>Data:</strong> {formatDate(selected.data)}</p>
          <p><strong>Tipo:</strong> {selected.tipo}</p>
          <p><strong>Status:</strong> {selected.status}</p>
          <p><strong>Representante:</strong> {selected.representante}</p>
          <p><strong>Serviços verificados:</strong> {selected.servicos}</p>
          <p><strong>Observações:</strong> {selected.observacoes}</p>
          <p><strong>Conclusão:</strong> {selected.conclusao}</p>
          <p><strong>Fotos:</strong> {selected.fotos}</p>
          <p><strong>Criado por:</strong> {selected.criadoPor === profile?.id || selected.criadoPor === profile?.email ? 'Você' : selected.criadoPor || '—'}</p>
        </section>
      )}
    </div>
  );
}
