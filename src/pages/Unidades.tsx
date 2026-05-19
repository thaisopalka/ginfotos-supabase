import { FormEvent, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

interface Unidade {
  id: string;
  designacao?: string | null;
  name: string;
  address?: string | null;
  bairro?: string | null;
  telefone?: string | null;
  diretor_geral?: string | null;
  celular_diretor_geral?: string | null;
  diretor_adjunto?: string | null;
  celular_diretor_adjunto?: string | null;
  origem?: string;
}

const LOCAL_UNIDADES_KEY = 'ginfotos_unidades_local';

const fallbackUnidades: Unidade[] = [
  { id: '06-22-204', designacao: '06.22.204', name: 'GET JOAO DO RIO', address: '', bairro: '', origem: 'Base provisoria' },
  { id: '06-22-001', designacao: '06.22.001', name: 'EM GUILHERME TELL', address: '', bairro: '', origem: 'Base provisoria' },
  { id: '06-25-000', designacao: '06.25.000', name: 'EM ALZIRO ZARUR', address: '', bairro: '', origem: 'Base provisoria' }
];

const emptyForm: Unidade = {
  id: '',
  designacao: '',
  name: '',
  address: '',
  bairro: '',
  telefone: '',
  diretor_geral: '',
  celular_diretor_geral: '',
  diretor_adjunto: '',
  celular_diretor_adjunto: ''
};

function loadLocalUnidades(): Unidade[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_UNIDADES_KEY) || '[]') as Unidade[];
  } catch {
    return [];
  }
}

function saveLocalUnidades(unidades: Unidade[]) {
  localStorage.setItem(LOCAL_UNIDADES_KEY, JSON.stringify(unidades));
}

function normalizeUnidade(raw: Partial<Unidade>): Unidade {
  return {
    id: raw.id || `local-${Date.now()}-${Math.random()}`,
    designacao: raw.designacao || '',
    name: raw.name || 'Unidade sem nome',
    address: raw.address || '',
    bairro: raw.bairro || '',
    telefone: raw.telefone || '',
    diretor_geral: raw.diretor_geral || '',
    celular_diretor_geral: raw.celular_diretor_geral || '',
    diretor_adjunto: raw.diretor_adjunto || '',
    celular_diretor_adjunto: raw.celular_diretor_adjunto || '',
    origem: raw.origem || 'Local'
  };
}

function mergeUnidades(...groups: Unidade[][]) {
  const map = new Map<string, Unidade>();
  groups.flat().forEach((item) => {
    const key = (item.designacao || item.id || item.name).toLowerCase();
    if (!map.has(key)) map.set(key, item);
  });
  return Array.from(map.values()).sort((a, b) => (a.designacao || a.name).localeCompare(b.designacao || b.name));
}

function parseImportText(text: string): Unidade[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split('\t').length > 1 ? line.split('\t') : line.split(';'))
    .map((cols) => normalizeUnidade({
      id: `local-${Date.now()}-${Math.random()}`,
      designacao: cols[0]?.trim() || '',
      name: cols[1]?.trim() || '',
      address: cols[2]?.trim() || '',
      bairro: cols[3]?.trim() || '',
      telefone: cols[4]?.trim() || '',
      diretor_geral: cols[5]?.trim() || '',
      celular_diretor_geral: cols[6]?.trim() || '',
      diretor_adjunto: cols[7]?.trim() || '',
      celular_diretor_adjunto: cols[8]?.trim() || '',
      origem: 'Importada'
    }))
    .filter((item) => item.name && item.name !== 'Unidade sem nome');
}

export default function Unidades() {
  const [unidades, setUnidades] = useState<Unidade[]>(fallbackUnidades);
  const [form, setForm] = useState<Unidade>(emptyForm);
  const [query, setQuery] = useState('');
  const [importText, setImportText] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchUnidades = async () => {
    setLoading(true);
    const local = loadLocalUnidades();

    try {
      const { data, error } = await supabase.from('unidades').select('*').order('name');
      if (!error && data && data.length > 0) {
        setUnidades(mergeUnidades(local, (data as Unidade[]).map((item) => ({ ...item, origem: 'Supabase' }))));
      } else {
        setUnidades(mergeUnidades(local, fallbackUnidades));
        if (error) setMessage('Supabase nao carregou. Mostrando base local/provisoria.');
      }
    } catch {
      setUnidades(mergeUnidades(local, fallbackUnidades));
      setMessage('Supabase nao carregou. Mostrando base local/provisoria.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUnidades();
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return unidades;
    return unidades.filter((item) =>
      [item.designacao, item.name, item.address, item.bairro, item.telefone, item.diretor_geral, item.diretor_adjunto]
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }, [query, unidades]);

  const updateForm = (field: keyof Unidade, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const record = normalizeUnidade({ ...form, id: form.id || `local-${Date.now()}`, origem: 'Local' });

    const local = loadLocalUnidades();
    const withoutCurrent = local.filter((item) => item.id !== record.id && item.designacao !== record.designacao);
    saveLocalUnidades([record, ...withoutCurrent]);
    setUnidades(mergeUnidades([record], withoutCurrent, unidades));
    setForm(emptyForm);
    setMessage('Unidade salva localmente. Tentando sincronizar com Supabase.');

    const { error } = await supabase.from('unidades').upsert([
      {
        id: record.id.startsWith('local-') ? undefined : record.id,
        name: record.name,
        address: record.address,
        designacao: record.designacao,
        bairro: record.bairro,
        telefone: record.telefone,
        diretor_geral: record.diretor_geral,
        celular_diretor_geral: record.celular_diretor_geral,
        diretor_adjunto: record.diretor_adjunto,
        celular_diretor_adjunto: record.celular_diretor_adjunto
      }
    ]);

    if (error) {
      setMessage(`Unidade salva no dispositivo. Supabase nao aceitou todos os campos: ${error.message}`);
    } else {
      setMessage('Unidade salva e sincronizada.');
      fetchUnidades();
    }
  };

  const handleImport = () => {
    const imported = parseImportText(importText);
    if (imported.length === 0) {
      setMessage('Nenhuma unidade valida encontrada para importar.');
      return;
    }
    const local = mergeUnidades(imported, loadLocalUnidades());
    saveLocalUnidades(local);
    setUnidades(mergeUnidades(local, unidades));
    setImportText('');
    setMessage(`${imported.length} unidade(s) importada(s) no dispositivo.`);
  };

  const handleEdit = (item: Unidade) => {
    setForm(normalizeUnidade(item));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleClearLocal = () => {
    if (!window.confirm('Limpar apenas unidades salvas/importadas neste dispositivo?')) return;
    saveLocalUnidades([]);
    setMessage('Base local limpa. Unidades do Supabase foram mantidas.');
    fetchUnidades();
  };

  return (
    <div className="dashboard-page">
      <div className="top-row">
        <div>
          <p className="page-label">Base de dados</p>
          <h1>Unidades Escolares</h1>
        </div>
        <button type="button" className="empty-button" onClick={fetchUnidades}>Atualizar</button>
      </div>

      <section className="page-card">
        <p className="page-description">Cadastre, pesquise, edite e importe unidades escolares da E/6 CRE/GIN.</p>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14, marginTop: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div className="field"><label>Designacao</label><input value={form.designacao || ''} onChange={(e) => updateForm('designacao', e.target.value)} placeholder="06.22.001" /></div>
            <div className="field"><label>Unidade Escolar</label><input value={form.name} onChange={(e) => updateForm('name', e.target.value)} required /></div>
            <div className="field"><label>Bairro</label><input value={form.bairro || ''} onChange={(e) => updateForm('bairro', e.target.value)} /></div>
          </div>
          <div className="field"><label>Endereco</label><input value={form.address || ''} onChange={(e) => updateForm('address', e.target.value)} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div className="field"><label>Telefone</label><input value={form.telefone || ''} onChange={(e) => updateForm('telefone', e.target.value)} /></div>
            <div className="field"><label>Diretor(a) Geral</label><input value={form.diretor_geral || ''} onChange={(e) => updateForm('diretor_geral', e.target.value)} /></div>
            <div className="field"><label>Celular Diretor(a)</label><input value={form.celular_diretor_geral || ''} onChange={(e) => updateForm('celular_diretor_geral', e.target.value)} /></div>
            <div className="field"><label>Diretor(a) Adjunto(a)</label><input value={form.diretor_adjunto || ''} onChange={(e) => updateForm('diretor_adjunto', e.target.value)} /></div>
            <div className="field"><label>Celular Adjunto(a)</label><input value={form.celular_diretor_adjunto || ''} onChange={(e) => updateForm('celular_diretor_adjunto', e.target.value)} /></div>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button className="primary" type="submit">Salvar Unidade</button>
            <button className="empty-link" type="button" onClick={() => setForm(emptyForm)}>Limpar formulario</button>
            <button className="empty-link" type="button" onClick={handleClearLocal}>Limpar base local</button>
          </div>
        </form>
        {message && <p className="notice">{message}</p>}
      </section>

      <section className="page-card">
        <p className="page-label">Importacao rapida</p>
        <h2 style={{ marginTop: 0 }}>Colar dados da planilha</h2>
        <p className="page-description">Cole linhas copiadas do Excel nesta ordem: DESIGNACAO, UNIDADE ESCOLAR, ENDERECO, BAIRRO, TELEFONE, DIRETOR GERAL, CELULAR DIRETOR, DIRETOR ADJUNTO, CELULAR ADJUNTO.</p>
        <textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={5} placeholder="Cole aqui as linhas da planilha" style={{ marginTop: 14 }} />
        <div style={{ marginTop: 12 }}>
          <button type="button" className="primary" onClick={handleImport}>Importar para o dispositivo</button>
        </div>
      </section>

      <section className="page-card">
        <div className="recent-header">
          <div>
            <p className="page-label">Consulta</p>
            <h2>Lista de Unidades</h2>
          </div>
          <span className="status-pill">{loading ? 'Carregando...' : `${filtered.length} unidade(s)`}</span>
        </div>
        <input placeholder="Buscar por designacao, unidade, endereco, bairro, telefone ou diretor" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div style={{ overflowX: 'auto', marginTop: 18 }}>
          <table className="table-list">
            <thead>
              <tr>
                <th>Designacao</th>
                <th>Unidade</th>
                <th>Endereco</th>
                <th>Bairro</th>
                <th>Diretor(a)</th>
                <th>Celular</th>
                <th>Origem</th>
                <th>Acao</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={`${item.origem}-${item.id}-${item.designacao}`}>
                  <td>{item.designacao || '-'}</td>
                  <td>{item.name}</td>
                  <td>{item.address || '-'}</td>
                  <td>{item.bairro || '-'}</td>
                  <td>{item.diretor_geral || '-'}</td>
                  <td>{item.celular_diretor_geral || '-'}</td>
                  <td><span className="status-chip">{item.origem || 'Supabase'}</span></td>
                  <td><button type="button" className="empty-link" onClick={() => handleEdit(item)}>Editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
