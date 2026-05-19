import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { UserProfile } from '../App';
import { appendDictation, startVoiceInput } from '../lib/voiceInput';
import { fileToDataUrl } from '../lib/fileDataUrl';

interface UnidadeOption {
  id: string;
  name: string;
  address?: string | null;
  designacao?: string | null;
  bairro?: string | null;
  telefone?: string | null;
  diretor_geral?: string | null;
  celular_diretor_geral?: string | null;
  diretor_adjunto?: string | null;
  celular_diretor_adjunto?: string | null;
  origem?: string;
}

interface NovaVisitaProps {
  profile: UserProfile | null;
}

interface PhotoItem {
  id: string;
  file: File;
  previewUrl: string;
  dataUrl: string;
  caption: string;
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
  fotos: { name: string; caption: string; dataUrl?: string }[];
  created_by?: string;
  created_at: string;
}

const fallbackUnidades: UnidadeOption[] = [
  { id: '06-22-204', designacao: '06.22.204', name: 'GET JOAO DO RIO', address: '', bairro: '', origem: 'Base provisoria' },
  { id: '06-22-001', designacao: '06.22.001', name: 'EM GUILHERME TELL', address: '', bairro: '', origem: 'Base provisoria' },
  { id: '06-25-000', designacao: '06.25.000', name: 'EM ALZIRO ZARUR', address: '', bairro: '', origem: 'Base provisoria' }
];

const visitTypes = ['VISTORIA TECNICA', 'INAUGURACAO DE GET', 'VISTORIA GET', 'OBRA', 'OUTROS'];
const LOCAL_VISITS_KEY = 'ginfotos_visitas_local';
const LOCAL_UNIDADES_KEY = 'ginfotos_unidades_local';

function loadLocalArray<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]') as T[];
  } catch {
    return [];
  }
}

function saveLocalVisit(record: LocalVisitRecord) {
  const existing = loadLocalArray<LocalVisitRecord>(LOCAL_VISITS_KEY);
  const filtered = existing.filter((item) => item.id !== record.id);
  localStorage.setItem(LOCAL_VISITS_KEY, JSON.stringify([record, ...filtered]));
}

function normalizeUnidade(item: Partial<UnidadeOption>): UnidadeOption {
  return {
    id: item.id || `local-${Date.now()}-${Math.random()}`,
    name: item.name || 'Unidade sem nome',
    address: item.address || '',
    designacao: item.designacao || '',
    bairro: item.bairro || '',
    telefone: item.telefone || '',
    diretor_geral: item.diretor_geral || '',
    celular_diretor_geral: item.celular_diretor_geral || '',
    diretor_adjunto: item.diretor_adjunto || '',
    celular_diretor_adjunto: item.celular_diretor_adjunto || '',
    origem: item.origem || 'Local'
  };
}

function mergeUnidades(...groups: UnidadeOption[][]) {
  const map = new Map<string, UnidadeOption>();
  groups.flat().forEach((item) => {
    const normalized = normalizeUnidade(item);
    const key = (normalized.designacao || normalized.id || normalized.name).toLowerCase();
    if (!map.has(key)) map.set(key, normalized);
  });
  return Array.from(map.values()).sort((a, b) => (a.designacao || a.name).localeCompare(b.designacao || b.name));
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function NovaVisita({ profile }: NovaVisitaProps) {
  const [unidades, setUnidades] = useState<UnidadeOption[]>(fallbackUnidades);
  const [unidadeId, setUnidadeId] = useState(fallbackUnidades[0].id);
  const [unidadeQuery, setUnidadeQuery] = useState('');
  const [visitDate, setVisitDate] = useState(todayDate());
  const [tipo, setTipo] = useState(visitTypes[0]);
  const [representante, setRepresentante] = useState('ENGA. MARCIA BRAGA');
  const [servicos, setServicos] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [conclusao, setConclusao] = useState('');
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('');
  const captureInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    async function loadUnidades() {
      const localUnits = loadLocalArray<UnidadeOption>(LOCAL_UNIDADES_KEY).map((item) => ({ ...item, origem: item.origem || 'Local' }));
      const initialUnits = mergeUnidades(localUnits, fallbackUnidades);
      setUnidades(initialUnits);
      setUnidadeId((current) => current || initialUnits[0]?.id || '');

      try {
        const { data, error } = await supabase
          .from('unidades')
          .select('id, name, address, designacao, bairro, telefone, diretor_geral, celular_diretor_geral, diretor_adjunto, celular_diretor_adjunto')
          .order('name');

        if (!error && data && data.length > 0) {
          const loaded = (data as UnidadeOption[]).map((item) => ({ ...item, origem: 'Supabase' }));
          const merged = mergeUnidades(localUnits, loaded, fallbackUnidades);
          setUnidades(merged);
          setUnidadeId((current) => (merged.some((item) => item.id === current) ? current : merged[0]?.id || ''));
        }
      } catch {
        setMessage('Base do Supabase nao carregou. A lista local/provisoria continua disponivel.');
      }
    }

    loadUnidades();
  }, []);

  const filteredUnidades = useMemo(() => {
    const term = unidadeQuery.trim().toLowerCase();
    if (!term) return unidades;
    return unidades.filter((item) =>
      [item.designacao, item.name, item.address, item.bairro, item.telefone, item.diretor_geral, item.diretor_adjunto]
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }, [unidadeQuery, unidades]);

  const selectedUnidade = useMemo(
    () => unidades.find((item) => item.id === unidadeId) || filteredUnidades[0] || unidades[0],
    [unidadeId, unidades, filteredUnidades]
  );

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setMessage('Preparando fotos para o relatório Word...');

    try {
      const newPhotos = await Promise.all(Array.from(files).map(async (file) => ({
        id: `${Date.now()}-${file.name}-${Math.random()}`,
        file,
        previewUrl: URL.createObjectURL(file),
        dataUrl: await fileToDataUrl(file),
        caption: ''
      })));
      setPhotos((current) => [...current, ...newPhotos]);
      setMessage(`${newPhotos.length} foto(s) pronta(s) para aparecer no relatório Word.`);
    } catch {
      setMessage('Não foi possível incorporar uma ou mais fotos. Tente anexar novamente.');
    }
  };

  const handleCaptureChange = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(event.target.files);
    event.target.value = '';
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(event.target.files);
    event.target.value = '';
  };

  const updateCaption = (id: string, caption: string) => {
    setPhotos((current) => current.map((photo) => (photo.id === id ? { ...photo, caption } : photo)));
  };

  const dictateCaption = (id: string) => {
    const current = photos.find((photo) => photo.id === id)?.caption || '';
    startVoiceInput((text) => updateCaption(id, appendDictation(current, text)), setVoiceStatus);
  };

  const removePhoto = (id: string) => {
    setPhotos((current) => {
      const photo = current.find((item) => item.id === id);
      if (photo) URL.revokeObjectURL(photo.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  };

  const uploadPhotos = async (visitId: string) => {
    for (const photo of photos) {
      const safeName = photo.file.name.replace(/[^a-zA-Z0-9_.-]/g, '-');
      const filePath = `${visitId}/${Date.now()}-${safeName}`;
      await supabase.storage.from('visita-fotos').upload(filePath, photo.file, {
        cacheControl: '3600',
        upsert: true
      });
    }
  };

  const resetFormAfterSave = () => {
    photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    setPhotos([]);
    setServicos('');
    setObservacoes('');
    setConclusao('');
    setVisitDate(todayDate());
    setTipo(visitTypes[0]);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedUnidade) {
      setMessage('Selecione uma unidade escolar.');
      return;
    }

    setSaving(true);
    setMessage('Salvando visita...');

    const notes = [
      `Tipo de visita/obra: ${tipo}`,
      `Representante E/6 CRE/GIN: ${representante}`,
      `Servicos verificados: ${servicos || 'Nao informado'}`,
      `Observacoes: ${observacoes || 'Nao informado'}`,
      `Conclusao: ${conclusao || 'Nao informado'}`,
      `Unidade escolar: ${selectedUnidade.name}`,
      `Designacao: ${selectedUnidade.designacao || 'Nao informado'}`,
      `Endereco: ${selectedUnidade.address || 'Nao informado'}`,
      `Bairro: ${selectedUnidade.bairro || 'Nao informado'}`
    ].join('\n');

    const localId = `local-${Date.now()}`;
    let savedId = localId;
    let savedInSupabase = false;

    try {
      const { data, error } = await supabase
        .from('visitas')
        .insert([
          {
            visitor_name: representante,
            unidade_id: selectedUnidade.id,
            visit_date: visitDate,
            notes,
            created_by: profile?.id || profile?.email || 'admin'
          }
        ])
        .select('id')
        .single();

      if (!error && data?.id) {
        savedId = data.id;
        savedInSupabase = true;
        await uploadPhotos(savedId);
      }
    } catch {
      savedInSupabase = false;
    }

    saveLocalVisit({
      id: savedId,
      unidade_id: selectedUnidade.id,
      unidade_nome: selectedUnidade.name,
      designacao: selectedUnidade.designacao,
      endereco: selectedUnidade.address,
      bairro: selectedUnidade.bairro,
      telefone: selectedUnidade.telefone,
      diretor_geral: selectedUnidade.diretor_geral,
      celular_diretor_geral: selectedUnidade.celular_diretor_geral,
      diretor_adjunto: selectedUnidade.diretor_adjunto,
      celular_diretor_adjunto: selectedUnidade.celular_diretor_adjunto,
      visit_date: visitDate,
      tipo,
      representante,
      servicos,
      observacoes,
      conclusao,
      photo_count: photos.length,
      fotos: photos.map((photo) => ({ name: photo.file.name, caption: photo.caption, dataUrl: photo.dataUrl })),
      created_by: profile?.email,
      created_at: new Date().toISOString()
    });

    window.dispatchEvent(new Event('ginfotos-visitas-updated'));

    setMessage(
      savedInSupabase
        ? 'Visita salva com sucesso. As fotos foram incorporadas ao relatório Word e também enviadas ao Supabase.'
        : 'Visita salva no dispositivo. As fotos foram incorporadas ao relatório Word.'
    );
    resetFormAfterSave();
    setSaving(false);
  };

  const voiceButton = (onClick: () => void) => (
    <button type="button" className="voice-button" onClick={onClick}>🎤 FALAR E CORRIGIR TEXTO</button>
  );

  return (
    <div className="dashboard-page">
      <div className="page-card">
        <p className="page-label">Nova Visita</p>
        <h1 className="page-title">Nova Visita Tecnica</h1>
        <p className="page-description">
          Registre a vistoria, selecione a unidade escolar, descreva os servicos verificados e anexe fotos da visita.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 18, marginTop: 22 }}>
          <div className="field">
            <label htmlFor="busca-unidade">Buscar unidade escolar</label>
            <input id="busca-unidade" value={unidadeQuery} onChange={(event) => setUnidadeQuery(event.target.value)} placeholder="Buscar por designacao, unidade, bairro, endereco ou diretor" />
          </div>

          <div className="field">
            <label htmlFor="unidade">Unidade Escolar</label>
            <select id="unidade" value={unidadeId} onChange={(event) => setUnidadeId(event.target.value)}>
              {filteredUnidades.map((item) => <option key={item.id} value={item.id}>{item.designacao ? `${item.designacao} - ${item.name}` : item.name}</option>)}
            </select>
          </div>

          {selectedUnidade && <div className="page-card" style={{ boxShadow: 'none', padding: 18, background: '#f8fafc' }}><strong>{selectedUnidade.designacao || 'Designacao nao informada'} - {selectedUnidade.name}</strong><p className="page-description">Endereco: {selectedUnidade.address || 'Nao informado'}</p><p className="page-description">Bairro: {selectedUnidade.bairro || 'Nao informado'}</p><p className="page-description">Telefone: {selectedUnidade.telefone || 'Nao informado'}</p><p className="page-description">Diretor(a): {selectedUnidade.diretor_geral || 'Nao informado'} {selectedUnidade.celular_diretor_geral ? `- ${selectedUnidade.celular_diretor_geral}` : ''}</p><p className="page-description">Origem da base: {selectedUnidade.origem || 'Supabase'}</p></div>}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}><div className="field"><label htmlFor="visitDate">Data da visita</label><input id="visitDate" type="date" value={visitDate} onChange={(event) => setVisitDate(event.target.value)} required /></div><div className="field"><label htmlFor="tipo">Tipo de visita/obra</label><select id="tipo" value={tipo} onChange={(event) => setTipo(event.target.value)}>{visitTypes.map((item) => <option key={item}>{item}</option>)}</select></div></div>

          <div className="field"><label htmlFor="representante">Representante E/6 CRE/GIN</label><input id="representante" value={representante} onChange={(event) => setRepresentante(event.target.value)} required /></div>

          {voiceStatus && <p className="notice">{voiceStatus}</p>}
          <div className="field"><label htmlFor="servicos">Servicos Verificados</label>{voiceButton(() => startVoiceInput((text) => setServicos((current) => appendDictation(current, text)), setVoiceStatus))}<textarea id="servicos" value={servicos} onChange={(event) => setServicos(event.target.value)} rows={4} placeholder="Descreva os problemas, servicos e necessidades verificadas." /></div>
          <div className="field"><label htmlFor="observacoes">Observacoes</label>{voiceButton(() => startVoiceInput((text) => setObservacoes((current) => appendDictation(current, text)), setVoiceStatus))}<textarea id="observacoes" value={observacoes} onChange={(event) => setObservacoes(event.target.value)} rows={3} /></div>
          <div className="field"><label htmlFor="conclusao">Conclusao</label>{voiceButton(() => startVoiceInput((text) => setConclusao((current) => appendDictation(current, text)), setVoiceStatus))}<textarea id="conclusao" value={conclusao} onChange={(event) => setConclusao(event.target.value)} rows={3} /></div>

          <div className="page-card" style={{ boxShadow: 'none', padding: 18 }}>
            <h2 style={{ marginTop: 0 }}>Fotos da visita</h2><p className="page-description">Tire fotos na hora pelo celular ou anexe imagens da galeria/computador. Cada foto pode receber legenda com áudio e será incorporada ao relatório Word.</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}><button className="primary" type="button" onClick={() => captureInputRef.current?.click()}>TIRAR FOTO AGORA</button><button className="primary" type="button" onClick={() => fileInputRef.current?.click()}>ANEXAR FOTOS</button><span className="status-pill">{photos.length} foto(s)</span></div>
            <input ref={captureInputRef} type="file" accept="image/*" capture="environment" hidden onChange={handleCaptureChange} /><input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={handleFileChange} />
            {photos.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginTop: 18 }}>{photos.map((photo) => <div key={photo.id} className="page-card" style={{ boxShadow: 'none', padding: 12 }}><img src={photo.previewUrl} alt="Foto da visita" style={{ width: '100%', height: 170, objectFit: 'cover', borderRadius: 12 }} /><label style={{ marginTop: 10 }} htmlFor={`caption-${photo.id}`}>Legenda</label><button type="button" className="voice-button" onClick={() => dictateCaption(photo.id)}>🎤 FALAR LEGENDA</button><textarea id={`caption-${photo.id}`} value={photo.caption} onChange={(event) => updateCaption(photo.id, event.target.value)} rows={2} placeholder="Digite ou dite a legenda da foto." /><button type="button" className="empty-button" style={{ marginTop: 10, background: '#ef4444' }} onClick={() => removePhoto(photo.id)}>Excluir foto</button></div>)}</div>}
          </div>

          <button className="primary large" type="submit" disabled={saving}>{saving ? 'SALVANDO...' : 'SALVAR VISITA'}</button>
        </form>
        {message && <p className="notice">{message}</p>}
      </div>
    </div>
  );
}
