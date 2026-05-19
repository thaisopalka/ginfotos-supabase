import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

interface SupabaseVisita { id: string; visitor_name?: string | null; unidade_id?: string | null; visit_date?: string | null; notes?: string | null; created_by?: string | null; }
interface FotoRelatorio { name: string; caption: string; dataUrl?: string; }
interface LocalVisitRecord { id: string; unidade_id: string; unidade_nome: string; designacao?: string | null; endereco?: string | null; bairro?: string | null; telefone?: string | null; diretor_geral?: string | null; celular_diretor_geral?: string | null; diretor_adjunto?: string | null; celular_diretor_adjunto?: string | null; visit_date: string; tipo: string; representante: string; servicos: string; observacoes: string; conclusao: string; photo_count: number; fotos?: FotoRelatorio[]; created_by?: string; created_at: string; }
interface ReportVisit { id: string; origem: 'local' | 'supabase'; data: string; designacao: string; unidade: string; endereco: string; bairro: string; diretorGeral: string; representante: string; servicos: string; observacoes: string; conclusao: string; fotos: FotoRelatorio[]; }

const LOCAL_VISITS_KEY = 'ginfotos_visitas_local';

function loadLocalVisits(): LocalVisitRecord[] { try { return JSON.parse(localStorage.getItem(LOCAL_VISITS_KEY) || '[]') as LocalVisitRecord[]; } catch { return []; } }
function formatDate(value?: string | null) { if (!value) return 'Não informado'; const [year, month, day] = value.slice(0, 10).split('-'); if (!year || !month || !day) return value; return `${day}/${month}/${year}`; }
function notesValue(notes: string | null | undefined, label: string) { if (!notes) return ''; const line = notes.split('\n').find((item) => item.toLowerCase().startsWith(label.toLowerCase())); return line ? line.replace(new RegExp(`^${label}:?\\s*`, 'i'), '').trim() : ''; }
function escapeHtml(value: string) { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;').replace(/\n/g, '<br />'); }
function valueOrDefault(value?: string | null) { return value && value.trim() ? value : 'Não informado'; }
function fixText(value: string) { return value.replace(/VISTORIA TECNICA/g, 'VISTORIA TÉCNICA').replace(/ENGA\. MARCIA BRAGA/gi, 'Engenheira Márcia Braga').replace(/ENGa\. MARCIA BRAGA/g, 'Engenheira Márcia Braga'); }

function localToReport(item: LocalVisitRecord): ReportVisit { return { id: item.id, origem: 'local', data: item.visit_date, designacao: valueOrDefault(item.designacao || item.unidade_id), unidade: valueOrDefault(item.unidade_nome), endereco: valueOrDefault(item.endereco), bairro: valueOrDefault(item.bairro), diretorGeral: valueOrDefault(item.diretor_geral), representante: 'Engenheira Márcia Braga', servicos: valueOrDefault(item.servicos), observacoes: valueOrDefault(item.observacoes), conclusao: valueOrDefault(item.conclusao), fotos: item.fotos || [] }; }
function supabaseToReport(item: SupabaseVisita): ReportVisit { return { id: item.id, origem: 'supabase', data: item.visit_date || '', designacao: valueOrDefault(notesValue(item.notes, 'Designacao') || item.unidade_id), unidade: valueOrDefault(notesValue(item.notes, 'Unidade escolar') || item.unidade_id), endereco: valueOrDefault(notesValue(item.notes, 'Endereco')), bairro: valueOrDefault(notesValue(item.notes, 'Bairro')), diretorGeral: valueOrDefault(notesValue(item.notes, 'Diretor geral') || notesValue(item.notes, 'Diretor(a) geral')), representante: 'Engenheira Márcia Braga', servicos: valueOrDefault(notesValue(item.notes, 'Servicos verificados') || item.notes), observacoes: valueOrDefault(notesValue(item.notes, 'Observacoes')), conclusao: valueOrDefault(notesValue(item.notes, 'Conclusao')), fotos: [] }; }

function makeReportHtml(visit: ReportVisit) {
  const photoCards = visit.fotos.length
    ? visit.fotos.map((foto, index) => `<div class="photo-card">${foto.dataUrl ? `<img src="${foto.dataUrl}" alt="Foto ${index + 1}" />` : `<div class="no-image">Imagem não incorporada<br/><small>${escapeHtml(foto.name)}</small></div>`}<div class="caption"><strong>Foto ${index + 1}.</strong> ${escapeHtml(foto.caption || 'Sem legenda.')}</div></div>`).join('')
    : '<div class="empty-photo">Nenhuma foto incorporada neste relatório.</div>';

  return `<!doctype html><html><head><meta charset="utf-8" /><title>Relatório de Visita Técnica</title><style>
    @page { size: A4 portrait; margin: 1.6cm 1.5cm 1.8cm 1.5cm; @bottom-center { content: "Página " counter(page) " de " counter(pages); font-family: Calibri, Arial, sans-serif; font-size: 10pt; color: #64748b; } }
    body { font-family: Calibri, Arial, sans-serif; color: #111827; font-size: 11pt; line-height: 1.35; margin: 0; counter-reset: page; }
    .page { width: 100%; min-height: 25.5cm; page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    .logo-bar { width: 100%; height: 58px; background: #1f5795; color: white; display: flex; align-items: center; padding: 0 18px; box-sizing: border-box; margin-bottom: 18px; }
    .rio { font-size: 34px; font-weight: 900; letter-spacing: -1px; margin-right: 22px; }
    .pref { font-size: 10px; letter-spacing: 5px; font-weight: 700; display: block; margin-bottom: -8px; }
    .edu { border-left: 1px solid rgba(255,255,255,.8); padding-left: 18px; font-size: 18px; }
    .org { text-align: center; font-weight: 700; color: #1f2937; line-height: 1.4; margin-bottom: 16px; text-transform: uppercase; }
    h1 { text-align: center; color: #173f73; font-size: 18pt; margin: 10px 0 18px; text-transform: uppercase; letter-spacing: .03em; }
    .info-grid { border: 1px solid #9fb4ce; border-radius: 8px; overflow: hidden; margin-bottom: 14px; }
    .row { display: grid; grid-template-columns: 27% 73%; border-bottom: 1px solid #d6e0ec; min-height: 34px; }
    .row:last-child { border-bottom: 0; }
    .label { background: #e8f0fa; color: #10243f; font-weight: 700; padding: 9px 10px; border-right: 1px solid #d6e0ec; }
    .value { padding: 9px 12px; }
    h2 { color: #173f73; font-size: 13.5pt; margin: 16px 0 7px; border-bottom: 2px solid #d6e0ec; padding-bottom: 4px; }
    .text-box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 12px; min-height: 52px; background: #ffffff; }
    .photos-title { text-align: center; font-size: 17pt; color: #173f73; margin: 8px 0 16px; text-transform: uppercase; }
    .photos-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .photo-card { border: 1px solid #9fb4ce; border-radius: 8px; padding: 8px; page-break-inside: avoid; min-height: 250px; display: flex; flex-direction: column; justify-content: space-between; }
    .photo-card img { width: 100%; height: 205px; object-fit: contain; display: block; background: #f8fafc; border-radius: 4px; }
    .caption { font-size: 10pt; margin-top: 7px; color: #111827; min-height: 34px; }
    .no-image, .empty-photo { height: 205px; border: 1px dashed #94a3b8; border-radius: 4px; display: flex; align-items: center; justify-content: center; text-align: center; color: #64748b; background: #f8fafc; padding: 8px; box-sizing: border-box; }
    .page-number { position: fixed; bottom: .6cm; left: 0; right: 0; text-align: center; font-size: 10pt; color: #64748b; }
    @media print { .page { page-break-after: always; } .page:last-child { page-break-after: auto; } }
  </style></head><body>
    <section class="page">
      <div class="logo-bar"><div><span class="pref">PREFEITURA</span><span class="rio">RIO</span></div><div class="edu">Educação</div></div>
      <div class="org">Secretaria Municipal de Educação<br/>6ª Coordenadoria Regional de Educação<br/>E/6ª CRE/GIN</div>
      <h1>Relatório de Visita Técnica</h1>
      <div class="info-grid">
        <div class="row"><div class="label">Data</div><div class="value">${escapeHtml(formatDate(visit.data))}</div></div>
        <div class="row"><div class="label">Designação + Unidade Escolar</div><div class="value">${escapeHtml(visit.designacao)} - ${escapeHtml(visit.unidade)}</div></div>
        <div class="row"><div class="label">Endereço + Bairro</div><div class="value">${escapeHtml(visit.endereco)} - ${escapeHtml(visit.bairro)}</div></div>
        <div class="row"><div class="label">Diretor(a) Geral</div><div class="value">${escapeHtml(visit.diretorGeral)}</div></div>
        <div class="row"><div class="label">Representante E/GIN/6ª CRE</div><div class="value">Engenheira Márcia Braga.</div></div>
      </div>
      <h2>Serviços Verificados</h2><div class="text-box">${escapeHtml(fixText(visit.servicos))}</div>
      <h2>Observações</h2><div class="text-box">${escapeHtml(fixText(visit.observacoes))}</div>
      <h2>Conclusão</h2><div class="text-box">${escapeHtml(fixText(visit.conclusao))}</div>
      <div class="page-number">Página 1</div>
    </section>
    <section class="page">
      <div class="photos-title">Registro Fotográfico</div>
      <div class="photos-grid">${photoCards}</div>
      <div class="page-number">Página 2</div>
    </section>
  </body></html>`;
}

function downloadWordCompatibleReport(visit: ReportVisit) { const html = makeReportHtml(visit); const blob = new Blob([html], { type: 'application/msword;charset=utf-8' }); const url = URL.createObjectURL(blob); const fileName = `RELATORIO_${visit.designacao}_${formatDate(visit.data).replace(/\//g, '-')}.doc`; const link = document.createElement('a'); link.href = url; link.download = fileName.replace(/[^a-zA-Z0-9_.-]/g, '_'); document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url); }

export default function Relatorios() {
  const [visitas, setVisitas] = useState<ReportVisit[]>([]);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const loadVisits = async () => { const local = loadLocalVisits().map(localToReport); try { const { data, error } = await supabase.from('visitas').select('*').order('visit_date', { ascending: false }); if (!error && data) { const remote = (data as SupabaseVisita[]).map(supabaseToReport); const merged = [...local, ...remote].filter((item, index, array) => index === array.findIndex((candidate) => candidate.id === item.id)); setVisitas(merged.sort((a, b) => (b.data || '').localeCompare(a.data || ''))); setNotice(local.length ? 'Visitas locais carregadas. Agora elas podem gerar Word.' : 'Visitas carregadas.'); } else { setVisitas(local); setNotice('Supabase nao respondeu. Mostrando visitas salvas no dispositivo.'); } } catch { setVisitas(local); setNotice('Supabase nao respondeu. Mostrando visitas salvas no dispositivo.'); } };
  useEffect(() => { loadVisits(); const handler = () => loadVisits(); window.addEventListener('ginfotos-visitas-updated', handler); window.addEventListener('storage', handler); return () => { window.removeEventListener('ginfotos-visitas-updated', handler); window.removeEventListener('storage', handler); }; }, []);
  const filtered = useMemo(() => { const term = query.trim().toLowerCase(); if (!term) return visitas; return visitas.filter((visit) => [visit.designacao, visit.unidade, visit.endereco, visit.bairro, visit.diretorGeral, visit.data, visit.representante].join(' ').toLowerCase().includes(term)); }, [query, visitas]);
  return <div className="dashboard-page"><div className="top-row"><div><p className="page-label">Documentos</p><h1>Relatórios Word</h1></div><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><button type="button" className="empty-button" onClick={loadVisits}>Atualizar</button><span className="status-pill">{filtered.length} visita(s)</span></div></div><section className="page-card"><p className="page-description">Gere relatórios em A4 retrato, fonte Calibri, com primeira página de informações e fotos a partir da segunda página.</p><div style={{ display: 'flex', gap: 12, margin: '18px 0', flexWrap: 'wrap' }}><input aria-label="Buscar visita para relatório" placeholder="Buscar por designação, unidade, bairro, diretor, data ou representante" value={query} onChange={(event) => setQuery(event.target.value)} style={{ flex: '1 1 260px' }} /></div>{notice && <p className="notice">{notice}</p>}</section>{filtered.length === 0 ? <section className="empty-state"><p>Nenhuma visita disponível para gerar relatório. Clique em Atualizar depois de salvar uma Nova Visita.</p></section> : <section className="page-card"><div style={{ overflowX: 'auto' }}><table className="table-list"><thead><tr><th>Data</th><th>Designação</th><th>Unidade</th><th>Bairro</th><th>Diretor(a)</th><th>Fotos</th><th>Origem</th><th>Ação</th></tr></thead><tbody>{filtered.map((visit) => <tr key={`${visit.origem}-${visit.id}`}><td>{formatDate(visit.data)}</td><td>{visit.designacao}</td><td>{visit.unidade}</td><td>{visit.bairro}</td><td>{visit.diretorGeral}</td><td>{visit.fotos.length}</td><td><span className="status-chip">{visit.origem === 'local' ? 'Dispositivo' : 'Supabase'}</span></td><td><button type="button" className="empty-button" onClick={() => downloadWordCompatibleReport(visit)}>Gerar Word</button></td></tr>)}</tbody></table></div></section>}</div>;
}
