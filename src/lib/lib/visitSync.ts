import { clearVisitDraft, loadVisitDraft, visitDraftKey, loadAllPersistentPendingVisits, removePersistentPendingVisit } from './visitDraft';
import { apiFetch, apiReadJson } from './apiClient';

export interface PendingVisitPhoto {
  name: string;
  caption?: string;
  dataUrl?: string;
}

export interface PendingVisitRecord {
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
  fotos?: PendingVisitPhoto[];
  created_by?: string;
  created_at: string;
}

const LOCAL_VISITS_KEY = 'ginfotos_visitas_local';
let isSyncingMutex = false;

export function loadPendingVisitRecords(): PendingVisitRecord[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_VISITS_KEY) || '[]') as PendingVisitRecord[];
  } catch {
    return [];
  }
}

export function storePendingVisitRecords(visits: PendingVisitRecord[]) {
  const compact = visits.slice(0, 100).map((v) => ({
    ...v,
    fotos: (v.fotos || []).map((f) => ({ name: f.name, caption: f.caption || '' }))
  }));
  try {
    localStorage.setItem(LOCAL_VISITS_KEY, JSON.stringify(compact));
  } catch {
    // ignore
  }
}

function buildNotes(visit: PendingVisitRecord) {
  return [
    `Tipo de visita/obra: ${visit.tipo || 'VISTORIA TECNICA'}`,
    `Representante E/6 CRE/GIN: ${visit.representante || 'GIN 6ª CRE'}`,
    `Servicos verificados: ${visit.servicos || 'Nao informado'}`,
    `Observacoes: ${visit.observacoes || 'Nao informado'}`,
    `Conclusao: ${visit.conclusao || 'Nao informado'}`,
    `Unidade escolar: ${visit.unidade_nome || 'Nao informado'}`,
    `Designacao: ${visit.designacao || visit.unidade_id || 'Nao informado'}`,
    `Endereco: ${visit.endereco || 'Nao informado'}`,
    `Bairro: ${visit.bairro || 'Nao informado'}`,
    `Telefone: ${visit.telefone || 'Nao informado'}`,
    `Diretor: ${visit.diretor_geral || 'Nao informado'}`
  ].join('\n');
}

async function createOrFindRemoteVisit(visit: PendingVisitRecord) {
  const response = await apiFetch('/api/visitas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      visit: {
        client_id: visit.id,
        visitor_name: visit.representante,
        unidade_id: visit.unidade_id,
        visit_date: visit.visit_date,
        notes: buildNotes(visit),
        created_by: visit.created_by || 'app'
      }
    })
  });
  const payload = await apiReadJson<{ visit?: { id: string }; error?: string }>(response);
  const remote = payload.visit;
  if (!response.ok || !remote?.id) throw new Error(String(payload.error || 'Não foi possível sincronizar a visita.'));
  return remote.id;
}

async function uploadPhoto(remoteId: string, photo: PendingVisitPhoto, index: number) {
  if (!photo.dataUrl) return;
  const response = await apiFetch(`/api/visitas?action=add-photo&id=${encodeURIComponent(remoteId)}&ts=${Date.now()}-${index}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photo: { name: photo.name, caption: photo.caption || '', dataUrl: photo.dataUrl } })
  });
  const payload = await apiReadJson<{ error?: string }>(response);
  if (!response.ok) throw new Error(String(payload.error || `Falha ao enviar ${photo.name}.`));
}

async function recoverPhotosFromSecureDraft(visit: PendingVisitRecord) {
  const localPhotos = visit.fotos || [];
  if (!visit.created_by) return { photos: localPhotos, draftKey: '', draftMatches: false };

  const key = visitDraftKey(visit.created_by);
  try {
    const draft = await loadVisitDraft(key);
    if (!draft.meta || draft.meta.clientId !== visit.id || draft.photos.length === 0) {
      return { photos: localPhotos, draftKey: key, draftMatches: false };
    }
    const draftPhotos: PendingVisitPhoto[] = draft.photos.map((photo) => ({
      name: photo.name,
      caption: photo.caption || '',
      dataUrl: photo.dataUrl
    }));
    const localWithData = localPhotos.filter((photo) => !!photo.dataUrl);
    const photos = draftPhotos.length >= localWithData.length ? draftPhotos : localWithData;
    return { photos, draftKey: key, draftMatches: true };
  } catch {
    return { photos: localPhotos, draftKey: key, draftMatches: false };
  }
}

export async function syncPendingVisitsOnce(): Promise<{ synced: number; pending: number }> {
  if (!navigator.onLine || isSyncingMutex) {
    const current = loadPendingVisitRecords();
    return { synced: 0, pending: current.filter((item) => item.id.startsWith('local-')).length };
  }

  isSyncingMutex = true;

  try {
    const visits = loadPendingVisitRecords();
    const persistent = await loadAllPersistentPendingVisits();
    const persistentMap = new Map(persistent.map((p) => [p.id, p]));

    // Mescla o que foi salvo no IndexedDB
    for (const p of persistent) {
      if (!visits.some((v) => v.id === p.id)) {
        visits.push(p as PendingVisitRecord);
      }
    }

    let synced = 0;
    let changed = false;
    const next: PendingVisitRecord[] = [];

    for (const visit of visits) {
      if (!visit.id.startsWith('local-')) {
        next.push(visit);
        continue;
      }

      try {
        let photosToUpload: PendingVisitPhoto[] = [];

        // 1. Tentar pegar fotos do IndexedDB persistente
        const persistentMatch = persistentMap.get(visit.id);
        if (persistentMatch && Array.isArray(persistentMatch.fotos) && persistentMatch.fotos.length > 0) {
          photosToUpload = persistentMatch.fotos.filter((f) => !!f.dataUrl);
        }

        // 2. Se não tinha no persistent, tenta recuperar do rascunho seguro
        let recoveredKey = '';
        let recoveredMatches = false;
        if (photosToUpload.length === 0) {
          const recovered = await recoverPhotosFromSecureDraft(visit);
          photosToUpload = recovered.photos;
          recoveredKey = recovered.draftKey;
          recoveredMatches = recovered.draftMatches;
        }

        const remoteId = await createOrFindRemoteVisit(visit);

        for (let index = 0; index < photosToUpload.length; index += 1) {
          await uploadPhoto(remoteId, photosToUpload[index], index);
        }

        next.push({
          ...visit,
          id: remoteId,
          fotos: photosToUpload.map((photo) => ({ name: photo.name, caption: photo.caption || '' })),
          photo_count: Math.max(visit.photo_count || 0, photosToUpload.length)
        });
        synced += 1;
        changed = true;

        if (persistentMatch) {
          await removePersistentPendingVisit(visit.id);
        }

        if (recoveredMatches && recoveredKey) {
          try {
            await clearVisitDraft(recoveredKey);
          } catch {
            // ignore
          }
        }
      } catch (err) {
        console.warn(`Tentativa de envio da visita ${visit.id} adiada:`, err);
        next.push(visit);
      }
    }

    if (changed) {
      storePendingVisitRecords(next);
      window.dispatchEvent(new CustomEvent('ginfotos-visitas-updated', { detail: { synced } }));
    }

    return { synced, pending: next.filter((item) => item.id.startsWith('local-')).length };
  } finally {
    isSyncingMutex = false;
  }
}
