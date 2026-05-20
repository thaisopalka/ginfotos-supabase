import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { UserProfile } from '../App';
import { notifyGinfotos } from '../lib/notifications';

interface SupabaseVisita { id: string; visitor_name?: string | null; unidade_id?: string | null; visit_date?: string | null; notes?: string | null; created_by?: string | null; }
interface LocalVisitRecord { id: string; unidade_id: string; unidade_nome: string; designacao?: string | null; endereco?: string | null; bairro?: string | null; telefone?: string | null; diretor_geral?: string | null; visit_date: string; tipo: string; representante: string; servicos: string; observacoes: string; conclusao: string; photo_count: number; fotos?: { name: string; caption: string; dataUrl?: string }[]; created_by?: string; created_at: string; }
interface UnifiedVisit { id: string; source: 'supabase' | 'local'; data: string; designacao: string; unidade: string; bairro: string; telefone: string; diretor: string; tipo: string; status: string; fotos: number; representante: string; servicos: string; observacoes: string; conclusao: string; criadoPor?: string | null; }
interface VisitasProps { profile: UserProfile | null; }

const LOCAL_VISITS_KEY = 'ginfotos_visitas_local';
const ADMIN_EMAIL = 'thaisopalka@gmail.com';

function loadLocalVisits(): LocalVisitRecord[] { try { return JSON.parse(localStorage.getItem(LOCAL_VISITS_KEY) || '[]') as LocalVisitRecord[]; } catch { return []; } }
function saveLocalVisits(visits: LocalVisitRecord[]) { localStorage.setItem(LOCAL_VISITS_KEY, JSON.stringify(visits)); window.dispatchEvent(new Event('ginfotos-visitas-updated')); }
function formatDate(value?: string | null) { if (!value) return 'Não informado'; const [year, month, day] = value.slice(0, 10).split('-'); return year && month && day ? `${day}/${month}/${year}` : value; }
function notesValue(notes: string | null | undefined, label: string) { if (!notes) return ''; const line = notes.split('\n').find((item) => item.toLowerCase().startsWith(label.toLowerCase())); return line ? line.replace(new RegExp(`^${label}:?\\s*`, 'i'), '').trim() : ''; }
function buildNotes(visit: UnifiedVisit) { return [`Designacao: ${visit.designacao}`, `Unidade escolar: ${visit.unidade}`, `Bairro: ${visit.bairro}`, `Telefone: ${visit.telefone}`, `Diretor: ${visit.diretor}`, `Tipo de visita/obra: ${visit.tipo}`, `Representante E/6 CRE/GIN: ${visit.representante}`, `Servicos verificados: ${visit.servicos}`, `Observacoes: ${visit.observacoes}`, `Conclusao: ${visit.conclusao}`].join('\n'); }

function fromSupabase(item: SupabaseVisita): UnifiedVisit {
  return { id: item.id, source: 'supabase', data: item.visit_date || '', designacao: notesValue(item.notes, 'Designacao') || item.unidade_id || '—', unidade: notesValue(item.notes, 'Unidade escolar') || item.unidade_id || 'Unidade não informada', bairro: notesValue(item.notes, 'Bairro') || '—', telefone: notesValue(item.notes, 'Telefone') || '—', diretor: notesValue(item.notes, 'Diretor') || '—', tipo: notesValue(item.notes, 'Tipo de visita/obra') || 'VISTORIA TÉCNICA', status: 'SINCRONIZADA', fotos: 0, representante: item.visitor_name || notesValue(item.notes, 'Representante E/6 CRE/GIN') || 'ENGA. MARCIA BRAGA', servicos: notesValue(item.notes, 'Servicos verificados') || item.notes || '—', observacoes: notesValue(item.notes, 'Observacoes') || '—', conclusao: notesValue(item.notes, 'Conclusao') || '—', criadoPor: item.created_by };
}
function fromLocal(item: LocalVisitRecord): UnifiedVisit {
  return { id: item.id, source: 'local', data: item.visit_date, designacao: item.designacao || item.unidade_id || '—', unidade: item.unidade_nome, bairro: item.bairro || '—', telefone: item.telefone || '—', diretor: item.diretor_geral || '—', tipo: item.tipo || 'VISTORIA TÉCNICA', status: 'SALVA NO DISPOSITIVO', fotos: item.photo_count || item.fotos?.length || 0, representante: item.representante || 'ENGA. MARCIA BRAGA', servicos: item.servicos || '—', observacoes: item.observacoes || '—', conclusao: item.conclusao || '—', criadoPor: item.created_by };
}
function toLocalRecord(visit: UnifiedVisit, original?: LocalVisitRecord): LocalVisitRecord {
  return { ...(original || {}), id: visit.id, unidade_id: visit.designacao, unidade_nome: visit.unidade, designacao: visit.designacao, bairro: visit.bairro, telefone: visit.telefone, diretor_geral: visit.diretor, visit_date: visit.data, tipo: visit.tipo, representante: visit.representante, servicos: visit.servicos, observacoes: visit.observacoes, conclusao: visit.conclusao, photo_count: visit.fotos, created_by: visit.criadoPor || original?.created_by || '', created_at: original?.created_at || new Date().toISOString() } as LocalVisitRecord;
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
    const localVisits = loadLocalVisits().map(fromLocal);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 3500);
    try {
      const { data, error } = await supabase.from('visitas').select('*').order('visit_date', { ascending: false }).abortSignal(controller.signal);
      if (error) { setMessage('Não foi possível carregar visitas do Supabase. Mostrando visitas salvas no dispositivo.'); setVisitas(localVisits); }
      else { const remoteVisits = ((data || []) as SupabaseVisita[]).map((item) => fromSupabase(item)); const merged = [...localVisits, ...remoteVisits].filter((item, index, array) => index === array.findIndex((candidate) => candidate.id === item.id)); setVisitas(merged.sort((a, b) => (b.data || '').localeCompare(a.data || ''))); setMessage(localVisits.length ? 'Visitas locais carregadas e disponíveis para relatório.' : 'Visitas carregadas.'); }
    } catch { setMessage('Tempo esgotado ao carregar o Supabase. Mostrando visitas salvas no dispositivo.'); setVisitas(localVisits); }
    finally { window.clearTimeout(timeoutId); setLoading(false); }
  };

  useEffect(() => { loadVisitas(); const handler = () => loadVisitas(); window.addEventListener('ginfotos-visitas-updated', handler); window.addEventListener('storage', handler); return () => { window.removeEventListener('ginfotos-visitas-updated', handler); window.removeEventListener('storage', handler); }; }, []);

  const filtered = useMemo(() => { const term = query.trim().toLowerCase(); if (!term) return visitas; return visitas.filter((item) => [item.data, item.designacao, item.unidade, item.bairro, item.telefone, item.diretor, item.tipo, item.status, item.representante].join(' ').toLowerCase().includes(term)); }, [query, visitas]);

  const updateEdit = (field: keyof UnifiedVisit, value: string) => setEditing((current) => current ? { ...current, [field]: value } : current);

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing || !isAdminUser) return;
    if (editing.source === 'local') {
      const current = loadLocalVisits();
      const original = current.find((item) => item.id === editing.id);
      saveLocalVisits([toLocalRecord(editing, original), ...current.filter((item) => item.id !== editing.id)]);
      setMessage('Visita técnica alterada pela administradora.');
      setEditing(null);
      notifyGinfotos('GINFOTOS - Visita alterada', `${editing.designacao} - ${editing.unidade}`);
      loadVisitas();
      return;
    }
    const { error } = await supabase.from('visitas').update({ visit_date: editing.data, visitor_name: editing.representante, notes: buildNotes(editing) }).eq('id', editing.id);
    setMessage(error ? `Não foi possível alterar a visita sincronizada: ${error.message}` : 'Visita técnica sincronizada alterada pela administradora.');
    setEditing(null);
    notifyGinfotos('GINFOTOS - Visita alterada', `${editing.designacao} - ${editing.unidade}`);
    loadVisitas();
  };

  const removeLocalVisit = (visit: UnifiedVisit) => {
    if (!isAdminUser) return;
    if (visit.source !== 'local') { setMessage('Esta visita está sincronizada no Supabase. Por segurança, remova pelo painel Admin/Supabase ou solicite a rotina de arquivamento remoto.'); return; }
    if (!window.confirm(`Remover a visita de ${visit.unidade}?`)) return;
    saveLocalVisits(loadLocalVisits().filter((item) => item.id !== visit.id));
    setMessage('Visita técnica removida pela administradora.');
    notifyGinfotos('GINFOTOS - Visita removida', `${visit.designacao} - ${visit.unidade}`);
    loadVisitas();
  };

  return (
    <div className="dashboard-page">
      <div className="top-row"><div><p className="page-label">Registros</p><h1>Visitas Técnicas</h1></div><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><button type="button" className="empty-button" onClick={loadVisitas}>Atualizar</button><button type="button" className="empty-button" onClick={() => navigate('/nova-visita')}>+ Nova Visita</button></div></div>
      <section className="page-card">
        <p className="page-description">Consulte as visitas sincronizadas e salvas no dispositivo. Edição e exclusão são liberadas apenas para a administradora.</p>
        <div style={{ display: 'flex', gap: 12, margin: '18px 0', flexWrap: 'wrap' }}><input aria-label="Buscar visitas" placeholder="Buscar por data, unidade, designação, tipo ou status" value={query} onChange={(event) => setQuery(event.target.value)} style={{ flex: '1 1 260px' }} /><span className="status-pill">{filtered.length} visita(s)</span></div>
        {message && <p className="notice">{message}</p>}
        {!isAdminUser && <p className="notice">Usuários comuns podem consultar e gerar Word. Alterar ou excluir visitas é exclusivo da administradora.</p>}
        {loading ? <div className="empty-state"><p>Carregando visitas...</p></div> : filtered.length === 0 ? <div className="empty-state"><p>Nenhuma visita registrada ainda.</p><button type="button" className="empty-button" onClick={() => navigate('/nova-visita')}>Nova Visita</button></div> : <div style={{ overflowX: 'auto' }}><table className="table-list"><thead><tr><th>Data</th><th>Designação</th><th>Unidade</th><th>Tipo</th><th>Status</th><th>Fotos</th><th>Ações</th></tr></thead><tbody>{filtered.map((item) => <tr key={`${item.source}-${item.id}`}><td>{formatDate(item.data)}</td><td>{item.designacao}</td><td>{item.unidade}</td><td>{item.tipo}</td><td><span className="status-chip">{item.status}</span></td><td>{item.fotos}</td><td><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" className="empty-link" onClick={() => setSelected(item)}>Abrir</button><button type="button" className="empty-link" onClick={() => navigate('/relatorios')}>Gerar Word</button>{isAdminUser && <button type="button" className="empty-link" onClick={() => setEditing(item)}>Editar</button>}{isAdminUser && <button type="button" className="empty-link danger-link" onClick={() => removeLocalVisit(item)}>Remover</button>}</div></td></tr>)}</tbody></table></div>}
      </section>
      {selected && <section className="page-card"><div className="recent-header"><div><p className="page-label">Detalhes da visita</p><h2>{selected.designacao} - {selected.unidade}</h2></div><button type="button" className="empty-link" onClick={() => setSelected(null)}>Fechar</button></div><p><strong>Data:</strong> {formatDate(selected.data)}</p><p><strong>Tipo:</strong> {selected.tipo}</p><p><strong>Status:</strong> {selected.status}</p><p><strong>Representante:</strong> {selected.representante}</p><p><strong>Serviços verificados:</strong> {selected.servicos}</p><p><strong>Observações:</strong> {selected.observacoes}</p><p><strong>Conclusão:</strong> {selected.conclusao}</p><p><strong>Fotos:</strong> {selected.fotos}</p><p><strong>Criado por:</strong> {selected.criadoPor === profile?.id || selected.criadoPor === profile?.email ? 'Você' : selected.criadoPor || '—'}</p></section>}
      {editing && isAdminUser && <section className="page-card"><div className="recent-header"><div><p className="page-label">Administração</p><h2>Editar visita técnica</h2></div><button type="button" className="empty-link" onClick={() => setEditing(null)}>Cancelar</button></div><form onSubmit={saveEdit} style={{ display: 'grid', gap: 12 }}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}><div className="field"><label>Data</label><input type="date" value={editing.data?.slice(0, 10) || ''} onChange={(e) => updateEdit('data', e.target.value)} /></div><div className="field"><label>Designação</label><input value={editing.designacao} onChange={(e) => updateEdit('designacao', e.target.value)} /></div><div className="field"><label>Unidade</label><input value={editing.unidade} onChange={(e) => updateEdit('unidade', e.target.value)} /></div><div className="field"><label>Bairro</label><input value={editing.bairro} onChange={(e) => updateEdit('bairro', e.target.value)} /></div><div className="field"><label>Tipo</label><input value={editing.tipo} onChange={(e) => updateEdit('tipo', e.target.value)} /></div><div className="field"><label>Representante</label><input value={editing.representante} onChange={(e) => updateEdit('representante', e.target.value)} /></div></div><div className="field"><label>Serviços verificados</label><textarea value={editing.servicos} onChange={(e) => updateEdit('servicos', e.target.value)} /></div><div className="field"><label>Observações</label><textarea value={editing.observacoes} onChange={(e) => updateEdit('observacoes', e.target.value)} /></div><div className="field"><label>Conclusão</label><textarea value={editing.conclusao} onChange={(e) => updateEdit('conclusao', e.target.value)} /></div><button type="submit" className="primary">Salvar alterações</button></form></section>}
    </div>
  );
}
