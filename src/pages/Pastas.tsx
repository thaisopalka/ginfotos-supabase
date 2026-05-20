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
  dataUrl: string;
  createdAt: string;
}

interface ExtraFolder {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}

const LOCAL_UNIDADES_KEY = 'ginfotos_unidades_local';
const LOCAL_FOLDER_FILES_KEY = 'ginfotos_folder_files_local';
const LOCAL_EXTRA_FOLDERS_KEY = 'ginfotos_extra_folders_local';

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

export default function Pastas() {
  const [unidades, setUnidades] = useState<UnidadeFolder[]>(fallbackUnidades);
  const [extraFolders, setExtraFolders] = useState<ExtraFolder[]>([]);
  const [files, setFiles] = useState<FolderFile[]>([]);
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderDescription, setNewFolderDescription] = useState('');
  const navigate = useNavigate();

  const loadData = async () => {
    const localUnits = loadLocalArray<UnidadeFolder>(LOCAL_UNIDADES_KEY).map((item) => ({ ...item, origem: item.origem || 'Local' }));
    setExtraFolders(loadLocalArray<ExtraFolder>(LOCAL_EXTRA_FOLDERS_KEY));
    setFiles(loadLocalArray<FolderFile>(LOCAL_FOLDER_FILES_KEY));
    setUnidades(mergeUnidades(localUnits, fallbackUnidades));
    try {
      const result = await supabase.from('unidades').select('id, name, address, designacao, bairro, telefone, diretor_geral').order('name');
      if (!result.error && result.data && result.data.length > 0) {
        setUnidades(mergeUnidades(localUnits, (result.data as UnidadeFolder[]).map((item) => ({ ...item, origem: 'Supabase' })), fallbackUnidades));
      }
      setMessage('Pastas atualizadas.');
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

  const createFolder = (event: FormEvent) => {
    event.preventDefault();
    if (!newFolderName.trim()) {
      setMessage('Digite um nome para criar a pasta.');
      return;
    }
    const folder: ExtraFolder = { id: `folder-${Date.now()}`, name: newFolderName.trim(), description: newFolderDescription.trim(), createdAt: new Date().toISOString() };
    const updated = [folder, ...extraFolders];
    setExtraFolders(updated);
    saveLocalArray(LOCAL_EXTRA_FOLDERS_KEY, updated);
    setNewFolderName('');
    setNewFolderDescription('');
    setSelectedKey(folder.id);
    setMessage('Nova pasta criada.');
    notifyGinfotos('GINFOTOS - Pasta criada', `Nova pasta: ${folder.name}`);
  };

  const renameSelectedFolder = () => {
    if (!selectedFolder || selectedFolder.type !== 'custom') {
      setMessage('A edição do nome é liberada para pastas criadas manualmente. Unidades escolares devem ser editadas na aba Unidades Escolares.');
      return;
    }
    const name = window.prompt('Novo nome da pasta:', selectedFolder.title);
    if (!name?.trim()) return;
    const updated = extraFolders.map((folder) => folder.id === selectedFolder.key ? { ...folder, name: name.trim() } : folder);
    setExtraFolders(updated);
    saveLocalArray(LOCAL_EXTRA_FOLDERS_KEY, updated);
    setMessage('Pasta atualizada.');
  };

  const removeSelectedFolder = () => {
    if (!selectedFolder || selectedFolder.type !== 'custom') {
      setMessage('Somente pastas criadas manualmente podem ser removidas aqui.');
      return;
    }
    if (!window.confirm(`Remover a pasta ${selectedFolder.title}? Os arquivos salvos nela também serão removidos deste dispositivo.`)) return;
    const updatedFolders = extraFolders.filter((folder) => folder.id !== selectedFolder.key);
    const updatedFiles = files.filter((file) => file.folderKey !== selectedFolder.key);
    setExtraFolders(updatedFolders);
    setFiles(updatedFiles);
    saveLocalArray(LOCAL_EXTRA_FOLDERS_KEY, updatedFolders);
    saveLocalArray(LOCAL_FOLDER_FILES_KEY, updatedFiles);
    setSelectedKey(null);
    setMessage('Pasta removida.');
  };

  const uploadFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!selectedFolder || !selectedKey) {
      setMessage('Abra uma pasta antes de anexar arquivos.');
      return;
    }
    const selected = Array.from(event.target.files || []);
    if (selected.length === 0) return;
    setMessage('Salvando arquivo(s) no dispositivo...');
    try {
      const newFiles: FolderFile[] = [];
      for (const file of selected) {
        const dataUrl = await readFileAsDataUrl(file);
        newFiles.push({ id: `file-${Date.now()}-${Math.random()}`, folderKey: selectedKey, name: file.name, type: file.type || 'Arquivo', size: file.size, dataUrl, createdAt: new Date().toISOString() });
      }
      const updated = [...newFiles, ...files];
      setFiles(updated);
      saveLocalArray(LOCAL_FOLDER_FILES_KEY, updated);
      setMessage(`${newFiles.length} arquivo(s) anexado(s) à pasta.`);
      notifyGinfotos('GINFOTOS - Arquivo anexado', `${newFiles.length} arquivo(s) em ${selectedFolder.title}`);
    } catch {
      setMessage('Não foi possível salvar todos os arquivos. Arquivos muito grandes podem ultrapassar o limite do navegador.');
    } finally {
      event.target.value = '';
    }
  };

  const removeFile = (fileId: string) => {
    const updated = files.filter((file) => file.id !== fileId);
    setFiles(updated);
    saveLocalArray(LOCAL_FOLDER_FILES_KEY, updated);
    setMessage('Arquivo removido da pasta.');
  };

  return (
    <div className="dashboard-page">
      <div className="top-row"><div><p className="page-label">Arquivo por unidade</p><h1>Pastas</h1></div><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><button type="button" className="empty-button" onClick={loadData}>Atualizar</button><button type="button" className="empty-button" onClick={() => navigate('/nova-visita')}>+ Nova Visita</button></div></div>
      <section className="page-card">
        <p className="page-description">Gerencie pastas por unidade escolar e crie novas pastas para guardar OS, documentos, fotos, vídeos e anexos.</p>
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
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}><label className="empty-button" style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>Anexar arquivos<input type="file" multiple onChange={uploadFiles} style={{ display: 'none' }} /></label><button type="button" className="empty-button" onClick={renameSelectedFolder}>Editar pasta</button><button type="button" className="empty-button danger-link" onClick={removeSelectedFolder}>Remover pasta</button></div>
          {selectedFiles.length === 0 ? <div className="empty-state"><p>Nenhum arquivo anexado nesta pasta ainda.</p></div> : <div className="file-grid">{selectedFiles.map((file) => <article key={file.id} className="file-card"><strong>{file.name}</strong><p className="page-description">{file.type || 'Arquivo'} • {formatFileSize(file.size)}</p><p className="page-description">{new Date(file.createdAt).toLocaleString('pt-BR')}</p><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><a className="empty-link" href={file.dataUrl} download={file.name}>Baixar</a><button type="button" className="empty-link danger-link" onClick={() => removeFile(file.id)}>Remover</button></div></article>)}</div>}
        </section>
      )}
    </div>
  );
}
