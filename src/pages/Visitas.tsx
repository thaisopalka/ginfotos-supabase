import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { UserProfile } from '../App';
import { notifyGinfotos } from '../lib/notifications';

interface SavedPhoto { name: string; caption?: string; dataUrl?: string; }
interface SupabaseVisita { id: string; visitor_name?: string | null; unidade_id?: string | null; visit_date?: string | null; notes?: string | null; created_by?: string | null; created_at?: string | null; }
interface LocalVisitRecord { id: string; unidade_id: string; unidade_nome: string; designacao?: string | null; endereco?: string | null; bairro?: string | null; telefone?: string | null; diretor_geral?: string | null; visit_date: string; tipo: string; representante: string; servicos: string; observacoes: string; conclusao: string; photo_count: number; fotos?: SavedPhoto[]; created_by?: string; created_at: string; }
interface UnifiedVisit { id: string; source: 'supabase' | 'local'; data: string; designacao: string; unidade: string; bairro: string; telefone: string; diretor: string; tipo: string; status: string; fotos: number; fotosLista: SavedPhoto[]; representante: string; servicos: string; observacoes: string; conclusao: string; criadoPor?: string | null; }
interface VisitasProps { profile: UserProfile | null; }

const LOCAL_VISITS_KEY = 'ginfotos_visitas_local';
const ADMIN_EMAIL = 'thaisopalka@gmail.com';

function loadLocalVisits(): LocalVisitRecord[] { try { return JSON.parse(localStorage.getItem(LOCAL_VISITS_KEY) || '[]') as LocalVisitRecord[]; } catch { return []; } }
function saveLocalVisits(visits: LocalVisitRecord[]) { localStorage.setItem(LOCAL_VISITS_KEY, JSON.stringify(visits)); window.dispatchEvent(new Event('ginfotos-visitas-updated')); }
function formatDate(value?: string | null) { if (!value) return 'Não informado'; const [year, month, day] = value.slice(0, 10).split('-'); return year && month && day ? `${day}/${month}/${year}` : value; }
function stripPhotoJson(notes?: string | null) { return (notes || '').split('\nGINFOTOS_JSON:')[0]; }
function notesValue(notes: string | null | undefined, label: string) { const cleanNotes = stripPhotoJson(notes); if (!cleanNotes) return ''; const line = cleanNotes.split('\n').find((item: string) => item.toLowerCase().startsWith(label.toLowerCase())); return line ? line.replace(new RegExp(`^${label}:?\\s*`, 'i'), '').trim() : ''; }
function buildNotes(visit: UnifiedVisit) { return [`Designacao: ${visit.designacao}`, `Unidade escolar: ${visit.unidade}`, `Bairro: ${visit.bairro}`, `Telefone: ${visit.telefone}`, `Diretor: ${visit.diretor}`, `Tipo de visita/obra: ${visit.tipo}`, `Representante E/6 CRE/GIN: ${visit.representante}`, `Servicos verificados: ${visit.servicos}`, `Observacoes: ${visit.observacoes}`, `Conclusao: ${visit.conclusao}`].join('\n'); }

function parsePhotosFromNotes(notes?: string | null): SavedPhoto[] {
  const marker = 'GINFOTOS_JSON:';
  const raw = notes || '';
  const index = raw.indexOf(marker);
  if (index < 0) return [];
  try {
    const json = raw.slice(index + marker.length).trim();
    const parsed = JSON.parse(json) as { fotos?: SavedPhoto[] };
    return Array.isArray(parsed.fotos) ? parsed.fotos.filter((photo) => !!photo.dataUrl) : [];
  } catch {
    return [];
  }
}

function fromSupabase(item: SupabaseVisita): UnifiedVisit {
  const fotosLista = parsePhotosFromNotes(item.notes);
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
    fotos: fotosLista.length,
    fotosLista,
    representante: item.visitor_name || notesValue(item.notes, 'Representante E/6 CRE/GIN') || 'ENGA. MARCIA BRAGA',
    servicos: notesValue(item.notes, 'Servicos verificados') || stripPhotoJson(item.notes) || '—',
    observacoes: notesValue(item.notes, 'Observacoes') || '—',
    conclusao: notesValue(item.notes, 'Conclusao') || '—',
    criadoPor: item.created_by
  };
}
function fromLocal(item: LocalVisitRecord): UnifiedVisit {
  const fotosLista = item.fotos || [];
  return { id: item.id, source: 'local', data: item.visit_date, designacao: item.designacao || item.unidade_id || '—', unidade: item.unidade_nome, bairro: item.bairro || '—', telefone: item.telefone || '—', diretor: item.diretor_geral || '—', tipo: item.tipo || 'VISTORIA TÉCNICA', status: 'SALVA NO DISPOSITIVO', fotos: item.photo_count || fotosLista.length || 0, fotosLista, representante: item.representante || 'ENGA. MARCIA BRAGA', servicos: item.servicos || '—', observacoes: item.observacoes || '—', conclusao: item.conclusao || '—', criadoPor: item.created_by };
}
function toLocalRecord(visit: UnifiedVisit, original?: LocalVisitRecord): LocalVisitRecord {
  return { ...(original || {}), id: visit.id, unidade_id: visit.designacao, unidade_nome: visit.unidade, designacao: visit.designacao, bairro: visit.bairro, telefone: visit.telefone, diretor_geral: visit.diretor, visit_date: visit.data, tipo: visit.tipo, representante: visit.representante, servicos: visit.servicos, observacoes: visit.observacoes, conclusao: visit.conclusao, photo_count: visit.fotosLista.length || visit.fotos, fotos: visit.fotosLista, created_by: visit.criadoPor || original?.created_by || '', created_at: original?.created_at || new Date().toISOString() } as LocalVisitRecord;
}

async function fetchRemoteVisitsViaServer() {
  const response = await fetch(`/api/visitas?ts=${Date.now()}`, { method: 'GET', cache: 'no-store', headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'API /api/visitas não respondeu.');
  return (Array.isArray(payload.data) ? payload.data : []) as SupabaseVisita[];
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
    setMessage('Sincronizando visitas e fotos com o servidor...');
    const localVisits = loadLocalVisits().map(fromLocal);
    try {
      const remoteRows = await fetchRemoteVisitsViaServer();
      const remoteVisits = remoteRows.map((item: SupabaseVisita) => fromSupabase(item));
      const merged = [...remoteVisits, ...localVisits].filter((item: UnifiedVisit, index: number, array: UnifiedVisit[]) => index === array.findIndex((candidate: UnifiedVisit) => candidate.id === item.id));
      setVisitas(merged.sort((a: UnifiedVisit, b: UnifiedVisit) => (b.data || '').localeCompare(a.data || '')));
      setMessage(`${remoteVisits.length} visita(s) sincronizada(s). Fotos encontradas: ${remoteVisits.reduce((total, visit) => total + visit.fotos, 0)}.`);
      setLoading(false);
      return;
    } catch (serverError) {
      setMessage(`API de visitas não carregou: ${serverError instanceof Error ? serverError.message : 'erro desconhecido'}. Tentando Supabase direto...`);
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 6500);
    try {
      const { data, error } = await supabase.from('visitas').select('*').order('visit_date', { ascending: false }).abortSignal(controller.signal);
      if (error) { setMessage('Não foi possível carregar visitas sincronizadas. Mostrando visitas salvas neste dispositivo.'); setVisitas(localVisits); }
      else {
        const remoteVisits = ((data || []) as SupabaseVisita[]).map((item: SupabaseVisita) => fromSupabase(item));
        const merged = [...remoteVisits, ...localVisits].filter((item: UnifiedVisit, index: number, array: UnifiedVisit[]) => index === array.findIndex((candidate: UnifiedVisit) => candidate.id === item.id));
        setVisitas(merged.sort((a: UnifiedVisit, b: UnifiedVisit) => (b.data || '').localeCompare(a.data || '')));
        setMessage(`${remoteVisits.length} visita(s) carregada(s) do Supabase direto.`);
      }
    } catch { setMessage('Tempo esgotado ao carregar visitas. Mostrando visitas salvas neste dispositivo.'); setVisitas(localVisits); }
    finally { window.clearTimeout(timeoutId); setLoading(false); }
  };

  useEffect(() => { loadVisitas(); const handler = () => loadVisitas(); window.addEventListener('ginfotos-visitas-updated', handler); window.addEventListener('storage', handler); return () => { window.removeEventListener('ginfotos-visitas-updated', handler); window.removeEventListener('storage', handler); }; }, []);

  const filtered = useMemo(() => { const term = query.trim().toLowerCase(); if (!term) return visitas; return visitas.filter((item: UnifiedVisit) => [item.data, item.designacao, item.unidade, item.bairro, item.telefone, item.diretor, item.tipo, item.status, item.representante].join(' ').toLowerCase().includes(term)); }, [query, visitas]);
  const updateEdit = (field: keyof UnifiedVisit, value: string) => setEditing((current) => current ? { ...current, [field]: value } : current);

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing || !isAdminUser) return;
    if (editing.source === 'local') {
      const current = loadLocalVisits();
      const original = current.find((item: LocalVisitRecord) => item.id === editing.id);
      saveLocalVisits([toLocalRecord(editing, original), ...current.filter((item: LocalVisitRecord) => item.id !== editing.id)]);
      setMessage('Visita técnica alterada pela administradora.');
      setEditing(null);
      notifyGinfotos('GINFOTOS - Visita alterada', `${editing.designacao} - ${editing.unidade}`);
      loadVisitas();
      return;
    }
    const notesWithPhotos = editing.fotosLista.length ? `${buildNotes(editing)}\nGINFOTOS_JSON:${JSON.stringify({ fotos: editing.fotosLista })}` : buildNotes(editing);
    const { error } = await supabase.from('visitas').update({ visit_date: editing.data, visitor_name: editing.representante, notes: notesWithPhotos }).eq('id', editing.id);
    setMessage(error ? `Não foi possível alterar a visita sincronizada: ${error.message}` : 'Visita técnica sincronizada alterada pela administradora.');
    setEditing(null);
    notifyGinfotos('GINFOTOS - Visita alterada', `${editing.designacao} - ${editing.unidade}`);
    loadVisitas();
  };

  const removeLocalVisit = (visit: UnifiedVisit) => {
    if (!isAdminUser) return;
    if (visit.source !== 'local') { setMessage('Esta visita está sincronizada no Supabase. Por segurança, remova pelo painel Admin/Supabase ou solicite a rotina de arquivamento remoto.'); return; }
    if (!window.confirm(`Remover a visita de ${visit.unidade}?`)) return;
    saveLocalVisits(loadLocalVisits().filter((item: LocalVisitRecord) => item.id !== visit.id));
    setMessage('Visita técnica removida pela administradora.');
    notifyGinfotos('GINFOTOS - Visita removida', `${visit.designacao} - ${visit.unidade}`);
    loadVisitas();
  };

  return (
    <div className="dashboard-page">
      <div className="top-row"><div><p className="page-label">Registros</p><h1>Visitas Técnicas</h1></div><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><button type="button" className="primary sync-strong" onClick={loadVisitas}>SINCRONIZAR AGORA</button><button type="button" className="primary" onClick={() => navigate('/nova-visita')}>+ NOVA VISITA</button></div></div>
      <section className="page-card">
        <p className="page-description">Consulte as visitas sincronizadas e salvas no dispositivo. Edição e exclusão são liberadas apenas para a administradora.</p>
        <div style={{ display: 'flex', gap: 12, margin: '18px 0', flexWrap: 'wrap' }}><input aria-label="Buscar visitas" placeholder="Buscar por data, unidade, designação, tipo ou status" value={query} onChange={(event) => setQuery(event.target.value)} style={{ flex: '1 1 260px' }} /><span className="status-pill">{filtered.length} visita(s)</span></div>
        {message && <p className="notice">{message}</p>}
        {!isAdminUser && <p className="notice">Usuários comuns podem consultar e gerar Word. Alterar ou excluir visitas é exclusivo da administradora.</p>}
        {loading ? <div className="empty-state"><p>Carregando visitas e fotos...</p></div> : filtered.length === 0 ? <div className="empty-state"><p>Nenhuma visita registrada ainda.</p><button type="button" className="primary" onClick={() => navigate('/nova-visita')}>NOVA VISITA</button></div> : <div style={{ overflowX: 'auto' }}><table className="table-list"><thead><tr><th>Data</th><th>Designação</th><th>Unidade</th><th>Tipo</th><th>Status</th><th>Fotos</th><th>Ações</th></tr></thead><tbody>{filtered.map((item: UnifiedVisit) => <tr key={`${item.source}-${item.id}`}><td>{formatDate(item.data)}</td><td>{item.designacao}</td><td>{item.unidade}</td><td>{item.tipo}</td><td><span className="status-chip">{item.status}</span></td><td>{item.fotos}</td><td><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" className="primary" onClick={() => setSelected(item)}>ABRIR</button><button type="button" className="empty-link" onClick={() => navigate('/relatorios')}>Gerar Word</button>{isAdminUser && <button type="button" className="empty-link" onClick={() => setEditing(item)}>Editar</button>}{isAdminUser && <button type="button" className="empty-link danger-link" onClick={() => removeLocalVisit(item)}>Remover</button>}</div></td></tr>)}</tbody></table></div>}
      </section>
      {selected && <section className="page-card"><div className="recent-header"><div><p className="page-label">Detalhes da visita</p><h2>{selected.designacao} - {selected.unidade}</h2></div><button type="button" className="empty-link" onClick={() => setSelected(null)}>Fechar</button></div><p><strong>Data:</strong> {formatDate(selected.data)}</p><p><strong>Tipo:</strong> {selected.tipo}</p><p><strong>Status:</strong> {selected.status}</p><p><strong>Representante:</strong> {selected.representante}</p><p><strong>Serviços verificados:</strong> {selected.servicos}</p><p><strong>Observações:</strong> {selected.observacoes}</p><p><strong>Conclusão:</strong> {selected.conclusao}</p><p><strong>Fotos:</strong> {selected.fotos}</p>{selected.fotosLista.length > 0 ? <div className="visit-photo-grid">{selected.fotosLista.map((photo, index) => <figure key={`${photo.name}-${index}`} className="visit-photo-card"><a href={photo.dataUrl} target="_blank" rel="noreferrer"><img src={photo.dataUrl} alt={photo.caption || photo.name || `Foto ${index + 1}`} /></a><figcaption>{photo.caption || 'Sem legenda'}</figcaption></figure>)}</div> : <p className="notice">Esta visita não tem foto sincronizada. As novas visitas, após o deploy, passarão a salvar as fotos junto com o registro.</p>}<p><strong>Criado por:</strong> {selected.criadoPor === profile?.id || selected.criadoPor === profile?.email ? 'Você' : selected.criadoPor || '—'}</p></section>}
      {editing && isAdminUser && <section className="page-card"><div className="recent-header"><div><p className="page-label">Administração</p><h2>Editar visita técnica</h2></div><button type="button" className="empty-link" onClick={() => setEditing(null)}>Cancelar</button></div><form onSubmit={saveEdit} style={{ display: 'grid', gap: 12 }}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}><div className="field"><label>Data</label><input type="date" value={editing.data?.slice(0, 10) || ''} onChange={(e) => updateEdit('data', e.target.value)} /></div><div className="field"><label>Designação</label><input value={editing.designacao} onChange={(e) => updateEdit('designacao', e.target.value)} /></div><div className="field"><label>Unidade</label><input value={editing.unidade} onChange={(e) => updateEdit('unidade', e.target.value)} /></div><div className="field"><label>Bairro</label><input value={editing.bairro} onChange={(e) => updateEdit('bairro', e.target.value)} /></div><div className="field"><label>Tipo</label><input value={editing.tipo} onChange={(e) => updateEdit('tipo', e.target.value)} /></div><div className="field"><label>Representante</label><input value={editing.representante} onChange={(e) => updateEdit('representante', e.target.value)} /></div></div><div className="field"><label>Serviços verificados</label><textarea value={editing.servicos} onChange={(e) => updateEdit('servicos', e.target.value)} /></div><div className="field"><label>Observações</label><textarea value={editing.observacoes} onChange={(e) => updateEdit('observacoes', e.target.value)} /></div><div className="field"><label>Conclusão</label><textarea value={editing.conclusao} onChange={(e) => updateEdit('conclusao', e.target.value)} /></div><button type="submit" className="primary">SALVAR ALTERAÇÕES</button></form></section>}
    </div>
  );
}
