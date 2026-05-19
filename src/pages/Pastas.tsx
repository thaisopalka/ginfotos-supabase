import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

interface UnidadeFolder {
  id: string;
  name: string;
  address?: string | null;
  designacao?: string | null;
  bairro?: string | null;
}

interface LocalVisitRecord {
  id: string;
  unidade_id: string;
  unidade_nome: string;
  designacao?: string | null;
  visit_date: string;
  tipo: string;
  representante: string;
  servicos: string;
  observacoes: string;
  photo_count: number;
}

interface SupabaseVisit {
  id: string;
  unidade_id?: string | null;
  visit_date?: string | null;
  visitor_name?: string | null;
  notes?: string | null;
}

const LOCAL_VISITS_KEY = 'ginfotos_visitas_local';
const fallbackUnidades: UnidadeFolder[] = [
  { id: '06-22-204', designacao: '06.22.204', name: 'GET JOAO DO RIO', address: '', bairro: '' },
  { id: '06-22-001', designacao: '06.22.001', name: 'EM GUILHERME TELL', address: '', bairro: '' },
  { id: '06-25-000', designacao: '06.25.000', name: 'EM ALZIRO ZARUR', address: '', bairro: '' }
];

function loadLocalVisits(): LocalVisitRecord[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_VISITS_KEY) || '[]') as LocalVisitRecord[];
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

export default function Pastas() {
  const [unidades, setUnidades] = useState<UnidadeFolder[]>(fallbackUnidades);
  const [localVisits, setLocalVisits] = useState<LocalVisitRecord[]>([]);
  const [remoteVisits, setRemoteVisits] = useState<SupabaseVisit[]>([]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    async function loadData() {
      setLocalVisits(loadLocalVisits());

      const unidadesResult = await supabase.from('unidades').select('id, name, address, designacao, bairro').order('name');
      if (!unidadesResult.error && unidadesResult.data && unidadesResult.data.length > 0) {
        setUnidades(unidadesResult.data as UnidadeFolder[]);
      }

      const visitasResult = await supabase.from('visitas').select('id, unidade_id, visit_date, visitor_name, notes').order('visit_date', { ascending: false });
      if (!visitasResult.error && visitasResult.data) {
        setRemoteVisits(visitasResult.data as SupabaseVisit[]);
      } else {
        setMessage('Pastas carregadas. Visitas locais continuam disponiveis se o Supabase falhar.');
      }
    }

    loadData();
  }, []);

  const folders = useMemo(() => {
    const term = query.trim().toLowerCase();
    return unidades.filter((unidade) => {
      const searchable = [unidade.designacao, unidade.name, unidade.address, unidade.bairro].join(' ').toLowerCase();
      return !term || searchable.includes(term);
    });
  }, [query, unidades]);

  const selectedFolder = useMemo(() => unidades.find((item) => item.id === selectedId) || null, [selectedId, unidades]);

  const visitsByFolder = useMemo(() => {
    if (!selectedFolder) return [];

    const localMatches = localVisits
      .filter((visit) => visit.unidade_id === selectedFolder.id || visit.designacao === selectedFolder.designacao || visit.unidade_nome === selectedFolder.name)
      .map((visit) => ({
        id: visit.id,
        data: visit.visit_date,
        tipo: visit.tipo || 'VISTORIA TECNICA',
        representante: visit.representante || 'ENGA. MARCIA BRAGA',
        fotos: visit.photo_count || 0,
        resumo: visit.servicos || visit.observacoes || 'Visita registrada.',
        origem: 'Dispositivo'
      }));

    const remoteMatches = remoteVisits
      .filter((visit) => visit.unidade_id === selectedFolder.id)
      .map((visit) => ({
        id: visit.id,
        data: visit.visit_date || '',
        tipo: notesValue(visit.notes, 'Tipo de visita/obra') || 'VISTORIA TECNICA',
        representante: visit.visitor_name || notesValue(visit.notes, 'Representante E/6 CRE/GIN') || 'ENGA. MARCIA BRAGA',
        fotos: 0,
        resumo: notesValue(visit.notes, 'Servicos verificados') || visit.notes || 'Visita sincronizada.',
        origem: 'Supabase'
      }));

    return [...localMatches, ...remoteMatches].sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  }, [localVisits, remoteVisits, selectedFolder]);

  return (
    <div className="dashboard-page">
      <div className="top-row">
        <div>
          <p className="page-label">Arquivo por unidade</p>
          <h1>Pastas</h1>
        </div>
        <button type="button" className="empty-button" onClick={() => navigate('/nova-visita')}>
          + Nova Visita
        </button>
      </div>

      <section className="page-card">
        <p className="page-description">Cada unidade escolar aparece como uma pasta. Ao abrir, voce ve as visitas registradas para aquela escola.</p>
        <div style={{ display: 'flex', gap: 12, margin: '18px 0', flexWrap: 'wrap' }}>
          <input aria-label="Buscar pasta" placeholder="Buscar por designacao, unidade, endereco ou bairro" value={query} onChange={(event) => setQuery(event.target.value)} style={{ flex: '1 1 260px' }} />
          <span className="status-pill">{folders.length} pasta(s)</span>
        </div>
        {message && <p className="notice">{message}</p>}
      </section>

      <section className="stats-grid">
        {folders.map((folder) => (
          <button key={folder.id} type="button" className="stat-card" onClick={() => setSelectedId(folder.id)} style={{ textAlign: 'left', cursor: 'pointer' }}>
            <div className="stat-icon" aria-hidden="true">PA</div>
            <div>
              <p className="stat-value" style={{ fontSize: '1.05rem' }}>{folder.designacao || 'Sem designacao'}</p>
              <p className="stat-label">{folder.name}</p>
            </div>
          </button>
        ))}
      </section>

      {selectedFolder && (
        <section className="page-card">
          <div className="recent-header">
            <div>
              <p className="page-label">Pasta da unidade</p>
              <h2>{selectedFolder.designacao || 'Sem designacao'} - {selectedFolder.name}</h2>
              <p className="page-description">{selectedFolder.address || 'Endereco nao informado'} {selectedFolder.bairro ? `- ${selectedFolder.bairro}` : ''}</p>
            </div>
            <button type="button" className="empty-link" onClick={() => setSelectedId(null)}>Fechar</button>
          </div>

          {visitsByFolder.length === 0 ? (
            <div className="empty-state">
              <p>Nenhuma visita nesta unidade ainda.</p>
              <button type="button" className="empty-button" onClick={() => navigate('/nova-visita')}>Nova Visita</button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table-list">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Tipo</th>
                    <th>Representante</th>
                    <th>Fotos</th>
                    <th>Origem</th>
                    <th>Resumo</th>
                  </tr>
                </thead>
                <tbody>
                  {visitsByFolder.map((visit) => (
                    <tr key={`${visit.origem}-${visit.id}`}>
                      <td>{formatDate(visit.data)}</td>
                      <td>{visit.tipo}</td>
                      <td>{visit.representante}</td>
                      <td>{visit.fotos}</td>
                      <td><span className="status-chip">{visit.origem}</span></td>
                      <td>{visit.resumo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
