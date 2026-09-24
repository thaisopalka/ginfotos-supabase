export interface VisitDraftMeta {
  key: string;
  clientId: string;
  unidadeKey: string;
  visitDate: string;
  tipo: string;
  representante: string;
  servicos: string;
  observacoes: string;
  conclusao: string;
  updatedAt: string;
}

export interface VisitDraftPhoto {
  id: string;
  draftKey: string;
  name: string;
  type: string;
  lastModified: number;
  dataUrl: string;
  caption: string;
}

export interface PersistentPendingVisit {
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
  fotos: { id?: string; name: string; caption: string; dataUrl?: string }[];
  created_by?: string;
  created_at: string;
}

const DB_NAME = 'ginfotos_offline_store';
const DB_VERSION = 2;
const META_STORE = 'draft_meta';
const PHOTO_STORE = 'draft_photos';
const PENDING_STORE = 'pending_visits';
const LAST_ACTIVE_DRAFT_KEY = 'ginfotos_last_active_draft_key';

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB não suportado neste navegador.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        const photoStore = db.createObjectStore(PHOTO_STORE, { keyPath: 'id' });
        photoStore.createIndex('draftKey', 'draftKey', { unique: false });
      }
      if (!db.objectStoreNames.contains(PENDING_STORE)) {
        db.createObjectStore(PENDING_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };

    request.onerror = () => {
      dbPromise = null;
      reject(request.error || new Error('Falha ao abrir banco local de fotos.'));
    };
  });

  return dbPromise;
}

function waitTx(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Transação cancelada.'));
    tx.onabort = () => reject(tx.error || new Error('Transação abortada pelo navegador.'));
  });
}

export function visitDraftKey(email?: string | null): string {
  const cleanEmail = String(email || '').trim().toLowerCase();
  return cleanEmail ? `visit:${cleanEmail}` : 'visit:ativo';
}

export function getLastActiveDraftKey(): string {
  try {
    return localStorage.getItem(LAST_ACTIVE_DRAFT_KEY) || 'visit:ativo';
  } catch {
    return 'visit:ativo';
  }
}

export function setLastActiveDraftKey(key: string): void {
  try {
    localStorage.setItem(LAST_ACTIVE_DRAFT_KEY, key);
  } catch {
    // ignore
  }
}

// -------------------------------------------------------------------------
// Rascunhos de Visitas
// -------------------------------------------------------------------------

export async function saveVisitDraftMeta(meta: VisitDraftMeta): Promise<void> {
  setLastActiveDraftKey(meta.key);
  try {
    const db = await getDb();
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).put(meta);
    await waitTx(tx);
  } catch (error) {
    console.warn('Erro ao salvar meta no IndexedDB, usando fallback:', error);
    try {
      localStorage.setItem(`ginfotos_meta_backup:${meta.key}`, JSON.stringify(meta));
    } catch {
      // ignore
    }
  }
}

export async function saveVisitDraftPhoto(photo: VisitDraftPhoto): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(PHOTO_STORE, 'readwrite');
  tx.objectStore(PHOTO_STORE).put(photo);
  await waitTx(tx);
}

export async function saveMultipleDraftPhotos(photos: VisitDraftPhoto[]): Promise<void> {
  if (photos.length === 0) return;
  const db = await getDb();
  const tx = db.transaction(PHOTO_STORE, 'readwrite');
  const store = tx.objectStore(PHOTO_STORE);
  for (const photo of photos) {
    store.put(photo);
  }
  await waitTx(tx);
}

export async function deleteVisitDraftPhoto(id: string): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction(PHOTO_STORE, 'readwrite');
    tx.objectStore(PHOTO_STORE).delete(id);
    await waitTx(tx);
  } catch (error) {
    console.warn('Erro ao deletar foto do rascunho:', error);
  }
}

async function getPhotosForDraft(db: IDBDatabase, draftKey: string): Promise<VisitDraftPhoto[]> {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(PHOTO_STORE, 'readonly');
      const index = tx.objectStore(PHOTO_STORE).index('draftKey');
      const request = index.getAll(IDBKeyRange.only(draftKey));
      request.onsuccess = () => resolve((request.result || []) as VisitDraftPhoto[]);
      request.onerror = () => reject(request.error);
    } catch (err) {
      reject(err);
    }
  });
}

export async function loadVisitDraft(key: string): Promise<{ meta: VisitDraftMeta | null; photos: VisitDraftPhoto[] }> {
  try {
    const db = await getDb();

    // 1. Carregar meta
    let meta = await new Promise<VisitDraftMeta | null>((resolve, reject) => {
      try {
        const tx = db.transaction(META_STORE, 'readonly');
        const req = tx.objectStore(META_STORE).get(key);
        req.onsuccess = () => resolve((req.result || null) as VisitDraftMeta | null);
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });

    // Se não encontrou pela chave de e-mail, tenta a chave ativa padrão
    if (!meta && key !== 'visit:ativo') {
      meta = await new Promise<VisitDraftMeta | null>((resolve) => {
        try {
          const tx = db.transaction(META_STORE, 'readonly');
          const req = tx.objectStore(META_STORE).get('visit:ativo');
          req.onsuccess = () => resolve((req.result || null) as VisitDraftMeta | null);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    }

    // Se ainda não encontrou no IndexedDB, tenta fallback local
    if (!meta) {
      try {
        const raw = localStorage.getItem(`ginfotos_meta_backup:${key}`) || localStorage.getItem('ginfotos_meta_backup:visit:ativo');
        if (raw) meta = JSON.parse(raw) as VisitDraftMeta;
      } catch {
        // ignore
      }
    }

    // 2. Carregar fotos associadas
    let photos = await getPhotosForDraft(db, key);
    if (photos.length === 0 && key !== 'visit:ativo') {
      photos = await getPhotosForDraft(db, 'visit:ativo');
    }

    return { meta, photos };
  } catch (error) {
    console.warn('Falha ao carregar rascunho de fotos do IndexedDB:', error);
    return { meta: null, photos: [] };
  }
}

export async function clearVisitDraft(key: string): Promise<void> {
  try {
    localStorage.removeItem(`ginfotos_meta_backup:${key}`);
    localStorage.removeItem('ginfotos_meta_backup:visit:ativo');
  } catch {
    // ignore
  }

  try {
    const db = await getDb();
    const photos = await getPhotosForDraft(db, key);
    const photosAtivo = key !== 'visit:ativo' ? await getPhotosForDraft(db, 'visit:ativo') : [];
    const allPhotosToDelete = [...photos, ...photosAtivo];

    const tx = db.transaction([META_STORE, PHOTO_STORE], 'readwrite');
    const metaStore = tx.objectStore(META_STORE);
    metaStore.delete(key);
    metaStore.delete('visit:ativo');

    const photoStore = tx.objectStore(PHOTO_STORE);
    for (const p of allPhotosToDelete) {
      photoStore.delete(p.id);
    }

    await waitTx(tx);
  } catch (error) {
    console.warn('Erro ao limpar rascunho:', error);
  }
}

// -------------------------------------------------------------------------
// Visitas Pendentes (com fotos completas em IndexedDB sem limite de 5MB)
// -------------------------------------------------------------------------

export async function savePersistentPendingVisit(visit: PersistentPendingVisit): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(PENDING_STORE, 'readwrite');
  tx.objectStore(PENDING_STORE).put(visit);
  await waitTx(tx);
}

export async function loadAllPersistentPendingVisits(): Promise<PersistentPendingVisit[]> {
  try {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PENDING_STORE, 'readonly');
      const req = tx.objectStore(PENDING_STORE).getAll();
      req.onsuccess = () => resolve((req.result || []) as PersistentPendingVisit[]);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function removePersistentPendingVisit(id: string): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction(PENDING_STORE, 'readwrite');
    tx.objectStore(PENDING_STORE).delete(id);
    await waitTx(tx);
  } catch {
    // ignore
  }
}
