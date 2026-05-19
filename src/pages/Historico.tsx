import { FormEvent, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

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
  conclusao: string;
  photo_count: number;
  created_at: string;
}

interface SupabaseVisit {
  id: string;
  unidade_id?: string | null;
  visit_date?: string | null;
  visitor_name?: string | null;
  notes?: string | null;
  created_by?: string | null;
}

interface HistoryItem {
  id: string;
  date: string;
  type: string;
  title: string;
  description: string;
  origin: string;
}

const LOCAL_VISITS_KEY = 'ginfotos_visitas_local';
const HISTORY_KEY = 'ginfotos_historico_local';

function loadLocalVisits(): LocalVisitRecord[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_VISITS_KEY) || '[]') as LocalVisitRecord[];
  } catch {
    return [];
  }
}

function loadManualHistory(): HistoryItem[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') as HistoryItem[];
  } catch {
    return [];
  }
}

function saveManualHistory(items: HistoryItem[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
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

function localVisitToHistory(visit: LocalVisitRecord): HistoryItem {
  return {
    id: `local-${visit.id}`,
    date: visit.created_at || visit.visit_date,
    type: 'Visita salva',
    title: `${visit.designacao || visit.unidade_id || 'Sem designacao'} - ${visit.unidade_nome}`,
    description: `${visit.tipo || 'VISTORIA TECNICA'} | ${visit.photo_count || 0} foto(s) | ${visit.servicos || visit.observacoes || 'Sem resumo'}`,
    origin: 'Dispositivo'
  };
}

function supabaseVisitToHistory(visit: SupabaseVisit): HistoryItem {
  const tipo = notesValue(visit.notes, 'Tipo de visita/obra') || 'VISTORIA TECNICA';
  const resumo = notesValue(visit.notes, 'Servicos verificados') || visit.notes || 'Visita sincronizada';
  return {
    id: `supabase-${visit.id}`,
    date: visit.visit_date || '',
    type: 'Visita sincronizada',
    title: visit.unidade_id || 'Unidade nao informada',
    description: `${tipo} | ${resumo}`,
    origin: 'Supabase'
  };
}

export default function Historico() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [query, setQuery] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  const [notice, setNotice] = useState('');

  const loadHistory = async () => {
    const localItems = loadLocalVisits().map(localVisitToHistory);
    const manualItems = loadManualHistory();

    try {
      const { data, error } = await supabase.from('visitas').select('*').order('visit_date', { ascending: false });
      if (!error && data) {
        const remoteItems = (data as SupabaseVisit[]).map(supabaseVisitToHistory);
        const merged = [...manualItems, ...localItems, ...remoteItems].filter(
          (item, index, array) => index === array.findIndex((candidate) => candidate.id === item.id)
        );
        setItems(merged.sort((a, b) => (b.date || '').localeCompare(a.date || '')));
      } else {
        setItems([...manualItems, ...localItems].sort((a, b) => (b.date || '').localeCompare(a.date || '')));
        setNotice('Supabase nao respondeu. Historico local carregado.');
      }
    } catch {
      setItems([...manualItems, ...localItems].sort((a, b) => (b.date || '').localeCompare(a.date || '')));
      setNotice('Supabase nao respondeu. Historico local carregado.');
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) =>
      [item.date, item.type, item.title, item.description, item.origin].join(' ').toLowerCase().includes(term)
    );
  }, [query, items]);

  const handleAddManual = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const newItem: HistoryItem = {
      id: `manual-${Date.now()}`,
      date: new Date().toISOString(),
      type: 'Registro manual',
      title: manualTitle,
      description: manualDescription,
      origin: 'Dispositivo'
    };
    const manualItems = [newItem, ...loadManualHistory()];
    saveManualHistory(manualItems);
    setManualTitle('');
    setManualDescription('');
    setItems((current) => [newItem, ...current]);
    setNotice('Registro incluido no historico local.');
  };

  const clearManualHistory = () => {
    saveManualHistory([]);
    setItems((current) => current.filter((item) => !item.id.startsWith('manual-')));
    setNotice('Registros manuais removidos. Visitas salvas foram mantidas.');
  };

  return (
    <div className="dashboard-page">
      <div className="top-row">
        <div>
          <p className="page-label">Arquivo geral</p>
          <h1>Arquivo / Historico</h1>
        </div>
        <span className="status-pill">{filtered.length} registro(s)</span>
      </div>

      <section className="page-card">
        <p className="page-description">
          Consulte os registros das visitas, sincronizacoes e anotacoes importantes do GINFOTOS.
        </p>

        <div style={{ display: 'flex', gap: 12, margin: '18px 0', flexWrap: 'wrap' }}>
          <input
            aria-label="Buscar historico"
            placeholder="Buscar por unidade, data, tipo, origem ou descricao"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            style={{ flex: '1 1 260px' }}
          />
          <button type="button" className="empty-button" onClick={loadHistory}>Atualizar</button>
        </div>
        {notice && <p className="notice">{notice}</p>}
      </section>

      <section className="page-card">
        <p className="page-label">Registro manual</p>
        <h2 style={{ marginTop: 0 }}>Adicionar anotacao ao historico</h2>
        <form onSubmit={handleAddManual} style={{ display: 'grid', gap: 14 }}>
          <div className="field">
            <label htmlFor="manual-title">Titulo</label>
            <input id="manual-title" value={manualTitle} onChange={(event) => setManualTitle(event.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="manual-desc">Descricao</label>
            <textarea id="manual-desc" value={manualDescription} onChange={(event) => setManualDescription(event.target.value)} rows={3} required />
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button type="submit" className="primary">Salvar no Historico</button>
            <button type="button" className="empty-link" onClick={clearManualHistory}>Limpar registros manuais</button>
          </div>
        </form>
      </section>

      {filtered.length === 0 ? (
        <section className="empty-state">
          <p>Nenhum registro encontrado.</p>
        </section>
      ) : (
        <section className="page-card">
          <div style={{ overflowX: 'auto' }}>
            <table className="table-list">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Tipo</th>
                  <th>Titulo</th>
                  <th>Origem</th>
                  <th>Descricao</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id}>
                    <td>{formatDate(item.date)}</td>
                    <td>{item.type}</td>
                    <td>{item.title}</td>
                    <td><span className="status-chip">{item.origin}</span></td>
                    <td>{item.description}</td>
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
