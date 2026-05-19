import { FormEvent, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

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
  unidade: string;
  designacao: string;
  bairro: string;
  telefone: string;
  diretor: string;
  representante: string;
  fotos: number;
  description: string;
  conclusion: string;
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

function valueOrDefault(value?: string | null) {
  return value && value.trim() ? value : 'Nao informado';
}

function localVisitToHistory(visit: LocalVisitRecord): HistoryItem {
  const designacao = valueOrDefault(visit.designacao || visit.unidade_id);
  const unidade = valueOrDefault(visit.unidade_nome);
  return {
    id: `local-${visit.id}`,
    date: visit.created_at || visit.visit_date,
    type: 'Visita salva',
    title: `${designacao} - ${unidade}`,
    unidade,
    designacao,
    bairro: valueOrDefault(visit.bairro),
    telefone: valueOrDefault(visit.telefone),
    diretor: valueOrDefault(visit.diretor_geral),
    representante: valueOrDefault(visit.representante),
    fotos: visit.photo_count || 0,
    description: `${visit.tipo || 'VISTORIA TECNICA'} | ${visit.servicos || visit.observacoes || 'Sem resumo'}`,
    conclusion: valueOrDefault(visit.conclusao),
    origin: 'Dispositivo'
  };
}

function supabaseVisitToHistory(visit: SupabaseVisit): HistoryItem {
  const tipo = notesValue(visit.notes, 'Tipo de visita/obra') || 'VISTORIA TECNICA';
  const unidade = valueOrDefault(notesValue(visit.notes, 'Unidade escolar') || visit.unidade_id);
  const designacao = valueOrDefault(notesValue(visit.notes, 'Designacao') || visit.unidade_id);
  const resumo = notesValue(visit.notes, 'Servicos verificados') || visit.notes || 'Visita sincronizada';
  return {
    id: `supabase-${visit.id}`,
    date: visit.visit_date || '',
    type: 'Visita sincronizada',
    title: `${designacao} - ${unidade}`,
    unidade,
    designacao,
    bairro: valueOrDefault(notesValue(visit.notes, 'Bairro')),
    telefone: valueOrDefault(notesValue(visit.notes, 'Telefone')),
    diretor: valueOrDefault(notesValue(visit.notes, 'Diretor geral') || notesValue(visit.notes, 'Diretor(a) geral')),
    representante: valueOrDefault(visit.visitor_name || notesValue(visit.notes, 'Representante E/6 CRE/GIN')),
    fotos: 0,
    description: `${tipo} | ${resumo}`,
    conclusion: valueOrDefault(notesValue(visit.notes, 'Conclusao')),
    origin: 'Supabase'
  };
}

function normalizeManualItem(item: HistoryItem): HistoryItem {
  return {
    id: item.id,
    date: item.date,
    type: item.type || 'Registro manual',
    title: item.title,
    unidade: item.unidade || 'Registro manual',
    designacao: item.designacao || 'Nao informado',
    bairro: item.bairro || 'Nao informado',
    telefone: item.telefone || 'Nao informado',
    diretor: item.diretor || 'Nao informado',
    representante: item.representante || 'Nao informado',
    fotos: item.fotos || 0,
    description: item.description,
    conclusion: item.conclusion || 'Nao informado',
    origin: item.origin || 'Dispositivo'
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
    const manualItems = loadManualHistory().map(normalizeManualItem);

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
      [
        item.date,
        item.type,
        item.title,
        item.unidade,
        item.designacao,
        item.bairro,
        item.telefone,
        item.diretor,
        item.representante,
        item.description,
        item.conclusion,
        item.origin
      ]
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }, [query, items]);

  const handleAddManual = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const newItem: HistoryItem = {
      id: `manual-${Date.now()}`,
      date: new Date().toISOString(),
      type: 'Registro manual',
      title: manualTitle,
      unidade: 'Registro manual',
      designacao: 'Nao informado',
      bairro: 'Nao informado',
      telefone: 'Nao informado',
      diretor: 'Nao informado',
      representante: 'Nao informado',
      fotos: 0,
      description: manualDescription,
      conclusion: 'Nao informado',
      origin: 'Dispositivo'
    };
    const manualItems = [newItem, ...loadManualHistory().map(normalizeManualItem)];
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
          Consulte visitas, sincronizacoes e anotacoes importantes do GINFOTOS com dados completos da unidade escolar.
        </p>

        <div style={{ display: 'flex', gap: 12, margin: '18px 0', flexWrap: 'wrap' }}>
          <input
            aria-label="Buscar historico"
            placeholder="Buscar por unidade, designacao, bairro, telefone, diretor, data, tipo ou origem"
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
                  <th>Designacao</th>
                  <th>Unidade</th>
                  <th>Bairro</th>
                  <th>Telefone</th>
                  <th>Diretor(a)</th>
                  <th>Representante</th>
                  <th>Fotos</th>
                  <th>Origem</th>
                  <th>Descricao</th>
                  <th>Conclusao</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id}>
                    <td>{formatDate(item.date)}</td>
                    <td>{item.type}</td>
                    <td>{item.designacao}</td>
                    <td>{item.unidade}</td>
                    <td>{item.bairro}</td>
                    <td>{item.telefone}</td>
                    <td>{item.diretor}</td>
                    <td>{item.representante}</td>
                    <td>{item.fotos}</td>
                    <td><span className="status-chip">{item.origin}</span></td>
                    <td>{item.description}</td>
                    <td>{item.conclusion}</td>
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
