import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { UserProfile } from '../App';

interface UnidadeOption {
  id: string;
  name: string;
  address?: string | null;
  designacao?: string | null;
  bairro?: string | null;
}

interface NovaVisitaProps {
  profile: UserProfile | null;
}

interface PhotoItem {
  id: string;
  file: File;
  previewUrl: string;
  caption: string;
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
  fotos: { name: string; caption: string }[];
  created_by?: string;
  created_at: string;
}

const fallbackUnidades: UnidadeOption[] = [
  {
    id: '06-22-204',
    designacao: '06.22.204',
    name: 'GET JOÃO DO RIO',
    address: '',
    bairro: ''
  },
  {
    id: '06-22-001',
    designacao: '06.22.001',
    name: 'EM GUILHERME TELL',
    address: '',
    bairro: ''
  },
  {
    id: '06-25-000',
    designacao: '06.25.000',
    name: 'EM ALZIRO ZARUR',
    address: '',
    bairro: ''
  }
];

const visitTypes = ['VISTORIA TÉCNICA', 'INAUGURAÇÃO DE GET', 'VISTORIA GET', 'OBRA', 'OUTROS'];
const LOCAL_VISITS_KEY = 'ginfotos_visitas_local';

function saveLocalVisit(record: LocalVisitRecord) {
  const existing = JSON.parse(localStorage.getItem(LOCAL_VISITS_KEY) || '[]') as LocalVisitRecord[];
  const filtered = existing.filter((item) => item.id !== record.id);
  localStorage.setItem(LOCAL_VISITS_KEY, JSON.stringify([record, ...filtered]));
}

export default function NovaVisita({ profile }: NovaVisitaProps) {
  const [unidades, setUnidades] = useState<UnidadeOption[]>(fallbackUnidades);
  const [unidadeId, setUnidadeId] = useState(fallbackUnidades[0].id);
  const [visitDate, setVisitDate] = useState(new Date().toISOString().slice(0, 10));
  const [tipo, setTipo] = useState(visitTypes[0]);
  const [representante, setRepresentante] = useState('ENGª. MÁRCIA BRAGA');
  const [servicos, setServicos] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [conclusao, setConclusao] = useState('');
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const captureInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    async function loadUnidades() {
      const { data, error } = await supabase
        .from('unidades')
        .select('id, name, address, designacao, bairro')
        .order('name');

      if (!error && data && data.length > 0) {
        const loaded = data as UnidadeOption[];
        setUnidades(loaded);
        setUnidadeId(loaded[0].id);
      }
    }

    loadUnidades();
  }, []);

  const selectedUnidade = useMemo(
    () => unidades.find((item) => item.id === unidadeId) || unidades[0],
    [unidadeId, unidades]
  );

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newPhotos = Array.from(files).map((file) => ({
      id: `${Date.now()}-${file.name}-${Math.random()}`,
      file,
      previewUrl: URL.createObjectURL(file),
      caption: ''
    }));
    setPhotos((current) => [...current, ...newPhotos]);
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
      `Representante E/6ª CRE/GIN: ${representante}`,
      `Serviços verificados: ${servicos || 'Não informado'}`,
      `Observações: ${observacoes || 'Não informado'}`,
      `Conclusão: ${conclusao || 'Não informado'}`
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
      visit_date: visitDate,
      tipo,
      representante,
      servicos,
      observacoes,
      conclusao,
      photo_count: photos.length,
      fotos: photos.map((photo) => ({ name: photo.file.name, caption: photo.caption })),
      created_by: profile?.email,
      created_at: new Date().toISOString()
    });

    setMessage(
      savedInSupabase
        ? 'Visita salva com sucesso. As fotos foram vinculadas à visita.'
        : 'Visita salva no dispositivo. O Supabase não respondeu, mas os dados principais não foram perdidos.'
    );
    setSaving(false);
  };

  return (
    <div className="dashboard-page">
      <div className="page-card">
        <p className="page-label">Nova Visita</p>
        <h1 className="page-title">Nova Visita Técnica</h1>
        <p className="page-description">
          Registre a vistoria, selecione a unidade escolar, descreva os serviços verificados e anexe fotos da visita.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 18, marginTop: 22 }}>
          <div className="field">
            <label htmlFor="unidade">Unidade Escolar</label>
            <select id="unidade" value={unidadeId} onChange={(event) => setUnidadeId(event.target.value)}>
              {unidades.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.designacao ? `${item.designacao} - ${item.name}` : item.name}
                </option>
              ))}
            </select>
          </div>

          {selectedUnidade && (
            <div className="page-card" style={{ boxShadow: 'none', padding: 18, background: '#f8fafc' }}>
              <strong>{selectedUnidade.designacao || 'Designação não informada'} - {selectedUnidade.name}</strong>
              <p className="page-description">Endereço: {selectedUnidade.address || 'Não informado'}</p>
              <p className="page-description">Bairro: {selectedUnidade.bairro || 'Não informado'}</p>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <div className="field">
              <label htmlFor="visitDate">Data da visita</label>
              <input id="visitDate" type="date" value={visitDate} onChange={(event) => setVisitDate(event.target.value)} required />
            </div>

            <div className="field">
              <label htmlFor="tipo">Tipo de visita/obra</label>
              <select id="tipo" value={tipo} onChange={(event) => setTipo(event.target.value)}>
                {visitTypes.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor="representante">Representante E/6ª CRE/GIN</label>
            <input id="representante" value={representante} onChange={(event) => setRepresentante(event.target.value)} required />
          </div>

          <div className="field">
            <label htmlFor="servicos">Serviços Verificados</label>
            <textarea id="servicos" value={servicos} onChange={(event) => setServicos(event.target.value)} rows={4} placeholder="Descreva os problemas, serviços e necessidades verificadas." />
          </div>

          <div className="field">
            <label htmlFor="observacoes">Observações</label>
            <textarea id="observacoes" value={observacoes} onChange={(event) => setObservacoes(event.target.value)} rows={3} />
          </div>

          <div className="field">
            <label htmlFor="conclusao">Conclusão</label>
            <textarea id="conclusao" value={conclusao} onChange={(event) => setConclusao(event.target.value)} rows={3} />
          </div>

          <div className="page-card" style={{ boxShadow: 'none', padding: 18 }}>
            <h2 style={{ marginTop: 0 }}>Fotos da visita</h2>
            <p className="page-description">Tire fotos na hora pelo celular ou anexe imagens da galeria/computador. Cada foto pode receber legenda.</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
              <button className="primary" type="button" onClick={() => captureInputRef.current?.click()}>
                TIRAR FOTO AGORA
              </button>
              <button className="primary" type="button" onClick={() => fileInputRef.current?.click()}>
                ANEXAR FOTOS
              </button>
            </div>
            <input ref={captureInputRef} type="file" accept="image/*" capture="environment" hidden onChange={handleCaptureChange} />
            <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={handleFileChange} />

            {photos.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginTop: 18 }}>
                {photos.map((photo) => (
                  <div key={photo.id} className="page-card" style={{ boxShadow: 'none', padding: 12 }}>
                    <img src={photo.previewUrl} alt="Foto da visita" style={{ width: '100%', height: 170, objectFit: 'cover', borderRadius: 12 }} />
                    <label style={{ marginTop: 10 }} htmlFor={`caption-${photo.id}`}>Legenda</label>
                    <textarea id={`caption-${photo.id}`} value={photo.caption} onChange={(event) => updateCaption(photo.id, event.target.value)} rows={2} placeholder="Digite a legenda da foto." />
                    <button type="button" className="empty-button" style={{ marginTop: 10, background: '#ef4444' }} onClick={() => removePhoto(photo.id)}>
                      Excluir foto
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button className="primary large" type="submit" disabled={saving}>
            {saving ? 'SALVANDO...' : 'SALVAR VISITA'}
          </button>
        </form>

        {message && <p className="notice">{message}</p>}
      </div>
    </div>
  );
}
