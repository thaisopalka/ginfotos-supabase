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

export function loadPendingVisitRecords(): PendingVisitRecord[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_VISITS_KEY) || '[]') as PendingVisitRecord[];
  } catch {
    return [];
  }
}

export function storePendingVisitRecords(visits: PendingVisitRecord[]) {
  localStorage.setItem(LOCAL_VISITS_KEY, JSON.stringify(visits.slice(0, 120)));
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

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return {} as Record<string, unknown>;
  try { return JSON.parse(text) as Record<string, unknown>; }
  catch { throw new Error(`Resposta inválida do servidor (${response.status}).`); }
}

async function createOrFindRemoteVisit(visit: PendingVisitRecord) {
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
        created_by: visit.created_by || 'app'
      }
    })
  });
  const payload = await readJson(response);
  const remote = payload.visit as { id?: string } | undefined;
  if (!response.ok || !remote?.id) throw new Error(String(payload.error || 'Não foi possível sincronizar a visita.'));
  return remote.id;
}

async function uploadPhoto(remoteId: string, photo: PendingVisitPhoto, index: number) {
  if (!photo.dataUrl) return;
  const response = await fetch(`/api/visitas?action=add-photo&id=${encodeURIComponent(remoteId)}&ts=${Date.now()}-${index}`, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    body: JSON.stringify({ photo: { name: photo.name, caption: photo.caption || '', dataUrl: photo.dataUrl } })
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(String(payload.error || `Falha ao enviar ${photo.name}.`));
}

export async function syncPendingVisitsOnce() {
  if (!navigator.onLine) return { synced: 0, pending: loadPendingVisitRecords().filter((item) => item.id.startsWith('local-')).length };

  const visits = loadPendingVisitRecords();
  let synced = 0;
  let changed = false;
  const next: PendingVisitRecord[] = [];

  for (const visit of visits) {
    if (!visit.id.startsWith('local-')) {
      next.push(visit);
      continue;
    }

    try {
      const remoteId = await createOrFindRemoteVisit(visit);
      const photos = visit.fotos || [];
      for (let index = 0; index < photos.length; index += 1) {
        await uploadPhoto(remoteId, photos[index], index);
      }

      next.push({
        ...visit,
        id: remoteId,
        fotos: photos.map((photo) => ({ name: photo.name, caption: photo.caption || '' })),
        photo_count: Math.max(visit.photo_count || 0, photos.length)
      });
      synced += 1;
      changed = true;
    } catch {
      next.push(visit);
    }
  }

  if (changed) {
    try { storePendingVisitRecords(next); } catch { /* preserva o que já existe se o navegador estiver sem espaço */ }
    window.dispatchEvent(new CustomEvent('ginfotos-visitas-updated', { detail: { synced } }));
  }

  return { synced, pending: next.filter((item) => item.id.startsWith('local-')).length };
}
