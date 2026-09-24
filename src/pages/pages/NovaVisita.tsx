import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { UserProfile } from '../App';
import { appendDictation, startVoiceInput, stopVoiceInput } from '../lib/voiceInput';
import { fileToCompressedImageDataUrl } from '../lib/fileDataUrl';
import { fetchSupabaseUnidades, loadLocalUnidades, mergeUnidades, saveLocalUnidades, UnidadeApp } from '../lib/unidadesSource';
import {
  clearVisitDraft,
  deleteVisitDraftPhoto,
  loadVisitDraft,
  saveVisitDraftMeta,
  saveVisitDraftPhoto,
  visitDraftKey,
  savePersistentPendingVisit
} from '../lib/visitDraft';
import { apiFetch, apiReadJson } from '../lib/apiClient';

interface NovaVisitaProps {
  profile: UserProfile | null;
}

interface PhotoItem {
  id: string;
  file: File;
  previewUrl: string;
  dataUrl: string;
  caption: string;
  isProcessing?: boolean;
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

function makeDraftClientId() {
  const random = Math.random().toString(36).slice(2, 9);
  return `local-${Date.now()}-${random}`;
}

function unidadeStableKey(item: UnidadeApp) {
  const designation = String(item.designacao || '').trim();
  if (designation) return `d:${designation.toLowerCase()}`;
  const name = String(item.name || '').trim();
  if (name) return `n:${name.toLowerCase()}`;
  return `i:${String(item.id || '').trim().toLowerCase()}`;
}

function findUnitByStableKey(items: UnidadeApp[], key: string) {
  return items.find((item) => unidadeStableKey(item) === key);
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

export default function NovaVisita({ profile }: NovaVisitaProps) {
  const [unidades, setUnidades] = useState<UnidadeApp[]>(fallbackUnidades);
  const [unidadeKey, setUnidadeKey] = useState(unidadeStableKey(fallbackUnidades[0]));
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
  const [saveProgress, setSaveProgress] = useState<{ current: number; total: number; text: string } | null>(null);

  // Voz
  const [recordingField, setRecordingField] = useState<string | null>(null);
  const [voiceInterim, setVoiceInterim] = useState('');
  const [voiceStatus, setVoiceStatus] = useState('');
  const voiceStopperRef = useRef<{ stop: () => void } | null>(null);

  // Rascunho
  const [draftStatus, setDraftStatus] = useState('Verificando rascunho anterior...');
  const [draftClientId, setDraftClientId] = useState(makeDraftClientId());
  const captureInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const draftReadyRef = useRef(false);
  const suspendDraftRef = useRef(false);
  const draftKey = useMemo(() => visitDraftKey(profile?.email), [profile?.email]);

  const preserveSelection = (items: UnidadeApp[]) => {
    setUnidadeKey((current) => {
      if (findUnitByStableKey(items, current)) return current;
      if (current && draftReadyRef.current) return current;
      return items[0] ? unidadeStableKey(items[0]) : '';
    });
  };

  const loadUnidades = async () => {
    const localUnits = loadLocalUnidades<UnidadeApp>();
    const initialUnits = mergeUnidades(localUnits, fallbackUnidades) as UnidadeApp[];
    setUnidades(initialUnits);
    preserveSelection(initialUnits);

    const result = await fetchSupabaseUnidades();
    if (result.unidades.length > 0) {
      const officialUnits = result.unidades as UnidadeApp[];
      setUnidades(officialUnits);
      saveLocalUnidades(officialUnits);
      preserveSelection(officialUnits);
      setMessage(`${result.unidades.length} unidades carregadas do Supabase.`);
    } else {
      setMessage(`Usando base local de unidades (${result.error || 'offline'}).`);
    }
  };

  // Restaurar rascunho ao carregar
  useEffect(() => {
    let cancelled = false;

    const restoreDraft = async () => {
      try {
        if (navigator.storage?.persist) void navigator.storage.persist();
        const draft = await loadVisitDraft(draftKey);
        if (cancelled) return;

        if (draft.meta) {
          setDraftClientId(draft.meta.clientId || makeDraftClientId());
          if (draft.meta.unidadeKey) setUnidadeKey(draft.meta.unidadeKey);
          if (draft.meta.visitDate) setVisitDate(draft.meta.visitDate);
          if (draft.meta.tipo) setTipo(draft.meta.tipo);
          if (draft.meta.representante) setRepresentante(draft.meta.representante);
          if (draft.meta.servicos) setServicos(draft.meta.servicos);
          if (draft.meta.observacoes) setObservacoes(draft.meta.observacoes);
          if (draft.meta.conclusao) setConclusao(draft.meta.conclusao);
        }

        if (draft.photos.length > 0) {
          const restoredPhotos: PhotoItem[] = draft.photos.map((photo) => ({
            id: photo.id,
            file: new File([], photo.name || 'foto.jpg', { type: photo.type || 'image/jpeg', lastModified: photo.lastModified || Date.now() }),
            previewUrl: photo.dataUrl,
            dataUrl: photo.dataUrl,
            caption: photo.caption || '',
            isProcessing: false
          }));
          setPhotos(restoredPhotos);
        }

        draftReadyRef.current = true;
        if (draft.meta || draft.photos.length > 0) {
          setDraftStatus(`💾 Rascunho anterior recuperado (${draft.photos.length} fotos salvas). Tudo protegido.`);
        } else {
          setDraftStatus('💾 Salvamento automático ativo em segundo plano neste aparelho.');
        }
      } catch (error) {
        draftReadyRef.current = true;
        setDraftStatus(`💾 Rascunho ativo. ${error instanceof Error ? error.message : ''}`);
      }
    };

    void restoreDraft();
    return () => { cancelled = true; };
  }, [draftKey]);

  useEffect(() => {
    loadUnidades();
    const handler = () => loadUnidades();
    window.addEventListener('ginfotos-unidades-updated', handler);
    return () => window.removeEventListener('ginfotos-unidades-updated', handler);
  }, []);

  // Salvamento contínuo com debounce de 350ms em qualquer alteração de campo
  useEffect(() => {
    if (!draftReadyRef.current || suspendDraftRef.current) return;

    const timer = window.setTimeout(() => {
      saveVisitDraftMeta({
        key: draftKey,
        clientId: draftClientId,
        unidadeKey,
        visitDate,
        tipo,
        representante,
        servicos,
        observacoes,
        conclusao,
        updatedAt: new Date().toISOString()
      })
        .then(() => {
          const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          setDraftStatus(`💾 Rascunho salvo automaticamente às ${hora} (${photos.length} foto(s) protegidas).`);
        })
        .catch(() => {});
    }, 350);

    return () => window.clearTimeout(timer);
  }, [draftKey, draftClientId, unidadeKey, visitDate, tipo, representante, servicos, observacoes, conclusao, photos.length]);

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
    () => findUnitByStableKey(unidades, unidadeKey) || findUnitByStableKey(filteredUnidades, unidadeKey) || filteredUnidades[0] || unidades[0],
    [unidadeKey, unidades, filteredUnidades]
  );

  // Inclusão instantânea de fotos
  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const selectedFiles = Array.from(files);

    setMessage(`Processando ${selectedFiles.length} foto(s)... Elas já estão sendo salvas no rascunho.`);

    for (let index = 0; index < selectedFiles.length; index += 1) {
      const file = selectedFiles[index];
      const tempId = `photo-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
      const previewUrl = URL.createObjectURL(file);

      // Adiciona imediatamente ao estado da tela com preview instantâneo
      const preliminaryPhoto: PhotoItem = {
        id: tempId,
        file,
        previewUrl,
        dataUrl: '',
        caption: '',
        isProcessing: true
      };
      setPhotos((prev) => [...prev, preliminaryPhoto]);

      try {
        const compressedDataUrl = await fileToCompressedImageDataUrl(file);
        // Atualiza a foto com os dados comprimidos
        setPhotos((prev) => prev.map((p) => p.id === tempId ? { ...p, dataUrl: compressedDataUrl, isProcessing: false } : p));

        // Grava no IndexedDB imediatamente
        await saveVisitDraftPhoto({
          id: tempId,
          draftKey,
          name: file.name,
          type: file.type || 'image/jpeg',
          lastModified: file.lastModified || Date.now(),
          dataUrl: compressedDataUrl,
          caption: ''
        });
      } catch (err) {
        console.error('Erro ao comprimir e salvar foto no rascunho:', err);
      }
    }

    setMessage(`${selectedFiles.length} foto(s) protegida(s) no rascunho.`);
  };

  const handleCaptureChange = (event: ChangeEvent<HTMLInputElement>) => {
    void addFiles(event.target.files);
    event.target.value = '';
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    void addFiles(event.target.files);
    event.target.value = '';
  };

  const updateCaption = (id: string, caption: string) => {
    setPhotos((current) =>
      current.map((photo: PhotoItem) => {
        if (photo.id !== id) return photo;
        const updated = { ...photo, caption };
        void saveVisitDraftPhoto({
          id: updated.id,
          draftKey,
          name: updated.file.name,
          type: updated.file.type || 'image/jpeg',
          lastModified: updated.file.lastModified || Date.now(),
          dataUrl: updated.dataUrl,
          caption: updated.caption
        });
        return updated;
      })
    );
  };

  const removePhoto = (id: string) => {
    setPhotos((current) => {
      const photo = current.find((item: PhotoItem) => item.id === id);
      if (photo?.previewUrl.startsWith('blob:')) URL.revokeObjectURL(photo.previewUrl);
      void deleteVisitDraftPhoto(id);
      return current.filter((item: PhotoItem) => item.id !== id);
    });
  };

  const handleDiscardDraft = async () => {
    if (!window.confirm('Tem certeza de que deseja descartar este rascunho e apagar as fotos não enviadas deste aparelho?')) {
      return;
    }
    suspendDraftRef.current = true;
    await clearVisitDraft(draftKey);
    photos.forEach((photo) => {
      if (photo.previewUrl.startsWith('blob:')) URL.revokeObjectURL(photo.previewUrl);
    });
    setPhotos([]);
    setServicos('');
    setObservacoes('');
    setConclusao('');
    setVisitDate(todayDate());
    setTipo(visitTypes[0]);
    setDraftClientId(makeDraftClientId());
    setDraftStatus('💾 Novo rascunho em branco pronto.');
    setMessage('Rascunho descartado com sucesso.');
    window.setTimeout(() => { suspendDraftRef.current = false; }, 500);
  };

  // Controle de gravação de voz com botão Ligar / Desligar
  const toggleVoice = (fieldId: string, getCurrent: () => string, onAppend: (cleanedText: string) => void) => {
    if (recordingField === fieldId) {
      voiceStopperRef.current?.stop();
      stopVoiceInput();
      setRecordingField(null);
      setVoiceInterim('');
      setVoiceStatus('Gravação finalizada.');
      return;
    }

    // Se já estava gravando outro campo, para o anterior
    if (recordingField) {
      voiceStopperRef.current?.stop();
      stopVoiceInput();
    }

    setRecordingField(fieldId);
    setVoiceInterim('');
    setVoiceStatus('Ouvindo... Fale com clareza.');

    const stopper = startVoiceInput({
      onFinalText: (spokenText) => {
        const current = getCurrent();
        const updated = appendDictation(current, spokenText);
        onAppend(updated);
        setVoiceInterim('');
      },
      onInterimText: (interim) => {
        setVoiceInterim(interim);
      },
      onStatus: (msg) => {
        setVoiceStatus(msg);
      },
      onListeningChange: (isListening) => {
        if (!isListening) {
          setRecordingField(null);
          setVoiceInterim('');
        }
      }
    });

    voiceStopperRef.current = stopper;
  };

  // Botão de voz visual reutilizável
  const renderVoiceButton = (fieldId: string, getCurrent: () => string, onAppend: (val: string) => void, label = 'FALAR POR VOZ') => {
    const isRecording = recordingField === fieldId;
    return (
      <button
        type="button"
        className={`voice-button ${isRecording ? 'recording' : ''}`}
        onClick={() => toggleVoice(fieldId, getCurrent, onAppend)}
      >
        {isRecording ? '⏹️ PARAR GRAVAÇÃO' : `🎤 ${label}`}
      </button>
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedUnidade) { setMessage('Selecione uma unidade escolar.'); return; }

    setSaving(true);
    setSaveProgress({ current: 0, total: photos.length, text: 'Iniciando envio seguro...' });

    const notes = buildNotes({ tipo, representante, servicos, observacoes, conclusao, selectedUnidade });
    const localId = draftClientId;
    let savedInServer = false;
    let serverVisitId = '';
    let errorMessage = '';

    const compactPhotos = photos.map((p) => ({
      name: p.file.name,
      caption: p.caption || '',
      dataUrl: p.dataUrl
    }));

    try {
      // 1. Criar a visita no servidor
      setSaveProgress({ current: 0, total: photos.length, text: 'Registrando dados da visita no servidor...' });
      const createRes = await apiFetch('/api/visitas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visit: {
            client_id: localId,
            visitor_name: representante,
            unidade_id: selectedUnidade.id,
            visit_date: visitDate,
            notes,
            created_by: profile?.id || profile?.email || 'app'
          }
        })
      });

      const createData = await apiReadJson<{ visit?: { id: string }; error?: string }>(createRes);
      if (!createRes.ok || !createData.visit?.id) {
        throw new Error(createData.error || 'Falha ao registrar visita no servidor.');
      }
      serverVisitId = createData.visit.id;

      // 2. Enviar fotos uma a uma com barra de progresso
      for (let i = 0; i < compactPhotos.length; i++) {
        const photo = compactPhotos[i];
        setSaveProgress({
          current: i + 1,
          total: compactPhotos.length,
          text: `Enviando foto ${i + 1} de ${compactPhotos.length} (${photo.name})...`
        });

        if (photo.dataUrl) {
          const photoRes = await apiFetch(`/api/visitas?action=add-photo&id=${encodeURIComponent(serverVisitId)}&ts=${Date.now()}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ photo })
          });
          if (!photoRes.ok) {
            console.warn(`Aviso: Foto ${i + 1} não sincronizou de imediato com o Storage.`);
          }
        }
      }

      savedInServer = true;
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Erro de conexão com o servidor.';
      console.warn('Erro na sincronização online, mantendo no rascunho persistente:', err);
    }

    if (savedInServer) {
      // Sucesso total no servidor
      suspendDraftRef.current = true;
      await clearVisitDraft(draftKey);

      photos.forEach((photo) => {
        if (photo.previewUrl.startsWith('blob:')) URL.revokeObjectURL(photo.previewUrl);
      });
      setPhotos([]);
      setServicos('');
      setObservacoes('');
      setConclusao('');
      setVisitDate(todayDate());
      setTipo(visitTypes[0]);
      setDraftClientId(makeDraftClientId());
      setDraftStatus('✅ Visita sincronizada com sucesso para todos os usuários!');
      setMessage(`✅ Visita de ${selectedUnidade.designacao || ''} - ${selectedUnidade.name} salva e sincronizada para toda a equipe.`);
      window.setTimeout(() => { suspendDraftRef.current = false; }, 1000);
    } else {
      // Falha online: Salva no IndexedDB de visitas pendentes SEM perda de fotos!
      await savePersistentPendingVisit({
        id: localId,
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

      setDraftStatus(`🛟 TODAS AS ${compactPhotos.length} FOTOS E DADOS ESTÃO PROTEGIDOS NESTE APARELHO.`);
      setMessage(`⚠️ Servidor offline (${errorMessage}). A visita e TODAS as fotos foram guardadas com segurança no seu celular e serão enviadas automaticamente assim que a conexão retornar.`);
    }

    setSaving(false);
    setSaveProgress(null);
    window.dispatchEvent(new Event('ginfotos-visitas-updated'));
  };

  return (
    <div className="dashboard-page">
      <div className="page-card">
        <p className="page-label">Nova Visita</p>
        <h1 className="page-title">Nova Visita Técnica</h1>
        <p className="page-description">Registre a vistoria, relate os serviços por voz ou escrita e tire fotos da unidade.</p>

        {/* Banner de Rascunho com Botão de Descarte */}
        <div className="notice" style={{ marginTop: 14, border: '2px solid #16a34a', background: '#f0fdf4', color: '#14532d', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <strong>🛟 SALVAMENTO AUTOMÁTICO SEGURO</strong><br />
            <span>{draftStatus}</span>
          </div>
          {(photos.length > 0 || servicos || observacoes) && (
            <button type="button" className="danger-link" onClick={handleDiscardDraft} style={{ border: '1px solid #ef4444', borderRadius: 8, padding: '6px 12px', background: '#fff' }}>
              🗑️ Descartar rascunho
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 18, marginTop: 22 }}>
          {/* Unidade */}
          <div className="field">
            <label htmlFor="busca-unidade">Buscar unidade escolar</label>
            <input id="busca-unidade" value={unidadeQuery} onChange={(e) => setUnidadeQuery(e.target.value)} placeholder="Digite o nome, designação ou bairro" />
          </div>

          <div className="field">
            <label htmlFor="unidade">Unidade Escolar</label>
            <select id="unidade" value={unidadeKey} onChange={(e) => { setUnidadeKey(e.target.value); setUnidadeQuery(''); }}>
              {filteredUnidades.map((item: UnidadeApp) => (
                <option key={unidadeStableKey(item)} value={unidadeStableKey(item)}>
                  {item.designacao ? `${item.designacao} - ${item.name}` : item.name}
                </option>
              ))}
            </select>
          </div>

          {selectedUnidade && (
            <div className="page-card" style={{ boxShadow: 'none', padding: 18, background: '#f8fafc' }}>
              <strong>UNIDADE SELECIONADA: {selectedUnidade.designacao || 'Designação não informada'} - {selectedUnidade.name}</strong>
              <p className="page-description">Endereço: {selectedUnidade.address || 'Não informado'} | Bairro: {selectedUnidade.bairro || 'Não informado'}</p>
              <p className="page-description">Diretor(a): {selectedUnidade.diretor_geral || 'Não informado'} {selectedUnidade.celular_diretor_geral ? `- ${selectedUnidade.celular_diretor_geral}` : ''}</p>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <div className="field">
              <label htmlFor="visitDate">Data da visita</label>
              <input id="visitDate" type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="tipo">Tipo de visita/obra</label>
              <select id="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {visitTypes.map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor="representante">Representante E/6 CRE/GIN</label>
            <input id="representante" value={representante} onChange={(e) => setRepresentante(e.target.value)} required />
          </div>

          {/* Feedback de voz */}
          {voiceStatus && (
            <p className="notice" style={{ background: recordingField ? '#fee2e2' : '#f0fdf4', color: recordingField ? '#991b1b' : '#166534' }}>
              {voiceStatus} {voiceInterim && <em>"{voiceInterim}"</em>}
            </p>
          )}

          {/* Serviços */}
          <div className="field">
            <label htmlFor="servicos">Serviços Verificados</label>
            {renderVoiceButton('servicos', () => servicos, (val) => setServicos(val), 'FALAR SERVIÇOS')}
            <textarea id="servicos" value={servicos} onChange={(e) => setServicos(e.target.value)} rows={4} placeholder="Descreva problemas, serviços e necessidades." />
          </div>

          {/* Observações */}
          <div className="field">
            <label htmlFor="observacoes">Observações</label>
            {renderVoiceButton('observacoes', () => observacoes, (val) => setObservacoes(val), 'FALAR OBSERVAÇÕES')}
            <textarea id="observacoes" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3} placeholder="Anotações adicionais da vistoria." />
          </div>

          {/* Conclusão */}
          <div className="field">
            <label htmlFor="conclusao">Conclusão</label>
            {renderVoiceButton('conclusao', () => conclusao, (val) => setConclusao(val), 'FALAR CONCLUSÃO')}
            <textarea id="conclusao" value={conclusao} onChange={(e) => setConclusao(e.target.value)} rows={3} placeholder="Parecer conclusivo da equipe." />
          </div>

          {/* Seção de Fotos */}
          <div className="page-card" style={{ boxShadow: 'none', padding: 18 }}>
            <h2 style={{ marginTop: 0 }}>Fotos da visita</h2>
            <p className="page-description"><strong>Sem limite de fotos.</strong> Cada foto é salva instantaneamente no aparelho e nunca será perdida.</p>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
              <button className="primary" type="button" onClick={() => captureInputRef.current?.click()}>
                📸 TIRAR FOTO AGORA
              </button>
              <button className="primary" type="button" onClick={() => fileInputRef.current?.click()}>
                📁 ANEXAR FOTOS DA GALERIA
              </button>
              <span className="status-pill">{photos.length} foto(s) anexada(s)</span>
            </div>

            <input ref={captureInputRef} type="file" accept="image/*" capture="environment" hidden onChange={handleCaptureChange} />
            <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={handleFileChange} />

            {photos.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginTop: 18 }}>
                {photos.map((photo) => (
                  <div key={photo.id} className="page-card" style={{ boxShadow: 'none', padding: 12, border: '1px solid #e2e8f0' }}>
                    <div style={{ position: 'relative' }}>
                      <img src={photo.previewUrl} alt="Foto da visita" style={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 12 }} />
                      {photo.isProcessing && (
                        <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '4px 8px', borderRadius: 6, fontSize: 12 }}>
                          Processando...
                        </div>
                      )}
                    </div>

                    <label style={{ marginTop: 10, display: 'block' }} htmlFor={`caption-${photo.id}`}>
                      Legenda da foto
                    </label>
                    {renderVoiceButton(`photo-${photo.id}`, () => photo.caption, (val) => updateCaption(photo.id, val), 'FALAR LEGENDA')}
                    <textarea
                      id={`caption-${photo.id}`}
                      value={photo.caption}
                      onChange={(e) => updateCaption(photo.id, e.target.value)}
                      rows={2}
                      placeholder="Descreva esta foto ou use o microfone acima."
                    />

                    <button type="button" className="empty-button" style={{ marginTop: 10, background: '#ef4444', color: '#fff', width: '100%' }} onClick={() => removePhoto(photo.id)}>
                      Excluir foto
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Barra de Progresso no Envio */}
          {saveProgress && (
            <div style={{ margin: '14px 0', padding: 14, background: '#f8fafc', borderRadius: 12, border: '1px solid #cbd5e1' }}>
              <strong>{saveProgress.text}</strong>
              <div className="upload-progress-container">
                <div
                  className="upload-progress-fill"
                  style={{
                    width: `${saveProgress.total > 0 ? Math.round((saveProgress.current / saveProgress.total) * 100) : 100}%`
                  }}
                />
              </div>
              <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
                Progresso: {saveProgress.current} de {saveProgress.total} fotos processadas.
              </p>
            </div>
          )}

          <button className="primary large" type="submit" disabled={saving}>
            {saving ? 'SINCRONIZANDO VISITA E FOTOS...' : 'SALVAR VISITA'}
          </button>
        </form>

        {message && <p className="notice" style={{ marginTop: 16 }}>{message}</p>}
      </div>
    </div>
  );
}
