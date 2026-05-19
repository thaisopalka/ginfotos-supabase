import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { downloadWordReport, WordReportPhoto, WordReportVisit } from '../lib/wordReport';

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
  fotos?: WordReportPhoto[];
  created_by?: string;
  created_at: string;
}

interface ReportVisit extends WordReportVisit {
  id: string;
  origem: 'local' | 'supabase';
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

function valueOrDefault(value?: string | null) {
  return value && value.trim() ? value : 'Não informado';
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
    representante: 'Engenheira Márcia Braga',
    servicos: valueOrDefault(item.servicos),
    observacoes: valueOrDefault(item.observacoes),
    conclusao: valueOrDefault(item.conclusao),
    fotos: item.fotos || []
  };
}

function supabaseToReport(item: SupabaseVisita): ReportVisit {
  return {
    id: item.id,
    origem: 'supabase',
    data: item.visit_date || '',
    designacao: valueOrDefault(notesValue(item.notes, 'Designacao') || item.unidade_id),
    unidade: valueOrDefault(notesValue(item.notes, 'Unidade escolar') || item.unidade_id),
    endereco: valueOrDefault(notesValue(item.notes, 'Endereco')),
    bairro: valueOrDefault(notesValue(item.notes, 'Bairro')),
    diretorGeral: valueOrDefault(notesValue(item.notes, 'Diretor geral') || notesValue(item.notes, 'Diretor(a) geral')),
    representante: 'Engenheira Márcia Braga',
    servicos: valueOrDefault(notesValue(item.notes, 'Servicos verificados') || item.notes),
    observacoes: valueOrDefault(notesValue(item.notes, 'Observacoes')),
    conclusao: valueOrDefault(notesValue(item.notes, 'Conclusao')),
    fotos: []
  };
}

export default function Relatorios() {
  const [visitas, setVisitas] = useState<ReportVisit[]>([]);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const loadVisits = async () => {
    const local = loadLocalVisits().map(localToReport);
    try {
      const { data, error } = await supabase.from('visitas').select('*').order('visit_date', { ascending: false });
      if (!error && data) {
        const remote = (data as SupabaseVisita[]).map(supabaseToReport);
        const merged = [...local, ...remote].filter((item, index, array) => index === array.findIndex((candidate) => candidate.id === item.id));
        setVisitas(merged.sort((a, b) => (b.data || '').localeCompare(a.data || '')));
        setNotice(local.length ? 'Visitas locais carregadas. O botão agora gera DOCX real, não HTML.' : 'Visitas carregadas.');
      } else {
        setVisitas(local);
        setNotice('Supabase não respondeu. Mostrando visitas salvas no dispositivo.');
      }
    } catch {
      setVisitas(local);
      setNotice('Supabase não respondeu. Mostrando visitas salvas no dispositivo.');
    }
  };

  useEffect(() => {
    loadVisits();
    const handler = () => loadVisits();
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
    return visitas.filter((visit) =>
      [visit.designacao, visit.unidade, visit.endereco, visit.bairro, visit.diretorGeral, visit.data, visit.representante]
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }, [query, visitas]);

  const handleGenerate = async (visit: ReportVisit) => {
    setGeneratingId(visit.id);
    setNotice('Gerando relatório Word em DOCX real...');
    try {
      await downloadWordReport(visit);
      setNotice('Relatório DOCX gerado com sucesso.');
    } catch {
      setNotice('Não foi possível gerar o DOCX. Verifique se as fotos foram anexadas em uma visita nova e tente novamente.');
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
          <button type="button" className="empty-button" onClick={loadVisits}>Atualizar</button>
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
          <p>Nenhuma visita disponível para gerar relatório. Clique em Atualizar depois de salvar uma Nova Visita.</p>
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
                    <td>{visit.fotos.length}</td>
                    <td><span className="status-chip">{visit.origem === 'local' ? 'Dispositivo' : 'Supabase'}</span></td>
                    <td>
                      <button type="button" className="empty-button" onClick={() => handleGenerate(visit)} disabled={generatingId === visit.id}>
                        {generatingId === visit.id ? 'Gerando...' : 'Gerar DOCX'}
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
