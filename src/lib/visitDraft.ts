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

const DB_NAME = 'ginfotos_visit_drafts';
const DB_VERSION = 1;
const META_STORE = 'drafts';
const PHOTO_STORE = 'photos';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error || new Error('Falha ao abrir o banco de rascunhos.'));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        const store = db.createObjectStore(PHOTO_STORE, { keyPath: 'id' });
        store.createIndex('draftKey', 'draftKey', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function complete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Falha ao salvar rascunho.'));
    transaction.onabort = () => reject(transaction.error || new Error('Rascunho cancelado pelo navegador.'));
  });
}

export function visitDraftKey(email?: string | null) {
  return `visit:${String(email || 'usuario').trim().toLowerCase()}`;
}

export async function saveVisitDraftMeta(meta: VisitDraftMeta) {
  const db = await openDb();
  const tx = db.transaction(META_STORE, 'readwrite');
  tx.objectStore(META_STORE).put(meta);
  await complete(tx);
  db.close();
}

export async function saveVisitDraftPhoto(photo: VisitDraftPhoto) {
  const db = await openDb();
  const tx = db.transaction(PHOTO_STORE, 'readwrite');
  tx.objectStore(PHOTO_STORE).put(photo);
  await complete(tx);
  db.close();
}

export async function deleteVisitDraftPhoto(id: string) {
  const db = await openDb();
  const tx = db.transaction(PHOTO_STORE, 'readwrite');
  tx.objectStore(PHOTO_STORE).delete(id);
  await complete(tx);
  db.close();
}

async function readPhotosForDraft(db: IDBDatabase, draftKey: string): Promise<VisitDraftPhoto[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, 'readonly');
    const index = tx.objectStore(PHOTO_STORE).index('draftKey');
    const request = index.getAll(IDBKeyRange.only(draftKey));
    request.onsuccess = () => resolve((request.result || []) as VisitDraftPhoto[]);
    request.onerror = () => reject(request.error || new Error('Falha ao recuperar fotos do rascunho.'));
  });
}

export async function loadVisitDraft(key: string): Promise<{ meta: VisitDraftMeta | null; photos: VisitDraftPhoto[] }> {
  const db = await openDb();
  const meta = await new Promise<VisitDraftMeta | null>((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readonly');
    const request = tx.objectStore(META_STORE).get(key);
    request.onsuccess = () => resolve((request.result || null) as VisitDraftMeta | null);
    request.onerror = () => reject(request.error || new Error('Falha ao recuperar rascunho.'));
  });
  const photos = await readPhotosForDraft(db, key);
  db.close();
  return { meta, photos };
}

export async function clearVisitDraft(key: string) {
  const db = await openDb();
  const photos = await readPhotosForDraft(db, key);
  const tx = db.transaction([META_STORE, PHOTO_STORE], 'readwrite');
  tx.objectStore(META_STORE).delete(key);
  const photoStore = tx.objectStore(PHOTO_STORE);
  photos.forEach((photo) => photoStore.delete(photo.id));
  await complete(tx);
  db.close();
}
