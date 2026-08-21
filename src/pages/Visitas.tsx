import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { UserProfile } from '../App';
import { notifyGinfotos } from '../lib/notifications';

interface SavedPhoto {
  name: string;
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
  created_at?: string | null;
  photo_count?: number;
  photos?: SavedPhoto[];
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
  visit_date: string;
  tipo: string;
  representante: string;
  servicos: string;
  observacoes: string;
  conclusao: string;
  photo_count: number;
  fotos?: SavedPhoto[];
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
  fotosLista: SavedPhoto[];
  representante: string;
  servicos: string;
  observacoes: string;
  conclusao: string;
  criadoPor?: string | null;
}

interface VisitasProps { profile: UserProfile | null; }

const LOCAL_VISITS_KEY = 'ginfotos_visitas_local';
const ADMIN_EMAIL = 'thaisopalka@gmail.com';

function loadLocalVisits(): LocalVisitRecord[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_VISITS_KEY) || '[]') as LocalVisitRecord[]; }
  catch { return []; }
}

function saveLocalVisits(visits: LocalVisitRecord[]) {
  try {
    localStorage.setItem(LOCAL_VISITS_KEY, JSON.stringify(visits.slice(0, 80)));
  } catch {
    const compact = visits.slice(0, 80).map((visit) => ({
      ...visit,
      fotos: (visit.fotos || []).map((photo) => ({ name: photo.name, caption: photo.caption }))
    }));
    try { localStorage.setItem(LOCAL_VISITS_KEY, JSON.stringify(compact)); } catch { /* sem espaco local */ }
  }
  window.dispatchEvent(new Event('ginfotos-visitas-updated'));
}

function formatDate(value?: string | null) {
  if (!value) return 'Não informado';
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function notesValue(notes: string | null | undefined, label: string) {
  if (!notes) return '';
  const line = notes.split('\n').find((item: string) => item.toLowerCase().startsWith(label.toLowerCase()));
  return line ? line.replace(new RegExp(`^${label}:?\\s*`, 'i'), '').trim() : '';
}

function buildNotes(visit: UnifiedVisit) {
  return [
    `Designacao: ${visit.designacao}`,
    `Unidade escolar: ${visit.unidade}`,
    `Bairro: ${visit.bairro}`,
    `Telefone: ${visit.telefone}`,
    `Diretor: ${visit.diretor}`,
    `Tipo de visita/obra: ${visit.tipo}`,
    `Representante E/6 CRE/GIN: ${visit.representante}`,
    `Servicos verificados: ${visit.servicos}`,
    `Observacoes: ${visit.observacoes}`,
    `Conclusao: ${visit.conclusao}`
  ].join('\n');
}

function buildNotesFromLocal(visit: LocalVisitRecord) {
  return [
    `Designacao: ${visit.designacao || visit.unidade_id || 'Nao informado'}`,
    `Unidade escolar: ${visit.unidade_nome || 'Nao informado'}`,
    `Bairro: ${visit.bairro || 'Nao informado'}`,
    `Telefone: ${visit.telefone || 'Nao informado'}`,
    `Diretor: ${visit.diretor_geral || 'Nao informado'}`,
    `Tipo de visita/obra: ${visit.tipo || 'VISTORIA TECNICA'}`,
    `Representante E/6 CRE/GIN: ${visit.representante || 'ENGA. MARCIA BRAGA'}`,
    `Servicos verificados: ${visit.servicos || 'Nao informado'}`,
    `Observacoes: ${visit.observacoes || 'Nao informado'}`,
    `Conclusao: ${visit.conclusao || 'Nao informado'}`,
    `GINFOTOS_CLIENT_ID:${visit.id}`
  ].join('\n');
}

function fromApi(item: ApiVisit): UnifiedVisit {
  const photos = Array.isArray(item.photos) ? item.photos : [];
  return {
    id: item.id,
    source: 'supabase',
    data: item.visit_date || '',
    designacao: notesValue(item.notes, 'Designacao') || item.unidade_id || '—',
    unidade: notesValue(item.notes, 'Unidade escolar') || item.unidade_id || 'Unidade não informada',
    bairro: notesValue(item.notes, 'Bairro') || '—',
    telefone: notesValue(item.notes, 'Telefone') || '—',
    diretor: notesValue(item.notes, 'Diretor') || '—',
    tipo: notesValue(item.notes, 'Tipo de visita/obra') || 'VISTORIA TÉCNICA',
    status: 'SINCRONIZADA',
    fotos: Number(item.photo_count || photos.length || 0),
    fotosLista: photos,
    representante: item.visitor_name || notesValue(item.notes, 'Representante E/6 CRE/GIN') || 'ENGA. MARCIA BRAGA',
    servicos: notesValue(item.notes, 'Servicos verificados') || '—',
    observacoes: notesValue(item.notes, 'Observacoes') || '—',
    conclusao: notesValue(item.notes, 'Conclusao') || '—',
    criadoPor: item.created_by
  };
}

function fromLocal(item: LocalVisitRecord): UnifiedVisit {
  const photos = item.fotos || [];
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
    status: item.id.startsWith('local-') ? 'PENDENTE DE SINCRONIZAÇÃO' : 'SALVA NO DISPOSITIVO',
    fotos: item.photo_count || photos.length || 0,
    fotosLista: photos,
    representante: item.representante || 'ENGA. MARCIA BRAGA',
    servicos: item.servicos || '—',
    observacoes: item.observacoes || '—',
    conclusao: item.conclusao || '—',
    criadoPor: item.created_by
  };
}

function toLocalRecord(visit: UnifiedVisit, original?: LocalVisitRecord): LocalVisitRecord {
  return {
    ...(original || {}),
    id: visit.id,
    unidade_id: original?.unidade_id || visit.designacao,
    unidade_nome: visit.unidade,
    designacao: visit.designacao,
    bairro: visit.bairro,
    telefone: visit.telefone,
    diretor_geral: visit.diretor,
    visit_date: visit.data,
    tipo: visit.tipo,
    representante: visit.representante,
    servicos: visit.servicos,
    observacoes: visit.observacoes,
    conclusao: visit.conclusao,
    photo_count: visit.fotosLista.length || visit.fotos,
    fotos: visit.fotosLista,
    created_by: visit.criadoPor || original?.created_by || '',
    created_at: original?.created_at || new Date().toISOString()
  } as LocalVisitRecord;
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) return {} as Record<string, unknown>;
  try { return JSON.parse(text) as Record<string, unknown>; }
  catch { throw new Error(`Servidor devolveu resposta inválida (${response.status}).`); }
}

async function fetchRemoteVisits() {
  const response = await fetch(`/api/visitas?ts=${Date.now()}`, {
    method: 'GET',
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' }
  });
  const payload = await readJsonResponse(response);
  if (!response.ok) throw new Error(String(payload.error || `Servidor de visitas respondeu ${response.status}.`));
  return (Array.isArray(payload.data) ? payload.data : []) as ApiVisit[];
}

async function fetchRemoteVisitDetail(id: string) {
  const response = await fetch(`/api/visitas?id=${encodeURIComponent(id)}&ts=${Date.now()}`, {
    method: 'GET',
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' }
  });
  const payload = await readJsonResponse(response);
  if (!response.ok || !payload.visit) throw new Error(String(payload.error || 'Não foi possível abrir a visita.'));
  return payload.visit as ApiVisit;
}

async function createRemoteVisit(visit: LocalVisitRecord) {
  const response = await fetch('/api/visitas', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    body: JSON.stringify({
      visit: {
        visitor_name: visit.representante,
        unidade_id: visit.unidade_id,
        visit_date: visit.visit_date,
        notes: buildNotesFromLocal(visit),
        created_by: visit.created_by || 'app'
      }
    })
  });
  const payload = await readJsonResponse(response);
  if (!response.ok || !payload.visit) throw new Error(String(payload.error || 'Falha ao enviar a visita.'));
  return payload.visit as ApiVisit;
}

async function uploadPhotoToRemoteVisit(visitId: string, photo: SavedPhoto) {
  if (!photo.dataUrl) return null;
  const response = await fetch(`/api/visitas?action=add-photo&id=${encodeURIComponent(visitId)}&ts=${Date.now()}`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    body: JSON.stringify({ photo: { name: photo.name, caption: photo.caption || '', dataUrl: photo.dataUrl } })
  });
  const payload = await readJsonResponse(response);
  if (!response.ok) throw new Error(String(payload.error || `Falha ao enviar a foto ${photo.name}.`));
  return payload.visit as ApiVisit | undefined;
}

async function pushPendingVisit(visit: LocalVisitRecord) {
  let remote = await createRemoteVisit(visit);
  const photos = (visit.fotos || []).filter((photo) => !!photo.dataUrl);

  for (const photo of photos) {
    const updated = await uploadPhotoToRemoteVisit(remote.id, photo);
    if (updated) remote = updated;
  }

  return { ...remote, photo_count: photos.length || remote.photo_count || 0 } as ApiVisit;
}

async function synchronizePendingLocals(localVisits: LocalVisitRecord[]) {
  let changed = false;
  let syncedCount = 0;
  const result: LocalVisitRecord[] = [];

  for (const visit of localVisits) {
    if (!visit.id.startsWith('local-')) {
      result.push(visit);
      continue;
    }

    try {
      const remote = await pushPendingVisit(visit);
      result.push({ ...visit, id: remote.id, photo_count: remote.photo_count ?? visit.photo_count });
      changed = true;
      syncedCount += 1;
    } catch {
      result.push(visit);
    }
  }

  if (changed) saveLocalVisits(result);
  return { visits: result, syncedCount };
}

export default function Visitas({ profile }: VisitasProps) {
  const [visitas, setVisitas] = useState<UnifiedVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<UnifiedVisit | null>(null);
  const [editing, setEditing] = useState<UnifiedVisit | null>(null);
  const navigate = useNavigate();
  const isAdminUser = profile?.email?.toLowerCase() === ADMIN_EMAIL || profile?.role === 'admin';

  const loadVisitas = async () => {
    setLoading(true);
    setMessage('Sincronizando visitas e fotos com todos os usuários...');

    const pendingResult = await synchronizePendingLocals(loadLocalVisits());
    const localRecords = pendingResult.visits;
    const localVisits = localRecords.map(fromLocal);

    try {
      const remoteRows = await fetchRemoteVisits();
      const localById = new Map(localVisits.map((item) => [item.id, item]));
      const remoteVisits = remoteRows.map((row) => {
        const remote = fromApi(row);
        const local = localById.get(remote.id);
        if (local) {
          if (!remote.unidade || remote.unidade === remote.designacao) remote.unidade = local.unidade;
          if (remote.designacao === '—') remote.designacao = local.designacao;
          if (remote.fotos === 0 && local.fotos > 0) remote.fotos = local.fotos;
        }
        return remote;
      });
      const remoteIds = new Set(remoteVisits.map((item) => item.id));
      const onlyLocal = localVisits.filter((item) => !remoteIds.has(item.id));
      const merged = [...remoteVisits, ...onlyLocal].sort((a, b) => (b.data || '').localeCompare(a.data || ''));
      setVisitas(merged);
      const pending = onlyLocal.filter((item) => item.id.startsWith('local-')).length;
      setMessage(`${remoteVisits.length} visita(s) no servidor. ${pendingResult.syncedCount ? `${pendingResult.syncedCount} pendente(s) enviada(s) agora. ` : ''}${pending ? `${pending} ainda pendente(s) neste aparelho.` : 'Tudo sincronizado.'}`);
    } catch (error) {
      setVisitas(localVisits.sort((a, b) => (b.data || '').localeCompare(a.data || '')));
      setMessage(`Servidor não respondeu: ${error instanceof Error ? error.message : 'erro desconhecido'}. As visitas deste aparelho continuam visíveis.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVisitas();
    const refresh = () => loadVisitas();
    const visibilityRefresh = () => { if (document.visibilityState === 'visible') loadVisitas(); };
    const intervalId = window.setInterval(() => { if (document.visibilityState === 'visible') loadVisitas(); }, 30000);
    window.addEventListener('ginfotos-visitas-updated', refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visibilityRefresh);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('ginfotos-visitas-updated', refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', visibilityRefresh);
    };
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return visitas;
    return visitas.filter((item) => [item.data, item.designacao, item.unidade, item.bairro, item.telefone, item.diretor, item.tipo, item.status, item.representante].join(' ').toLowerCase().includes(term));
  }, [query, visitas]);

  const loadDetail = async (visit: UnifiedVisit) => {
    if (visit.source === 'local' && visit.id.startsWith('local-')) return visit;
    try {
      const remote = fromApi(await fetchRemoteVisitDetail(visit.id));
      const local = loadLocalVisits().find((item) => item.id === visit.id);
      if (remote.fotosLista.length === 0 && local?.fotos?.length) {
        remote.fotosLista = local.fotos;
        remote.fotos = local.photo_count || local.fotos.length;
      }
      if ((!remote.unidade || remote.unidade === remote.designacao) && visit.unidade) remote.unidade = visit.unidade;
      if (remote.designacao === '—') remote.designacao = visit.designacao;
      return remote;
    } catch {
      return visit;
    }
  };

  const openVisit = async (visit: UnifiedVisit) => {
    setMessage('Abrindo visita e recuperando fotos...');
    const detailed = await loadDetail(visit);
    setSelected(detailed);
    setMessage(detailed.fotosLista.length ? `${detailed.fotosLista.length} foto(s) carregada(s).` : 'Visita aberta. Nenhuma foto recuperada para este registro.');
  };

  const openEdit = async (visit: UnifiedVisit) => {
    const detailed = await loadDetail(visit);
    setEditing(detailed);
  };

  const updateEdit = (field: keyof UnifiedVisit, value: string) => setEditing((current) => current ? { ...current, [field]: value } : current);

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing || !isAdminUser) return;

    if (editing.source === 'local' && editing.id.startsWith('local-')) {
      const current = loadLocalVisits();
      const original = current.find((item) => item.id === editing.id);
      saveLocalVisits([toLocalRecord(editing, original), ...current.filter((item) => item.id !== editing.id)]);
      setEditing(null);
      setMessage('Visita pendente alterada neste aparelho. Clique em SINCRONIZAR AGORA para enviá-la.');
      return;
    }

    const photoMetadata = editing.fotosLista.map((photo) => ({
      name: photo.name,
      caption: photo.caption || '',
      path: photo.path || '',
      dataUrl: photo.path ? undefined : photo.dataUrl
    })).filter((photo) => photo.path || photo.dataUrl);
    const notes = photoMetadata.length
      ? `${buildNotes(editing)}\nGINFOTOS_JSON:${JSON.stringify({ fotos: photoMetadata })}`
      : buildNotes(editing);

    const { error } = await supabase.from('visitas').update({
      visit_date: editing.data,
      visitor_name: editing.representante,
      notes
    }).eq('id', editing.id);

    setMessage(error ? `Não foi possível alterar a visita: ${error.message}` : 'Visita alterada e mantida sincronizada.');
    if (!error) notifyGinfotos('GINFOTOS - Visita alterada', `${editing.designacao} - ${editing.unidade}`);
    setEditing(null);
    loadVisitas();
  };

  const removeLocalVisit = (visit: UnifiedVisit) => {
    if (!isAdminUser) return;
    if (!(visit.source === 'local' && visit.id.startsWith('local-'))) {
      setMessage('Visitas já sincronizadas não são removidas por este botão para evitar exclusão acidental para toda a equipe.');
      return;
    }
    if (!window.confirm(`Remover a visita pendente de ${visit.unidade}?`)) return;
    saveLocalVisits(loadLocalVisits().filter((item) => item.id !== visit.id));
    setMessage('Visita pendente removida deste aparelho.');
    loadVisitas();
  };

  return (
    <div className="dashboard-page">
      <div className="top-row">
        <div><p className="page-label">Registros</p><h1>Visitas Técnicas</h1></div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="primary sync-strong" onClick={loadVisitas}>🔄 SINCRONIZAR AGORA</button>
          <button type="button" className="primary" onClick={() => navigate('/nova-visita')}>+ NOVA VISITA</button>
        </div>
      </div>

      <section className="page-card">
        <p className="page-description">As visitas sincronizadas ficam disponíveis para Android, iPhone e computador. Registros pendentes deste aparelho são reenviados automaticamente ao sincronizar.</p>
        <div style={{ display: 'flex', gap: 12, margin: '18px 0', flexWrap: 'wrap' }}>
          <input aria-label="Buscar visitas" placeholder="Buscar por data, unidade, designação, tipo ou status" value={query} onChange={(event) => setQuery(event.target.value)} style={{ flex: '1 1 260px' }} />
          <span className="status-pill">{filtered.length} visita(s)</span>
        </div>
        {message && <p className="notice">{message}</p>}
        {!isAdminUser && <p className="notice">Usuários GIN podem consultar e sincronizar. Alterações administrativas permanecem restritas.</p>}

        {loading ? <div className="empty-state"><p>Sincronizando visitas...</p></div> : filtered.length === 0 ? <div className="empty-state"><p>Nenhuma visita registrada ainda.</p><button type="button" className="primary" onClick={() => navigate('/nova-visita')}>NOVA VISITA</button></div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table-list">
              <thead><tr><th>Data</th><th>Designação</th><th>Unidade</th><th>Tipo</th><th>Status</th><th>Fotos</th><th>Ações</th></tr></thead>
              <tbody>{filtered.map((item) => (
                <tr key={`${item.source}-${item.id}`}>
                  <td>{formatDate(item.data)}</td><td>{item.designacao}</td><td>{item.unidade}</td><td>{item.tipo}</td>
                  <td><span className="status-chip">{item.status}</span></td><td>{item.fotos || '—'}</td>
                  <td><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="primary" onClick={() => openVisit(item)}>ABRIR</button>
                    <button type="button" className="empty-link" onClick={() => navigate('/relatorios')}>Gerar Word</button>
                    {isAdminUser && <button type="button" className="empty-link" onClick={() => openEdit(item)}>Editar</button>}
                    {isAdminUser && item.id.startsWith('local-') && <button type="button" className="empty-link danger-link" onClick={() => removeLocalVisit(item)}>Remover</button>}
                  </div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      {selected && <section className="page-card">
        <div className="recent-header"><div><p className="page-label">Detalhes da visita</p><h2>{selected.designacao} - {selected.unidade}</h2></div><button type="button" className="empty-link" onClick={() => setSelected(null)}>Fechar</button></div>
        <p><strong>Data:</strong> {formatDate(selected.data)}</p><p><strong>Tipo:</strong> {selected.tipo}</p><p><strong>Status:</strong> {selected.status}</p><p><strong>Representante:</strong> {selected.representante}</p><p><strong>Serviços verificados:</strong> {selected.servicos}</p><p><strong>Observações:</strong> {selected.observacoes}</p><p><strong>Conclusão:</strong> {selected.conclusao}</p><p><strong>Fotos:</strong> {selected.fotos}</p>
        {selected.fotosLista.length > 0 ? <div className="visit-photo-grid">{selected.fotosLista.map((photo, index) => {
          const src = photo.url || photo.dataUrl || '';
          return <figure key={`${photo.path || photo.name}-${index}`} className="visit-photo-card">{src ? <a href={src} target="_blank" rel="noreferrer"><img src={src} alt={photo.caption || photo.name || `Foto ${index + 1}`} /></a> : <div className="empty-state"><p>Foto sem endereço disponível.</p></div>}<figcaption>{photo.caption || photo.name || 'Sem legenda'}</figcaption></figure>;
        })}</div> : <p className="notice">Nenhuma foto foi localizada neste registro. O sistema também procura fotos antigas salvas na pasta da visita no Storage.</p>}
        <p><strong>Criado por:</strong> {selected.criadoPor === profile?.id || selected.criadoPor === profile?.email ? 'Você' : selected.criadoPor || '—'}</p>
      </section>}

      {editing && isAdminUser && <section className="page-card">
        <div className="recent-header"><div><p className="page-label">Administração</p><h2>Editar visita técnica</h2></div><button type="button" className="empty-link" onClick={() => setEditing(null)}>Cancelar</button></div>
        <form onSubmit={saveEdit} style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div className="field"><label>Data</label><input type="date" value={editing.data?.slice(0, 10) || ''} onChange={(e) => updateEdit('data', e.target.value)} /></div>
            <div className="field"><label>Designação</label><input value={editing.designacao} onChange={(e) => updateEdit('designacao', e.target.value)} /></div>
            <div className="field"><label>Unidade</label><input value={editing.unidade} onChange={(e) => updateEdit('unidade', e.target.value)} /></div>
            <div className="field"><label>Bairro</label><input value={editing.bairro} onChange={(e) => updateEdit('bairro', e.target.value)} /></div>
            <div className="field"><label>Tipo</label><input value={editing.tipo} onChange={(e) => updateEdit('tipo', e.target.value)} /></div>
            <div className="field"><label>Representante</label><input value={editing.representante} onChange={(e) => updateEdit('representante', e.target.value)} /></div>
          </div>
          <div className="field"><label>Serviços verificados</label><textarea value={editing.servicos} onChange={(e) => updateEdit('servicos', e.target.value)} /></div>
          <div className="field"><label>Observações</label><textarea value={editing.observacoes} onChange={(e) => updateEdit('observacoes', e.target.value)} /></div>
          <div className="field"><label>Conclusão</label><textarea value={editing.conclusao} onChange={(e) => updateEdit('conclusao', e.target.value)} /></div>
          <button type="submit" className="primary">SALVAR ALTERAÇÕES</button>
        </form>
      </section>}
    </div>
  );
}
