import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { notifyGinfotos } from '../lib/notifications';

interface UnidadeFolder {
  id: string;
  name: string;
  address?: string | null;
  designacao?: string | null;
  bairro?: string | null;
  telefone?: string | null;
  diretor_geral?: string | null;
  origem?: string;
}

interface FolderFile {
  id: string;
  folderKey: string;
  name: string;
  type: string;
  size: number;
  dataUrl?: string;
  publicUrl?: string;
  storagePath?: string;
  createdAt: string;
  source?: 'local' | 'supabase';
}

interface RemoteFolderFile {
  id: string;
  folder_key: string;
  file_name: string;
  file_type?: string | null;
  file_size?: number | null;
  storage_path: string;
  public_url?: string | null;
  created_at: string;
}

interface ExtraFolder {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  source?: 'local' | 'supabase';
}

interface RemoteExtraFolder {
  id: string;
  name: string;
  description?: string | null;
  created_at: string;
}

const LOCAL_UNIDADES_KEY = 'ginfotos_unidades_local';
const LOCAL_FOLDER_FILES_KEY = 'ginfotos_folder_files_local';
const LOCAL_EXTRA_FOLDERS_KEY = 'ginfotos_extra_folders_local';
const STORAGE_BUCKET = 'ginfotos-arquivos';

const fallbackUnidades: UnidadeFolder[] = [
  { id: '06-22-204', designacao: '06.22.204', name: 'GET JOAO DO RIO', address: '', bairro: '', origem: 'Base provisoria' },
  { id: '06-22-001', designacao: '06.22.001', name: 'EM GUILHERME TELL', address: '', bairro: '', origem: 'Base provisoria' },
  { id: '06-25-000', designacao: '06.25.000', name: 'EM ALZIRO ZARUR', address: '', bairro: '', origem: 'Base provisoria' }
];

function loadLocalArray<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) || '[]') as T[]; } catch { return []; }
}

function saveLocalArray<T>(key: string, value: T[]) {
  localStorage.setItem(key, JSON.stringify(value));
}

function normalizeUnidade(item: Partial<UnidadeFolder>): UnidadeFolder {
  return {
    id: item.id || `local-${item.designacao || item.name || Date.now()}`,
    name: item.name || 'Unidade sem nome',
    address: item.address || '',
    designacao: item.designacao || '',
    bairro: item.bairro || '',
    telefone: item.telefone || '',
    diretor_geral: item.diretor_geral || '',
    origem: item.origem || 'Local'
  };
}

function folderKey(folder: UnidadeFolder | ExtraFolder) {
  return 'designacao' in folder ? String(folder.designacao || folder.id || folder.name) : String(folder.id);
}

function mergeUnidades(...groups: UnidadeFolder[][]) {
  const map = new Map<string, UnidadeFolder>();
  groups.flat().forEach((item) => {
    const normalized = normalizeUnidade(item);
    const key = folderKey(normalized).toLowerCase();
    if (!map.has(key)) map.set(key, normalized);
  });
  return Array.from(map.values()).sort((a, b) => String(a.designacao || a.name).localeCompare(String(b.designacao || b.name)));
}

function mergeFiles(...groups: FolderFile[][]) {
  const map = new Map<string, FolderFile>();
  groups.flat().forEach((file) => {
    const key = file.id || `${file.folderKey}-${file.name}-${file.createdAt}`;
    if (!map.has(key)) map.set(key, file);
  });
  return Array.from(map.values()).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function mergeExtraFolders(...groups: ExtraFolder[][]) {
  const map = new Map<string, ExtraFolder>();
  groups.flat().forEach((folder) => {
    if (!map.has(folder.id)) map.set(folder.id, folder);
  });
  return Array.from(map.values()).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}

function safePath(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '') || 'arquivo';
}

function remoteFileToLocal(file: RemoteFolderFile): FolderFile {
  return {
    id: file.id,
    folderKey: file.folder_key,
    name: file.file_name,
    type: file.file_type || 'Arquivo',
    size: Number(file.file_size || 0),
    publicUrl: file.public_url || '',
    storagePath: file.storage_path,
    createdAt: file.created_at,
    source: 'supabase'
  };
}

function remoteFolderToLocal(folder: RemoteExtraFolder): ExtraFolder {
  return {
    id: folder.id,
    name: folder.name,
    description: folder.description || '',
    createdAt: folder.created_at,
    source: 'supabase'
  };
}

export default function Pastas() {
  const [unidades, setUnidades] = useState<UnidadeFolder[]>(fallbackUnidades);
  const [extraFolders, setExtraFolders] = useState<ExtraFolder[]>([]);
  const [files, setFiles] = useState<FolderFile[]>([]);
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderDescription, setNewFolderDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const navigate = useNavigate();

  const loadData = async () => {
    const localUnits = loadLocalArray<UnidadeFolder>(LOCAL_UNIDADES_KEY).map((item) => ({ ...item, origem: item.origem || 'Local' }));
    const localFolders = loadLocalArray<ExtraFolder>(LOCAL_EXTRA_FOLDERS_KEY).map((item) => ({ ...item, source: item.source || 'local' as const }));
    const localFiles = loadLocalArray<FolderFile>(LOCAL_FOLDER_FILES_KEY).map((item) => ({ ...item, source: item.source || 'local' as const }));

    setExtraFolders(localFolders);
    setFiles(localFiles);
    setUnidades(mergeUnidades(localUnits, fallbackUnidades));

    try {
      const [unitsResult, foldersResult, filesResult] = await Promise.all([
        supabase.from('unidades').select('id, name, address, designacao, bairro, telefone, diretor_geral').order('name'),
        supabase.from('ginfotos_extra_folders').select('id, name, description, created_at').order('created_at', { ascending: false }),
        supabase.from('ginfotos_folder_files').select('id, folder_key, file_name, file_type, file_size, storage_path, public_url, created_at').order('created_at', { ascending: false })
      ]);

      if (!unitsResult.error && unitsResult.data && unitsResult.data.length > 0) {
        setUnidades(mergeUnidades(localUnits, (unitsResult.data as UnidadeFolder[]).map((item) => ({ ...item, origem: 'Supabase' })), fallbackUnidades));
      }

      const remoteFolders = !foldersResult.error && foldersResult.data ? (foldersResult.data as RemoteExtraFolder[]).map(remoteFolderToLocal) : [];
      const remoteFiles = !filesResult.error && filesResult.data ? (filesResult.data as RemoteFolderFile[]).map(remoteFileToLocal) : [];
      setExtraFolders(mergeExtraFolders(remoteFolders, localFolders));
      setFiles(mergeFiles(remoteFiles, localFiles));

      if (foldersResult.error || filesResult.error) {
        setMessage('Pastas atualizadas localmente. Execute os SQLs do Supabase Storage para sincronizar arquivos entre todos os usuários.');
      } else {
        setMessage('Pastas e arquivos sincronizados com Supabase Storage.');
      }
    } catch {
      setMessage('Supabase não respondeu. Pastas locais continuam disponíveis.');
    }
  };

  useEffect(() => { loadData(); }, []);

  const allFolders = useMemo(() => {
    const unitFolders = unidades.map((unit) => ({ key: folderKey(unit), title: `${unit.designacao || 'Sem designação'} - ${unit.name}`, subtitle: unit.bairro || unit.address || 'Pasta da unidade', type: 'unit' as const, raw: unit }));
    const customFolders = extraFolders.map((folder) => ({ key: folderKey(folder), title: folder.name, subtitle: folder.description || 'Pasta criada manualmente', type: 'custom' as const, raw: folder }));
    const term = query.trim().toLowerCase();
    return [...unitFolders, ...customFolders].filter((folder) => !term || `${folder.title} ${folder.subtitle}`.toLowerCase().includes(term));
  }, [unidades, extraFolders, query]);

  const selectedFolder = allFolders.find((folder) => folder.key === selectedKey) || null;
  const selectedFiles = files.filter((file) => file.folderKey === selectedKey);

  const createFolder = async (event: FormEvent) => {
    event.preventDefault();
    if (!newFolderName.trim()) {
      setMessage('Digite um nome para criar a pasta.');
      return;
    }
    const folder: ExtraFolder = { id: `folder-${Date.now()}`, name: newFolderName.trim(), description: newFolderDescription.trim(), createdAt: new Date().toISOString(), source: 'local' };
    const updated = [folder, ...extraFolders];
    setExtraFolders(updated);
    saveLocalArray(LOCAL_EXTRA_FOLDERS_KEY, updated.filter((item) => item.source !== 'supabase'));
    setNewFolderName('');
    setNewFolderDescription('');
    setSelectedKey(folder.id);
    setMessage('Nova pasta criada. Sincronizando com Supabase.');
    notifyGinfotos('GINFOTOS - Pasta criada', `Nova pasta: ${folder.name}`);

    try {
      const { error } = await supabase.from('ginfotos_extra_folders').upsert({ id: folder.id, name: folder.name, description: folder.description, created_at: folder.createdAt });
      setMessage(error ? `Pasta salva localmente. Supabase não aceitou: ${error.message}` : 'Nova pasta criada e sincronizada para todos os usuários.');
    } catch {
      setMessage('Pasta salva localmente. Supabase não respondeu.');
    }
  };

  const renameSelectedFolder = async () => {
    if (!selectedFolder || selectedFolder.type !== 'custom') {
      setMessage('A edição do nome é liberada para pastas criadas manualmente. Unidades escolares devem ser editadas na aba Unidades Escolares.');
      return;
    }
    const name = window.prompt('Novo nome da pasta:', selectedFolder.title);
    if (!name?.trim()) return;
    const updated = extraFolders.map((folder) => folder.id === selectedFolder.key ? { ...folder, name: name.trim() } : folder);
    setExtraFolders(updated);
    saveLocalArray(LOCAL_EXTRA_FOLDERS_KEY, updated.filter((item) => item.source !== 'supabase'));
    setMessage('Pasta atualizada.');
    try {
      await supabase.from('ginfotos_extra_folders').update({ name: name.trim() }).eq('id', selectedFolder.key);
    } catch {
      setMessage('Pasta atualizada localmente. Supabase não respondeu.');
    }
  };

  const removeSelectedFolder = async () => {
    if (!selectedFolder || selectedFolder.type !== 'custom') {
      setMessage('Somente pastas criadas manualmente podem ser removidas aqui.');
      return;
    }
    if (!window.confirm(`Remover a pasta ${selectedFolder.title}? Os arquivos salvos nela também serão removidos.`)) return;
    const folderFiles = files.filter((file) => file.folderKey === selectedFolder.key);
    const updatedFolders = extraFolders.filter((folder) => folder.id !== selectedFolder.key);
    const updatedFiles = files.filter((file) => file.folderKey !== selectedFolder.key);
    setExtraFolders(updatedFolders);
    setFiles(updatedFiles);
    saveLocalArray(LOCAL_EXTRA_FOLDERS_KEY, updatedFolders.filter((item) => item.source !== 'supabase'));
    saveLocalArray(LOCAL_FOLDER_FILES_KEY, updatedFiles.filter((item) => item.source !== 'supabase'));
    setSelectedKey(null);
    setMessage('Pasta removida.');
    try {
      for (const file of folderFiles) {
        if (file.storagePath) await supabase.storage.from(STORAGE_BUCKET).remove([file.storagePath]);
      }
      await supabase.from('ginfotos_folder_files').delete().eq('folder_key', selectedFolder.key);
      await supabase.from('ginfotos_extra_folders').delete().eq('id', selectedFolder.key);
    } catch {
      setMessage('Pasta removida localmente. Supabase não respondeu completamente.');
    }
  };

  const uploadFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!selectedFolder || !selectedKey) {
      setMessage('Abra uma pasta antes de anexar arquivos.');
      return;
    }
    const selected = Array.from(event.target.files || []);
    if (selected.length === 0) return;
    setUploading(true);
    setMessage('Enviando arquivo(s) para Supabase Storage...');
    const newFiles: FolderFile[] = [];

    for (const file of selected) {
      const id = `file-${Date.now()}-${Math.random()}`;
      const storagePath = `${safePath(selectedKey)}/${Date.now()}-${safePath(file.name)}`;
      try {
        const upload = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, file, { upsert: true, contentType: file.type || undefined });
        if (upload.error) throw new Error(upload.error.message);
        const publicData = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
        const publicUrl = publicData.data?.publicUrl || '';
        const meta = await supabase.from('ginfotos_folder_files').insert({ folder_key: selectedKey, file_name: file.name, file_type: file.type || 'Arquivo', file_size: file.size, storage_path: storagePath, public_url: publicUrl }).select('id, folder_key, file_name, file_type, file_size, storage_path, public_url, created_at').single();
        if (meta.error) throw new Error(meta.error.message);
        newFiles.push(remoteFileToLocal(meta.data as RemoteFolderFile));
      } catch {
        const dataUrl = await readFileAsDataUrl(file);
        newFiles.push({ id, folderKey: selectedKey, name: file.name, type: file.type || 'Arquivo', size: file.size, dataUrl, createdAt: new Date().toISOString(), source: 'local' });
      }
    }

    const updated = mergeFiles(newFiles, files);
    setFiles(updated);
    saveLocalArray(LOCAL_FOLDER_FILES_KEY, updated.filter((item) => item.source !== 'supabase'));
    setUploading(false);
    event.target.value = '';
    setMessage(`${newFiles.length} arquivo(s) anexado(s). Arquivos com origem Supabase ficam disponíveis para todos os usuários.`);
    notifyGinfotos('GINFOTOS - Arquivo anexado', `${newFiles.length} arquivo(s) em ${selectedFolder.title}`);
  };

  const removeFile = async (file: FolderFile) => {
    const updated = files.filter((item) => item.id !== file.id);
    setFiles(updated);
    saveLocalArray(LOCAL_FOLDER_FILES_KEY, updated.filter((item) => item.source !== 'supabase'));
    setMessage('Arquivo removido da pasta.');
    try {
      if (file.storagePath) await supabase.storage.from(STORAGE_BUCKET).remove([file.storagePath]);
      if (file.source === 'supabase') await supabase.from('ginfotos_folder_files').delete().eq('id', file.id);
    } catch {
      setMessage('Arquivo removido localmente. Supabase não respondeu completamente.');
    }
  };

  return (
    <div className="dashboard-page">
      <div className="top-row"><div><p className="page-label">Arquivo por unidade</p><h1>Pastas</h1></div><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><button type="button" className="empty-button" onClick={loadData}>Atualizar / Sincronizar</button><button type="button" className="empty-button" onClick={() => navigate('/nova-visita')}>+ Nova Visita</button></div></div>
      <section className="page-card">
        <p className="page-description">Gerencie pastas por unidade escolar e crie novas pastas para guardar OS, documentos, fotos, vídeos e anexos. Quando o Supabase Storage estiver configurado, os arquivos ficam disponíveis para todos os usuários.</p>
        <div style={{ display: 'flex', gap: 12, margin: '18px 0', flexWrap: 'wrap' }}><input aria-label="Buscar pasta" placeholder="Buscar por designação, unidade, bairro ou pasta" value={query} onChange={(event) => setQuery(event.target.value)} style={{ flex: '1 1 260px' }} /><span className="status-pill">{allFolders.length} pasta(s)</span></div>
        {message && <p className="notice">{message}</p>}
        <form onSubmit={createFolder} style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(220px, 1fr) auto', gap: 12, alignItems: 'end' }}><div className="field"><label>Nova pasta</label><input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="Ex.: OS recebidas, Orçamentos, Fotos extras" /></div><div className="field"><label>Descrição</label><input value={newFolderDescription} onChange={(e) => setNewFolderDescription(e.target.value)} placeholder="Opcional" /></div><button type="submit" className="primary">Criar pasta</button></form>
      </section>

      <section className="stats-grid">
        {allFolders.map((folder) => (
          <button key={`${folder.type}-${folder.key}`} type="button" className="stat-card" onClick={() => setSelectedKey(folder.key)} style={{ textAlign: 'left', cursor: 'pointer' }}><div className="stat-icon" aria-hidden="true">{folder.type === 'unit' ? 'PA' : '📁'}</div><div><p className="stat-value" style={{ fontSize: '1.05rem' }}>{folder.title}</p><p className="page-description" style={{ margin: '6px 0 0' }}>{folder.subtitle}</p><p className="stat-label">{files.filter((file) => file.folderKey === folder.key).length} arquivo(s)</p></div></button>
        ))}
      </section>

      {selectedFolder && (
        <section className="page-card">
          <div className="recent-header"><div><p className="page-label">Pasta aberta</p><h2>{selectedFolder.title}</h2><p className="page-description">{selectedFolder.subtitle}</p></div><button type="button" className="empty-link" onClick={() => setSelectedKey(null)}>Fechar</button></div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}><label className="empty-button" style={{ display: 'inline-flex', alignItems: 'center', cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.6 : 1 }}>{uploading ? 'Enviando...' : 'Anexar arquivos'}<input type="file" multiple disabled={uploading} onChange={uploadFiles} style={{ display: 'none' }} /></label><button type="button" className="empty-button" onClick={renameSelectedFolder}>Editar pasta</button><button type="button" className="empty-button danger-link" onClick={removeSelectedFolder}>Remover pasta</button></div>
          {selectedFiles.length === 0 ? <div className="empty-state"><p>Nenhum arquivo anexado nesta pasta ainda.</p></div> : <div className="file-grid">{selectedFiles.map((file) => <article key={file.id} className="file-card"><strong>{file.name}</strong><p className="page-description">{file.type || 'Arquivo'} • {formatFileSize(file.size)} • {file.source === 'supabase' ? 'Supabase' : 'Dispositivo'}</p><p className="page-description">{new Date(file.createdAt).toLocaleString('pt-BR')}</p><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><a className="empty-link" href={file.publicUrl || file.dataUrl || '#'} target="_blank" rel="noreferrer" download={file.name}>Abrir/Baixar</a><button type="button" className="empty-link danger-link" onClick={() => removeFile(file)}>Remover</button></div></article>)}</div>}
        </section>
      )}
    </div>
  );
}
