import { useEffect, useMemo, useState } from 'react';
import { downloadWordReport, WordReportPhoto, WordReportVisit } from '../lib/wordReport';
import { supabase } from '../lib/supabaseClient';

interface ApiPhoto {
  name?: string;
  caption?: string;
  dataUrl?: string;
  url?: string;
  path?: string;
}

interface ApiVisit {
  id: string;
  visitor_name?: string | null;
  unidade_id?: string | null;
  visit_date?: string | null;
  notes?: string | null;
  created_by?: string | null;
  photo_count?: number;
  photos?: ApiPhoto[];
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
  fotos?: WordReportPhoto[];
  created_by?: string;
  created_at: string;
}

interface UnitRecord {
  id?: string | null;
  designacao?: string | null;
  name?: string | null;
  address?: string | null;
}

interface ReportVisit extends WordReportVisit {
  id: string;
  origem: 'local' | 'servidor';
  photoCount?: number;
}

const LOCAL_VISITS_KEY = 'ginfotos_visitas_local';
const LOCAL_UNIDADES_KEY = 'ginfotos_unidades_local';

function loadLocalVisits(): LocalVisitRecord[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_VISITS_KEY) || '[]') as LocalVisitRecord[];
  } catch {
    return [];
  }
}

function loadLocalUnits(): UnitRecord[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_UNIDADES_KEY) || '[]') as UnitRecord[];
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

function valueOrDefault(value?: string | null) {
  return value && value.trim() ? value : 'Não informado';
}

function normalizeMatch(value?: string | null) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function unitMatchesVisit(unit: UnitRecord, visit: ReportVisit) {
  const visitDesignation = normalizeMatch(visit.designacao);
  const visitName = normalizeMatch(visit.unidade);
  const unitDesignation = normalizeMatch(unit.designacao);
  const unitName = normalizeMatch(unit.name);
  const unitId = normalizeMatch(unit.id);

  if (visitDesignation && (visitDesignation === unitDesignation || visitDesignation === unitId)) return true;
  if (visitName && visitName === unitName) return true;
  return false;
}

function resolveAddressFromUnits(visit: ReportVisit, officialUnits: UnitRecord[], localUnits: UnitRecord[]) {
  const official = officialUnits.find((unit) => unitMatchesVisit(unit, visit) && unit.address?.trim());
  if (official?.address?.trim()) return official.address.trim();

  const local = localUnits.find((unit) => unitMatchesVisit(unit, visit) && unit.address?.trim());
  if (local?.address?.trim()) return local.address.trim();

  if (visit.endereco && visit.endereco.trim() && visit.endereco.trim().toLowerCase() !== 'não informado') {
    return visit.endereco.trim();
  }

  return 'Não informado';
}

async function fetchOfficialUnits() {
  try {
    const { data, error } = await supabase
      .from('unidades')
      .select('id, designacao, name, address')
      .order('designacao');

    if (error || !data) return [];
    return data as UnitRecord[];
  } catch {
    return [];
  }
}

function localToReport(item: LocalVisitRecord): ReportVisit {
  return {
    id: item.id,
    origem: 'local',
    data: item.visit_date,
    designacao: valueOrDefault(item.designacao || item.unidade_id),
    unidade: valueOrDefault(item.unidade_nome),
    endereco: valueOrDefault(item.endereco),
    bairro: valueOrDefault(item.bairro),
    diretorGeral: valueOrDefault(item.diretor_geral),
    representante: item.representante || 'Engenheira Márcia Braga',
    servicos: valueOrDefault(item.servicos),
    observacoes: valueOrDefault(item.observacoes),
    conclusao: valueOrDefault(item.conclusao),
    fotos: item.fotos || [],
    photoCount: item.photo_count || item.fotos?.length || 0
  };
}

function apiToReport(item: ApiVisit): ReportVisit {
  const fotos: WordReportPhoto[] = (item.photos || []).map((photo, index) => ({
    name: photo.name || `Foto ${index + 1}`,
    caption: photo.caption || '',
    dataUrl: photo.dataUrl,
    url: photo.url,
    path: photo.path
  }));
  return {
    id: item.id,
    origem: 'servidor',
    data: item.visit_date || '',
    designacao: valueOrDefault(notesValue(item.notes, 'Designacao') || item.unidade_id),
    unidade: valueOrDefault(notesValue(item.notes, 'Unidade escolar') || item.unidade_id),
    endereco: valueOrDefault(notesValue(item.notes, 'Endereco')),
    bairro: valueOrDefault(notesValue(item.notes, 'Bairro')),
    diretorGeral: valueOrDefault(notesValue(item.notes, 'Diretor') || notesValue(item.notes, 'Diretor geral') || notesValue(item.notes, 'Diretor(a) geral')),
    representante: item.visitor_name || notesValue(item.notes, 'Representante E/6 CRE/GIN') || 'Engenheira Márcia Braga',
    servicos: valueOrDefault(notesValue(item.notes, 'Servicos verificados')),
    observacoes: valueOrDefault(notesValue(item.notes, 'Observacoes')),
    conclusao: valueOrDefault(notesValue(item.notes, 'Conclusao')),
    fotos,
    photoCount: Number(item.photo_count || fotos.length || 0)
  };
}

async function fetchVisitList() {
  const response = await fetch(`/api/visitas?ts=${Date.now()}`, {
    method: 'GET',
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Servidor de visitas não respondeu.');
  return (Array.isArray(payload.data) ? payload.data : []) as ApiVisit[];
}

async function fetchVisitDetail(id: string) {
  const response = await fetch(`/api/visitas?id=${encodeURIComponent(id)}&ts=${Date.now()}`, {
    method: 'GET',
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.visit) throw new Error(payload.error || 'Não foi possível carregar os dados completos da visita.');
  return payload.visit as ApiVisit;
}

export default function Relatorios() {
  const [visitas, setVisitas] = useState<ReportVisit[]>([]);
  const [officialUnits, setOfficialUnits] = useState<UnitRecord[]>([]);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadVisits = async () => {
    setLoading(true);
    setNotice('Carregando visitas sincronizadas do servidor...');
    const localPending = loadLocalVisits().filter((item) => item.id.startsWith('local-')).map(localToReport);

    void fetchOfficialUnits().then((units) => {
      if (units.length > 0) setOfficialUnits(units);
    });

    try {
      const remoteRows = await fetchVisitList();
      const remote = remoteRows.map(apiToReport);
      const remoteIds = new Set(remote.map((item) => item.id));
      const onlyPending = localPending.filter((item) => !remoteIds.has(item.id));
      const merged = [...remote, ...onlyPending].sort((a, b) => (b.data || '').localeCompare(a.data || ''));
      setVisitas(merged);
      setNotice(`${remote.length} visita(s) sincronizada(s) disponíveis para gerar Word.${onlyPending.length ? ` ${onlyPending.length} visita(s) ainda pendente(s) neste aparelho.` : ''}`);
    } catch (error) {
      setVisitas(localPending);
      setNotice(`Servidor não respondeu: ${error instanceof Error ? error.message : 'erro desconhecido'}.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVisits();
    const handler = () => loadVisits();
    window.addEventListener('ginfotos-visitas-updated', handler);
    window.addEventListener('storage', handler);
    window.addEventListener('focus', handler);
    return () => {
      window.removeEventListener('ginfotos-visitas-updated', handler);
      window.removeEventListener('storage', handler);
      window.removeEventListener('focus', handler);
    };
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return visitas;
    return visitas.filter((visit) =>
      [visit.designacao, visit.unidade, visit.endereco, visit.bairro, visit.diretorGeral, visit.data, visit.representante]
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }, [query, visitas]);

  const handleGenerate = async (visit: ReportVisit) => {
    setGeneratingId(visit.id);
    setNotice('Carregando dados completos, endereço oficial e fotos para gerar o Word...');

    try {
      let completeVisit = visit;
      if (visit.origem === 'servidor') {
        const detailed = await fetchVisitDetail(visit.id);
        completeVisit = apiToReport(detailed);
      }

      const official = officialUnits.length > 0 ? officialUnits : await fetchOfficialUnits();
      if (official.length > 0 && officialUnits.length === 0) setOfficialUnits(official);

      const resolvedAddress = resolveAddressFromUnits(completeVisit, official, loadLocalUnits());
      const reportVisit: ReportVisit = { ...completeVisit, endereco: resolvedAddress };

      await downloadWordReport(reportVisit);
      setNotice(`Relatório Word gerado com sucesso${reportVisit.fotos.length ? ` com ${reportVisit.fotos.length} foto(s)` : ''}.`);
    } catch (error) {
      setNotice(`Não foi possível gerar o DOCX: ${error instanceof Error ? error.message : 'erro desconhecido'}.`);
    } finally {
      setGeneratingId(null);
    }
  };

  return (
    <div className="dashboard-page">
      <div className="top-row">
        <div>
          <p className="page-label">Documentos</p>
          <h1>Relatórios Word</h1>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="primary sync-strong" onClick={loadVisits} disabled={loading}>{loading ? 'ATUALIZANDO...' : '🔄 ATUALIZAR VISITAS'}</button>
          <span className="status-pill">{filtered.length} visita(s)</span>
        </div>
      </div>

      <section className="page-card">
        <p className="page-description">
          Gera relatório em DOCX real, A4 retrato, fonte Calibri, com primeira página de dados e fotos a partir da segunda página.
        </p>
        <div style={{ display: 'flex', gap: 12, margin: '18px 0', flexWrap: 'wrap' }}>
          <input
            aria-label="Buscar visita para relatório"
            placeholder="Buscar por designação, unidade, bairro, diretor, data ou representante"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            style={{ flex: '1 1 260px' }}
          />
        </div>
        {notice && <p className="notice">{notice}</p>}
      </section>

      {filtered.length === 0 ? (
        <section className="empty-state">
          <p>{loading ? 'Carregando visitas do servidor...' : 'Nenhuma visita disponível para gerar relatório.'}</p>
        </section>
      ) : (
        <section className="page-card">
          <div style={{ overflowX: 'auto' }}>
            <table className="table-list">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Designação</th>
                  <th>Unidade</th>
                  <th>Bairro</th>
                  <th>Diretor(a)</th>
                  <th>Fotos</th>
                  <th>Origem</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((visit) => (
                  <tr key={`${visit.origem}-${visit.id}`}>
                    <td>{formatDate(visit.data)}</td>
                    <td>{visit.designacao}</td>
                    <td>{visit.unidade}</td>
                    <td>{visit.bairro}</td>
                    <td>{visit.diretorGeral}</td>
                    <td>{visit.photoCount ?? visit.fotos.length}</td>
                    <td><span className="status-chip">{visit.origem === 'local' ? 'Pendente' : 'Sincronizada'}</span></td>
                    <td>
                      <button type="button" className="primary" onClick={() => handleGenerate(visit)} disabled={generatingId === visit.id}>
                        {generatingId === visit.id ? 'GERANDO WORD...' : 'GERAR WORD (.DOCX)'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
