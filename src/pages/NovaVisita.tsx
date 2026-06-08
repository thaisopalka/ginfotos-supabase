import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { UserProfile } from '../App';
import { appendDictation, startVoiceInput } from '../lib/voiceInput';
import { fileToCompressedImageDataUrl } from '../lib/fileDataUrl';
import { fetchSupabaseUnidades, loadLocalUnidades, mergeUnidades, saveLocalUnidades, UnidadeApp } from '../lib/unidadesSource';

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

const fallbackUnidades: UnidadeApp[] = [
  { id: '06-22-204', designacao: '06.22.204', name: 'GET JOAO DO RIO', address: '', bairro: '', origem: 'Base provisória' },
  { id: '06-22-001', designacao: '06.22.001', name: 'EM GUILHERME TELL', address: '', bairro: '', origem: 'Base provisória' },
  { id: '06-25-000', designacao: '06.25.000', name: 'EM ALZIRO ZARUR', address: '', bairro: '', origem: 'Base provisória' }
];

const visitTypes = ['VISTORIA TECNICA', 'INAUGURACAO DE GET', 'VISTORIA GET', 'OBRA', 'OUTROS'];
const LOCAL_VISITS_KEY = 'ginfotos_visitas_local';

function loadLocalVisits(): LocalVisitRecord[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_VISITS_KEY) || '[]') as LocalVisitRecord[];
  } catch {
    return [];
  }
}

function saveLocalVisit(record: LocalVisitRecord) {
  const existing = loadLocalVisits();
  const filtered = existing.filter((item: LocalVisitRecord) => item.id !== record.id);
  localStorage.setItem(LOCAL_VISITS_KEY, JSON.stringify([record, ...filtered].slice(0, 80)));
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function buildNotes(params: {
  tipo: string;
  representante: string;
  servicos: string;
  observacoes: string;
  conclusao: string;
  selectedUnidade: UnidadeApp;
}) {
  const { tipo, representante, servicos, observacoes, conclusao, selectedUnidade } = params;
  return [
    `Tipo de visita/obra: ${tipo}`,
    `Representante E/6 CRE/GIN: ${representante}`,
    `Servicos verificados: ${servicos || 'Nao informado'}`,
    `Observacoes: ${observacoes || 'Nao informado'}`,
    `Conclusao: ${conclusao || 'Nao informado'}`,
    `Unidade escolar: ${selectedUnidade.name}`,
    `Designacao: ${selectedUnidade.designacao || 'Nao informado'}`,
    `Endereco: ${selectedUnidade.address || 'Nao informado'}`,
    `Bairro: ${selectedUnidade.bairro || 'Nao informado'}`,
    `Telefone: ${selectedUnidade.telefone || 'Nao informado'}`,
    `Diretor: ${selectedUnidade.diretor_geral || 'Nao informado'}`
  ].join('\n');
}

async function saveVisitViaServer(visit: {
  visitor_name: string;
  unidade_id: string;
  visit_date: string;
  notes: string;
  created_by: string;
  photos: { name: string; caption: string; dataUrl?: string }[];
}) {
  const response = await fetch('/api/visitas', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    body: JSON.stringify({ visit })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'API /api/visitas não salvou a visita.');
  return payload.visit?.id as string | undefined;
}

export default function NovaVisita({ profile }: NovaVisitaProps) {
  const [unidades, setUnidades] = useState<UnidadeApp[]>(fallbackUnidades);
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

  const loadUnidades = async () => {
    const localUnits = loadLocalUnidades<UnidadeApp>();
    const initialUnits = mergeUnidades(localUnits, fallbackUnidades) as UnidadeApp[];
    setUnidades(initialUnits);
    setUnidadeId((current) => (initialUnits.some((item: UnidadeApp) => item.id === current) ? current : initialUnits[0]?.id || ''));

    const result = await fetchSupabaseUnidades();
    if (result.unidades.length > 0) {
      const officialUnits = result.unidades as UnidadeApp[];
      setUnidades(officialUnits);
      saveLocalUnidades(officialUnits);
      setUnidadeId((current) => (officialUnits.some((item: UnidadeApp) => item.id === current) ? current : officialUnits[0]?.id || ''));
      setMessage(`${result.unidades.length} unidade(s) atualizada(s) do Supabase (${result.tableName}).`);
    } else {
      setMessage(`Base do Supabase não carregou. Motivo: ${result.error || 'sem retorno'}. Mostrando base local/provisória.`);
    }
  };

  useEffect(() => {
    loadUnidades();
    const handler = () => loadUnidades();
    window.addEventListener('ginfotos-unidades-updated', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('ginfotos-unidades-updated', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  const filteredUnidades = useMemo(() => {
    const term = unidadeQuery.trim().toLowerCase();
    if (!term) return unidades;
    return unidades.filter((item: UnidadeApp) =>
      [item.designacao, item.name, item.address, item.bairro, item.telefone, item.diretor_geral, item.diretor_adjunto]
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }, [unidadeQuery, unidades]);

  const selectedUnidade = useMemo(
    () => unidades.find((item: UnidadeApp) => item.id === unidadeId) || filteredUnidades[0] || unidades[0],
    [unidadeId, unidades, filteredUnidades]
  );

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setMessage('Comprimindo fotos para salvar no relatório e sincronizar no app...');
    try {
      const newPhotos = await Promise.all(Array.from(files).slice(0, 8).map(async (file: File) => ({
        id: `${Date.now()}-${file.name}-${Math.random()}`,
        file,
        previewUrl: URL.createObjectURL(file),
        dataUrl: await fileToCompressedImageDataUrl(file),
        caption: ''
      })));
      setPhotos((current) => [...current, ...newPhotos].slice(0, 8));
      setMessage(`${newPhotos.length} foto(s) salva(s) temporariamente. Ao clicar em SALVAR VISITA, elas serão sincronizadas para todos.`);
    } catch {
      setMessage('Não foi possível salvar uma ou mais fotos. Tente anexar novamente.');
    }
  };

  const handleCaptureChange = (event: ChangeEvent<HTMLInputElement>) => { addFiles(event.target.files); event.target.value = ''; };
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => { addFiles(event.target.files); event.target.value = ''; };
  const updateCaption = (id: string, caption: string) => setPhotos((current) => current.map((photo: PhotoItem) => (photo.id === id ? { ...photo, caption } : photo)));
  const dictateCaption = (id: string) => {
    const current = photos.find((photo: PhotoItem) => photo.id === id)?.caption || '';
    startVoiceInput((text) => updateCaption(id, appendDictation(current, text)), setVoiceStatus);
  };
  const removePhoto = (id: string) => setPhotos((current) => {
    const photo = current.find((item: PhotoItem) => item.id === id);
    if (photo) URL.revokeObjectURL(photo.previewUrl);
    return current.filter((item: PhotoItem) => item.id !== id);
  });

  const resetFormAfterSave = () => {
    photos.forEach((photo: PhotoItem) => URL.revokeObjectURL(photo.previewUrl));
    setPhotos([]);
    setServicos('');
    setObservacoes('');
    setConclusao('');
    setVisitDate(todayDate());
    setTipo(visitTypes[0]);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedUnidade) { setMessage('Selecione uma unidade escolar.'); return; }

    setSaving(true);
    setMessage('Salvando visita e fotos...');

    const notes = buildNotes({ tipo, representante, servicos, observacoes, conclusao, selectedUnidade });
    const localId = `local-${Date.now()}`;
    let savedId = localId;
    let savedInSupabase = false;
    let supabaseError = '';
    const compactPhotos = photos.map((photo: PhotoItem) => ({ name: photo.file.name, caption: photo.caption, dataUrl: photo.dataUrl }));

    const visitRecord = {
      visitor_name: representante,
      unidade_id: selectedUnidade.id,
      visit_date: visitDate,
      notes,
      created_by: profile?.id || profile?.email || 'app',
      photos: compactPhotos
    };

    try {
      const serverId = await saveVisitViaServer(visitRecord);
      if (serverId) {
        savedId = serverId;
        savedInSupabase = true;
      }
    } catch (serverError) {
      supabaseError = serverError instanceof Error ? serverError.message : 'API /api/visitas falhou';
      try {
        const notesWithPhotos = compactPhotos.length ? `${notes}\nGINFOTOS_JSON:${JSON.stringify({ fotos: compactPhotos })}` : notes;
        const { data, error } = await supabase.from('visitas').insert([{ ...visitRecord, notes: notesWithPhotos }]).select('id').single();
        if (error) supabaseError = `${supabaseError} | Supabase direto: ${error.message}`;
        else if (data?.id) {
          savedId = data.id;
          savedInSupabase = true;
        }
      } catch (error) {
        supabaseError = `${supabaseError} | ${error instanceof Error ? error.message : 'erro desconhecido'}`;
      }
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
      photo_count: compactPhotos.length,
      fotos: compactPhotos,
      created_by: profile?.email,
      created_at: new Date().toISOString()
    });

    window.dispatchEvent(new Event('ginfotos-visitas-updated'));
    setMessage(savedInSupabase
      ? `Visita salva e sincronizada com ${compactPhotos.length} foto(s). Abra Visitas Técnicas e clique em Atualizar visitas.`
      : `Visita salva apenas neste celular com ${compactPhotos.length} foto(s). Falha na sincronização: ${supabaseError || 'Supabase não respondeu'}.`);
    resetFormAfterSave();
    setSaving(false);
  };

  const voiceButton = (onClick: () => void) => <button type="button" className="voice-button" onClick={onClick}>🎤 FALAR E CORRIGIR TEXTO</button>;

  return (
    <div className="dashboard-page">
      <div className="page-card">
        <p className="page-label">Nova Visita</p>
        <h1 className="page-title">Nova Visita Técnica</h1>
        <p className="page-description">Registre a vistoria, selecione a unidade escolar, descreva os serviços verificados e anexe fotos da visita.</p>
        <button type="button" className="empty-button" onClick={loadUnidades}>Atualizar/Sincronizar 115 unidades</button>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 18, marginTop: 22 }}>
          <div className="field"><label htmlFor="busca-unidade">Buscar unidade escolar</label><input id="busca-unidade" value={unidadeQuery} onChange={(event) => setUnidadeQuery(event.target.value)} placeholder="Buscar por designação, unidade, bairro, endereço ou diretor" /></div>
          <div className="field"><label htmlFor="unidade">Unidade Escolar</label><select id="unidade" value={unidadeId} onChange={(event) => setUnidadeId(event.target.value)}>{filteredUnidades.map((item: UnidadeApp) => <option key={item.id} value={item.id}>{item.designacao ? `${item.designacao} - ${item.name}` : item.name}</option>)}</select></div>
          {selectedUnidade && <div className="page-card" style={{ boxShadow: 'none', padding: 18, background: '#f8fafc' }}><strong>{selectedUnidade.designacao || 'Designação não informada'} - {selectedUnidade.name}</strong><p className="page-description">Endereço: {selectedUnidade.address || 'Não informado'}</p><p className="page-description">Bairro: {selectedUnidade.bairro || 'Não informado'}</p><p className="page-description">Telefone: {selectedUnidade.telefone || 'Não informado'}</p><p className="page-description">Diretor(a): {selectedUnidade.diretor_geral || 'Não informado'} {selectedUnidade.celular_diretor_geral ? `- ${selectedUnidade.celular_diretor_geral}` : ''}</p><p className="page-description">Origem da base: {selectedUnidade.origem || 'Supabase'}</p></div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}><div className="field"><label htmlFor="visitDate">Data da visita</label><input id="visitDate" type="date" value={visitDate} onChange={(event) => setVisitDate(event.target.value)} required /></div><div className="field"><label htmlFor="tipo">Tipo de visita/obra</label><select id="tipo" value={tipo} onChange={(event) => setTipo(event.target.value)}>{visitTypes.map((item: string) => <option key={item}>{item}</option>)}</select></div></div>
          <div className="field"><label htmlFor="representante">Representante E/6 CRE/GIN</label><input id="representante" value={representante} onChange={(event) => setRepresentante(event.target.value)} required /></div>
          {voiceStatus && <p className="notice">{voiceStatus}</p>}
          <div className="field"><label htmlFor="servicos">Serviços Verificados</label>{voiceButton(() => startVoiceInput((text) => setServicos((current) => appendDictation(current, text)), setVoiceStatus))}<textarea id="servicos" value={servicos} onChange={(event) => setServicos(event.target.value)} rows={4} placeholder="Descreva os problemas, serviços e necessidades verificadas." /></div>
          <div className="field"><label htmlFor="observacoes">Observações</label>{voiceButton(() => startVoiceInput((text) => setObservacoes((current) => appendDictation(current, text)), setVoiceStatus))}<textarea id="observacoes" value={observacoes} onChange={(event) => setObservacoes(event.target.value)} rows={3} /></div>
          <div className="field"><label htmlFor="conclusao">Conclusão</label>{voiceButton(() => startVoiceInput((text) => setConclusao((current) => appendDictation(current, text)), setVoiceStatus))}<textarea id="conclusao" value={conclusao} onChange={(event) => setConclusao(event.target.value)} rows={3} /></div>
          <div className="page-card" style={{ boxShadow: 'none', padding: 18 }}><h2 style={{ marginTop: 0 }}>Fotos da visita</h2><p className="page-description">As fotos serão reduzidas automaticamente para salvar no celular, aparecer no relatório e sincronizar para o computador.</p><div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}><button className="primary" type="button" onClick={() => captureInputRef.current?.click()}>TIRAR FOTO AGORA</button><button className="primary" type="button" onClick={() => fileInputRef.current?.click()}>ANEXAR FOTOS</button><span className="status-pill">{photos.length} foto(s)</span></div><input ref={captureInputRef} type="file" accept="image/*" capture="environment" hidden onChange={handleCaptureChange} /><input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={handleFileChange} />{photos.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginTop: 18 }}>{photos.map((photo: PhotoItem) => <div key={photo.id} className="page-card" style={{ boxShadow: 'none', padding: 12 }}><img src={photo.previewUrl} alt="Foto da visita" style={{ width: '100%', height: 170, objectFit: 'cover', borderRadius: 12 }} /><label style={{ marginTop: 10 }} htmlFor={`caption-${photo.id}`}>Legenda</label><button type="button" className="voice-button" onClick={() => dictateCaption(photo.id)}>🎤 FALAR LEGENDA</button><textarea id={`caption-${photo.id}`} value={photo.caption} onChange={(event) => updateCaption(photo.id, event.target.value)} rows={2} placeholder="Digite ou dite a legenda da foto." /><button type="button" className="empty-button" style={{ marginTop: 10, background: '#ef4444' }} onClick={() => removePhoto(photo.id)}>Excluir foto</button></div>)}</div>}</div>
          <button className="primary large" type="submit" disabled={saving}>{saving ? 'SALVANDO...' : 'SALVAR VISITA'}</button>
        </form>
        {message && <p className="notice">{message}</p>}
      </div>
    </div>
  );
}
