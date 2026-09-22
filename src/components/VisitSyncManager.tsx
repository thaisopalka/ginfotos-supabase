import { useEffect, useRef } from 'react';
import { getCurrentUser } from '../lib/session';
import { clearVisitDraft, loadVisitDraft, visitDraftKey } from '../lib/visitDraft';

interface SavedPhoto {
  id?: string;
  name: string;
  caption?: string;
  dataUrl?: string;
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
  visit_date: string;
  tipo: string;
  representante: string;
  servicos: string;
  observacoes: string;
  conclusao: string;
  photo_count: number;
  fotos?: SavedPhoto[];
  created_by?: string;
  created_at: string;
}

interface ApiVisit {
  id: string;
  client_id?: string | null;
  created_at?: string | null;
  photo_count?: number;
}

const LOCAL_VISITS_KEY = 'ginfotos_visitas_local';

function readLocalVisits(): LocalVisitRecord[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_VISITS_KEY) || '[]') as LocalVisitRecord[]; }
  catch { return []; }
}

function writeLocalVisits(visits: LocalVisitRecord[]) {
  const compact = visits.slice(0, 100).map((visit) => ({
    ...visit,
    fotos: (visit.fotos || []).map((photo) => ({ name: photo.name, caption: photo.caption || '' }))
  }));
  try { localStorage.setItem(LOCAL_VISITS_KEY, JSON.stringify(compact)); } catch { /* ignore */ }
}

function buildNotes(visit: LocalVisitRecord) {
  return [
    `Designacao: ${visit.designacao || visit.unidade_id || 'Nao informado'}`,
    `Unidade escolar: ${visit.unidade_nome || 'Nao informado'}`,
    `Endereco: ${visit.endereco || 'Nao informado'}`,
    `Bairro: ${visit.bairro || 'Nao informado'}`,
    `Telefone: ${visit.telefone || 'Nao informado'}`,
    `Diretor: ${visit.diretor_geral || 'Nao informado'}`,
    `Tipo de visita/obra: ${visit.tipo || 'VISTORIA TECNICA'}`,
    `Representante E/6 CRE/GIN: ${visit.representante || 'ENGA. MARCIA BRAGA'}`,
    `Servicos verificados: ${visit.servicos || 'Nao informado'}`,
    `Observacoes: ${visit.observacoes || 'Nao informado'}`,
    `Conclusao: ${visit.conclusao || 'Nao informado'}`,
    `GINFOTOS_CLIENT_ID:${visit.id}`
  ].join('\n');
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return {} as Record<string, unknown>;
  try { return JSON.parse(text) as Record<string, unknown>; }
  catch { throw new Error(`Resposta inválida do servidor (${response.status}).`); }
}

async function createRemoteVisit(visit: LocalVisitRecord) {
  const response = await fetch('/api/visitas', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    body: JSON.stringify({
      visit: {
        client_id: visit.id,
        visitor_name: visit.representante,
        unidade_id: visit.unidade_id,
        visit_date: visit.visit_date,
        notes: buildNotes(visit),
        created_by: visit.created_by || getCurrentUser()?.email || 'app'
      }
    })
  });
  const payload = await readJson(response);
  if (!response.ok || !(payload.visit as ApiVisit | undefined)?.id) {
    throw new Error(String(payload.error || `Falha ao sincronizar visita (${response.status}).`));
  }
  return payload.visit as ApiVisit;
}

async function uploadPhoto(visitId: string, photo: SavedPhoto, index: number) {
  if (!photo.dataUrl) return;
  const response = await fetch(`/api/visitas?action=add-photo&id=${encodeURIComponent(visitId)}&ts=${Date.now()}`, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    body: JSON.stringify({
      photo: {
        id: photo.id || `photo-${index}-${photo.name}`,
        name: photo.name,
        caption: photo.caption || '',
        dataUrl: photo.dataUrl
      }
    })
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(String(payload.error || `Falha ao enviar foto ${index + 1}.`));
}

async function photosForPendingVisit(visit: LocalVisitRecord) {
  const direct = (visit.fotos || []).filter((photo) => !!photo.dataUrl);
  const email = getCurrentUser()?.email;
  if (!email) return direct;

  try {
    const draft = await loadVisitDraft(visitDraftKey(email));
    if (draft.meta?.clientId !== visit.id || draft.photos.length === 0) return direct;
    return draft.photos.map((photo) => ({
      id: photo.id,
      name: photo.name,
      caption: photo.caption || '',
      dataUrl: photo.dataUrl
    }));
  } catch {
    return direct;
  }
}

async function synchronizePendingVisit(visit: LocalVisitRecord) {
  const remote = await createRemoteVisit(visit);
  const photos = await photosForPendingVisit(visit);
  for (let index = 0; index < photos.length; index += 1) {
    await uploadPhoto(remote.id, photos[index], index);
  }

  const userEmail = getCurrentUser()?.email;
  if (userEmail) {
    try {
      const draft = await loadVisitDraft(visitDraftKey(userEmail));
      if (draft.meta?.clientId === visit.id) await clearVisitDraft(visitDraftKey(userEmail));
    } catch { /* keep going */ }
  }

  return { remoteId: remote.id, photoCount: photos.length || visit.photo_count || 0 };
}

async function synchronizeLocalQueue() {
  const user = getCurrentUser();
  if (!user?.email || !navigator.onLine) return false;

  const current = readLocalVisits();
  const pending = current.filter((visit) => visit.id.startsWith('local-'));
  if (pending.length === 0) return false;

  let changed = false;
  let next = [...current];

  for (const visit of pending) {
    try {
      const synced = await synchronizePendingVisit(visit);
      next = next.map((item) => item.id === visit.id
        ? {
            ...item,
            id: synced.remoteId,
            photo_count: synced.photoCount,
            fotos: (item.fotos || []).map((photo) => ({ name: photo.name, caption: photo.caption || '' }))
          }
        : item);
      changed = true;
    } catch (error) {
      if (error instanceof Error && /sessão expirada|sessao expirada|401/i.test(error.message)) {
        try {
          sessionStorage.setItem('ginfotos_session_notice', 'Sua sessão precisa ser renovada. Seu rascunho e suas fotos continuam protegidos neste aparelho.');
        } catch { /* ignore */ }
      }
      break;
    }
  }

  if (changed) {
    const deduped = next.filter((item, index, array) => index === array.findIndex((candidate) => candidate.id === item.id));
    writeLocalVisits(deduped);
    window.dispatchEvent(new Event('ginfotos-visitas-updated'));
  }
  return changed;
}

async function serverSignature() {
  const response = await fetch(`/api/visitas?ts=${Date.now()}`, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' }
  });
  if (!response.ok) return '';
  const payload = await readJson(response);
  const rows = Array.isArray(payload.data) ? payload.data as ApiVisit[] : [];
  return rows.map((item) => `${item.id}:${item.created_at || ''}:${item.photo_count || 0}`).join('|');
}

export default function VisitSyncManager() {
  const runningRef = useRef(false);
  const signatureRef = useRef('');

  useEffect(() => {
    let disposed = false;

    const run = async () => {
      if (disposed || runningRef.current || document.visibilityState === 'hidden') return;
      const user = getCurrentUser();
      if (!user?.email || !navigator.onLine) return;

      runningRef.current = true;
      try {
        await synchronizeLocalQueue();
        const signature = await serverSignature();
        if (signature) {
          if (signatureRef.current && signatureRef.current !== signature) {
            window.dispatchEvent(new Event('ginfotos-visitas-updated'));
          }
          signatureRef.current = signature;
        }
      } catch {
        // O app continua utilizável offline; a próxima rodada tenta novamente.
      } finally {
        runningRef.current = false;
      }
    };

    void run();
    const interval = window.setInterval(() => void run(), 12000);
    const onOnline = () => void run();
    const onFocus = () => void run();
    const onVisibility = () => { if (document.visibilityState === 'visible') void run(); };

    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return null;
}
