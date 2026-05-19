import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

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

interface ReportVisit {
  id: string;
  origem: 'local' | 'supabase';
  data: string;
  designacao: string;
  unidade: string;
  endereco: string;
  bairro: string;
  tipo: string;
  representante: string;
  servicos: string;
  observacoes: string;
  conclusao: string;
  fotos: { name: string; caption: string }[];
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br />');
}

function localToReport(item: LocalVisitRecord): ReportVisit {
  return {
    id: item.id,
    origem: 'local',
    data: item.visit_date,
    designacao: item.designacao || item.unidade_id || 'Nao informado',
    unidade: item.unidade_nome || 'Nao informado',
    endereco: item.endereco || 'Nao informado',
    bairro: item.bairro || 'Nao informado',
    tipo: item.tipo || 'VISTORIA TECNICA',
    representante: item.representante || 'ENGA. MARCIA BRAGA',
    servicos: item.servicos || 'Nao informado',
    observacoes: item.observacoes || 'Nao informado',
    conclusao: item.conclusao || 'Nao informado',
    fotos: item.fotos || []
  };
}

function supabaseToReport(item: SupabaseVisita): ReportVisit {
  return {
    id: item.id,
    origem: 'supabase',
    data: item.visit_date || '',
    designacao: item.unidade_id || 'Nao informado',
    unidade: item.unidade_id || 'Unidade nao informada',
    endereco: 'Nao informado',
    bairro: 'Nao informado',
    tipo: notesValue(item.notes, 'Tipo de visita/obra') || 'VISTORIA TECNICA',
    representante: item.visitor_name || notesValue(item.notes, 'Representante E/6 CRE/GIN') || 'ENGA. MARCIA BRAGA',
    servicos: notesValue(item.notes, 'Servicos verificados') || item.notes || 'Nao informado',
    observacoes: notesValue(item.notes, 'Observacoes') || 'Nao informado',
    conclusao: notesValue(item.notes, 'Conclusao') || 'Nao informado',
    fotos: []
  };
}

function makeReportHtml(visit: ReportVisit) {
  const rows = [
    ['Designacao', visit.designacao],
    ['Unidade Escolar', visit.unidade],
    ['Endereco', visit.endereco],
    ['Bairro', visit.bairro],
    ['Data da visita', formatDate(visit.data)],
    ['Tipo de visita/obra', visit.tipo],
    ['Representante E/6 CRE/GIN', visit.representante]
  ];

  const photoRows = visit.fotos.length
    ? visit.fotos
        .map((foto, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(foto.name)}</td><td>${escapeHtml(foto.caption || 'Sem legenda')}</td></tr>`)
        .join('')
    : '<tr><td colspan="3">Nenhuma foto cadastrada neste registro.</td></tr>';

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Relatorio de Visita Tecnica</title>
<style>
  body { font-family: Arial, sans-serif; color: #111827; margin: 36px; }
  .header { border-bottom: 4px solid #1f4e79; padding-bottom: 14px; margin-bottom: 24px; }
  h1 { color: #1f4e79; font-size: 22px; margin: 0; text-align: center; }
  h2 { color: #1f4e79; font-size: 16px; margin-top: 24px; border-bottom: 1px solid #d1d5db; padding-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { border: 1px solid #cbd5e1; padding: 8px; vertical-align: top; }
  th { background: #e8f0fa; text-align: left; }
  .label { width: 26%; font-weight: bold; background: #f3f6fb; }
  .footer { margin-top: 32px; text-align: center; color: #64748b; font-size: 12px; }
</style>
</head>
<body>
  <div class="header">
    <h1>RELATORIO DE VISITA TECNICA - E/6 CRE/GIN</h1>
  </div>

  <h2>Dados da Unidade e da Visita</h2>
  <table>
    <tbody>
      ${rows.map(([label, value]) => `<tr><td class="label">${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join('')}
    </tbody>
  </table>

  <h2>Servicos Verificados</h2>
  <p>${escapeHtml(visit.servicos)}</p>

  <h2>Observacoes</h2>
  <p>${escapeHtml(visit.observacoes)}</p>

  <h2>Conclusao</h2>
  <p>${escapeHtml(visit.conclusao)}</p>

  <h2>Anexo Fotografico</h2>
  <table>
    <thead><tr><th>Nº</th><th>Arquivo</th><th>Legenda</th></tr></thead>
    <tbody>${photoRows}</tbody>
  </table>

  <div class="footer">DESENVOLVIDO POR THAIS OPALKA</div>
</body>
</html>`;
}

function downloadWordCompatibleReport(visit: ReportVisit) {
  const html = makeReportHtml(visit);
  const blob = new Blob([html], { type: 'application/msword;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const fileName = `RELATORIO_${visit.designacao}_${formatDate(visit.data).replace(/\//g, '-')}.doc`;
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.replace(/[^a-zA-Z0-9_.-]/g, '_');
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function Relatorios() {
  const [visitas, setVisitas] = useState<ReportVisit[]>([]);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    async function loadVisits() {
      const local = loadLocalVisits().map(localToReport);

      try {
        const { data, error } = await supabase.from('visitas').select('*').order('visit_date', { ascending: false });
        if (!error && data) {
          const remote = (data as SupabaseVisita[]).map(supabaseToReport);
          const merged = [...local, ...remote].filter(
            (item, index, array) => index === array.findIndex((candidate) => candidate.id === item.id)
          );
          setVisitas(merged);
        } else {
          setVisitas(local);
          setNotice('Supabase nao respondeu. Mostrando visitas salvas no dispositivo.');
        }
      } catch {
        setVisitas(local);
        setNotice('Supabase nao respondeu. Mostrando visitas salvas no dispositivo.');
      }
    }

    loadVisits();
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return visitas;
    return visitas.filter((visit) =>
      [visit.designacao, visit.unidade, visit.data, visit.tipo, visit.representante]
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }, [query, visitas]);

  return (
    <div className="dashboard-page">
      <div className="top-row">
        <div>
          <p className="page-label">Documentos</p>
          <h1>Relatorios Word</h1>
        </div>
        <span className="status-pill">{filtered.length} visita(s)</span>
      </div>

      <section className="page-card">
        <p className="page-description">
          Gere relatorios editaveis, compativeis com Microsoft Word, a partir das visitas salvas no app.
        </p>
        <div style={{ display: 'flex', gap: 12, margin: '18px 0', flexWrap: 'wrap' }}>
          <input
            aria-label="Buscar visita para relatorio"
            placeholder="Buscar por designacao, unidade, data, tipo ou representante"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            style={{ flex: '1 1 260px' }}
          />
        </div>
        {notice && <p className="notice">{notice}</p>}
      </section>

      {filtered.length === 0 ? (
        <section className="empty-state">
          <p>Nenhuma visita disponivel para gerar relatorio.</p>
        </section>
      ) : (
        <section className="page-card">
          <div style={{ overflowX: 'auto' }}>
            <table className="table-list">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Designacao</th>
                  <th>Unidade</th>
                  <th>Tipo</th>
                  <th>Representante</th>
                  <th>Fotos</th>
                  <th>Origem</th>
                  <th>Acao</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((visit) => (
                  <tr key={`${visit.origem}-${visit.id}`}>
                    <td>{formatDate(visit.data)}</td>
                    <td>{visit.designacao}</td>
                    <td>{visit.unidade}</td>
                    <td>{visit.tipo}</td>
                    <td>{visit.representante}</td>
                    <td>{visit.fotos.length}</td>
                    <td><span className="status-chip">{visit.origem === 'local' ? 'Dispositivo' : 'Supabase'}</span></td>
                    <td>
                      <button type="button" className="empty-button" onClick={() => downloadWordCompatibleReport(visit)}>
                        Gerar Word
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
