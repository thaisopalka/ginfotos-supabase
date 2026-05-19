import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

interface UnidadeFolder {
  id: string;
  name: string;
  address?: string | null;
  designacao?: string | null;
  bairro?: string | null;
  telefone?: string | null;
  diretor_geral?: string | null;
  celular_diretor_geral?: string | null;
  diretor_adjunto?: string | null;
  celular_diretor_adjunto?: string | null;
  origem?: string;
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
  conclusao?: string;
  photo_count: number;
}

interface SupabaseVisit {
  id: string;
  unidade_id?: string | null;
  visit_date?: string | null;
  visitor_name?: string | null;
  notes?: string | null;
}

interface FolderVisit {
  id: string;
  data: string;
  tipo: string;
  representante: string;
  fotos: number;
  resumo: string;
  conclusao: string;
  origem: string;
}

const LOCAL_VISITS_KEY = 'ginfotos_visitas_local';
const LOCAL_UNIDADES_KEY = 'ginfotos_unidades_local';

const fallbackUnidades: UnidadeFolder[] = [
  { id: '06-22-204', designacao: '06.22.204', name: 'GET JOAO DO RIO', address: '', bairro: '', origem: 'Base provisoria' },
  { id: '06-22-001', designacao: '06.22.001', name: 'EM GUILHERME TELL', address: '', bairro: '', origem: 'Base provisoria' },
  { id: '06-25-000', designacao: '06.25.000', name: 'EM ALZIRO ZARUR', address: '', bairro: '', origem: 'Base provisoria' }
];

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

function valueOrDefault(value?: string | null) {
  return value && value.trim() ? value : 'Nao informado';
}

function normalizeUnidade(item: Partial<UnidadeFolder>): UnidadeFolder {
  return {
    id: item.id || `local-${item.designacao || item.name || Date.now()}`,
    name: item.name || 'Unidade sem nome',
    address: item.address || '',
    designacao: item.designacao || '',
    bairro: item.bairro || '',
    telefone: item.telefone || '',
    diretor_geral: item.diretor_geral || '',
    celular_diretor_geral: item.celular_diretor_geral || '',
    diretor_adjunto: item.diretor_adjunto || '',
    celular_diretor_adjunto: item.celular_diretor_adjunto || '',
    origem: item.origem || 'Local'
  };
}

function mergeUnidades(...groups: UnidadeFolder[][]) {
  const map = new Map<string, UnidadeFolder>();
  groups.flat().forEach((item) => {
    const normalized = normalizeUnidade(item);
    const key = (normalized.designacao || normalized.id || normalized.name).toLowerCase();
    if (!map.has(key)) map.set(key, normalized);
  });
  return Array.from(map.values()).sort((a, b) => (a.designacao || a.name).localeCompare(b.designacao || b.name));
}

function getRemoteUnitKey(visit: SupabaseVisit) {
  return notesValue(visit.notes, 'Designacao') || notesValue(visit.notes, 'Unidade escolar') || visit.unidade_id || '';
}

function visitMatchesFolder(visit: LocalVisitRecord, folder: UnidadeFolder) {
  const folderName = folder.name?.toLowerCase();
  const folderDesignation = folder.designacao?.toLowerCase();
  return (
    visit.unidade_id === folder.id ||
    visit.designacao?.toLowerCase() === folderDesignation ||
    visit.unidade_nome?.toLowerCase() === folderName
  );
}

export default function Pastas() {
  const [unidades, setUnidades] = useState<UnidadeFolder[]>(fallbackUnidades);
  const [localVisits, setLocalVisits] = useState<LocalVisitRecord[]>([]);
  const [remoteVisits, setRemoteVisits] = useState<SupabaseVisit[]>([]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const loadData = async () => {
    const localUnits = loadLocalArray<UnidadeFolder>(LOCAL_UNIDADES_KEY).map((item) => ({ ...item, origem: item.origem || 'Local' }));
    const localVisitData = loadLocalArray<LocalVisitRecord>(LOCAL_VISITS_KEY);
    setLocalVisits(localVisitData);
    setUnidades(mergeUnidades(localUnits, fallbackUnidades));

    try {
      const unidadesResult = await supabase
        .from('unidades')
        .select('id, name, address, designacao, bairro, telefone, diretor_geral, celular_diretor_geral, diretor_adjunto, celular_diretor_adjunto')
        .order('name');

      if (!unidadesResult.error && unidadesResult.data && unidadesResult.data.length > 0) {
        setUnidades(mergeUnidades(localUnits, (unidadesResult.data as UnidadeFolder[]).map((item) => ({ ...item, origem: 'Supabase' })), fallbackUnidades));
      }

      const visitasResult = await supabase.from('visitas').select('id, unidade_id, visit_date, visitor_name, notes').order('visit_date', { ascending: false });
      if (!visitasResult.error && visitasResult.data) {
        setRemoteVisits(visitasResult.data as SupabaseVisit[]);
      } else {
        setMessage('Pastas carregadas. Visitas locais continuam disponiveis se o Supabase falhar.');
      }
    } catch {
      setMessage('Supabase nao respondeu. Pastas locais/importadas continuam disponiveis.');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const folders = useMemo(() => {
    const term = query.trim().toLowerCase();
    return unidades.filter((unidade) => {
      const searchable = [
        unidade.designacao,
        unidade.name,
        unidade.address,
        unidade.bairro,
        unidade.telefone,
        unidade.diretor_geral,
        unidade.celular_diretor_geral,
        unidade.diretor_adjunto,
        unidade.celular_diretor_adjunto,
        unidade.origem
      ]
        .join(' ')
        .toLowerCase();
      return !term || searchable.includes(term);
    });
  }, [query, unidades]);

  const selectedFolder = useMemo(() => unidades.find((item) => item.id === selectedId) || null, [selectedId, unidades]);

  const visitsByFolder = useMemo<FolderVisit[]>(() => {
    if (!selectedFolder) return [];

    const localMatches = localVisits
      .filter((visit) => visitMatchesFolder(visit, selectedFolder))
      .map((visit) => ({
        id: visit.id,
        data: visit.visit_date,
        tipo: visit.tipo || 'VISTORIA TECNICA',
        representante: visit.representante || 'ENGA. MARCIA BRAGA',
        fotos: visit.photo_count || 0,
        resumo: visit.servicos || visit.observacoes || 'Visita registrada.',
        conclusao: visit.conclusao || 'Nao informado',
        origem: 'Dispositivo'
      }));

    const selectedKeys = [selectedFolder.id, selectedFolder.designacao, selectedFolder.name].filter(Boolean).map((item) => String(item).toLowerCase());

    const remoteMatches = remoteVisits
      .filter((visit) => selectedKeys.includes(getRemoteUnitKey(visit).toLowerCase()) || selectedKeys.includes(String(visit.unidade_id || '').toLowerCase()))
      .map((visit) => ({
        id: visit.id,
        data: visit.visit_date || '',
        tipo: notesValue(visit.notes, 'Tipo de visita/obra') || 'VISTORIA TECNICA',
        representante: visit.visitor_name || notesValue(visit.notes, 'Representante E/6 CRE/GIN') || 'ENGA. MARCIA BRAGA',
        fotos: 0,
        resumo: notesValue(visit.notes, 'Servicos verificados') || visit.notes || 'Visita sincronizada.',
        conclusao: notesValue(visit.notes, 'Conclusao') || 'Nao informado',
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
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="empty-button" onClick={loadData}>Atualizar</button>
          <button type="button" className="empty-button" onClick={() => navigate('/nova-visita')}>+ Nova Visita</button>
        </div>
      </div>

      <section className="page-card">
        <p className="page-description">Cada unidade escolar aparece como uma pasta completa, com endereco, telefone, direcao e historico de visitas.</p>
        <div style={{ display: 'flex', gap: 12, margin: '18px 0', flexWrap: 'wrap' }}>
          <input aria-label="Buscar pasta" placeholder="Buscar por designacao, unidade, bairro, telefone ou diretor" value={query} onChange={(event) => setQuery(event.target.value)} style={{ flex: '1 1 260px' }} />
          <span className="status-pill">{folders.length} pasta(s)</span>
        </div>
        {message && <p className="notice">{message}</p>}
      </section>

      <section className="stats-grid">
        {folders.map((folder) => (
          <button key={`${folder.origem}-${folder.id}-${folder.designacao}`} type="button" className="stat-card" onClick={() => setSelectedId(folder.id)} style={{ textAlign: 'left', cursor: 'pointer' }}>
            <div className="stat-icon" aria-hidden="true">PA</div>
            <div>
              <p className="stat-value" style={{ fontSize: '1.05rem' }}>{folder.designacao || 'Sem designacao'}</p>
              <p className="stat-label">{folder.name}</p>
              <p className="page-description" style={{ margin: '6px 0 0' }}>{folder.bairro || 'Bairro nao informado'}</p>
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, margin: '18px 0' }}>
            <div className="empty-state" style={{ textAlign: 'left', padding: 14 }}>
              <strong>Telefone</strong>
              <p>{valueOrDefault(selectedFolder.telefone)}</p>
            </div>
            <div className="empty-state" style={{ textAlign: 'left', padding: 14 }}>
              <strong>Diretor(a) Geral</strong>
              <p>{valueOrDefault(selectedFolder.diretor_geral)}</p>
              <p>{valueOrDefault(selectedFolder.celular_diretor_geral)}</p>
            </div>
            <div className="empty-state" style={{ textAlign: 'left', padding: 14 }}>
              <strong>Diretor(a) Adjunto(a)</strong>
              <p>{valueOrDefault(selectedFolder.diretor_adjunto)}</p>
              <p>{valueOrDefault(selectedFolder.celular_diretor_adjunto)}</p>
            </div>
            <div className="empty-state" style={{ textAlign: 'left', padding: 14 }}>
              <strong>Origem da base</strong>
              <p>{selectedFolder.origem || 'Supabase'}</p>
            </div>
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
                    <th>Conclusao</th>
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
                      <td>{visit.conclusao}</td>
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
