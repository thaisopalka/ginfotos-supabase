import { createClient } from '@supabase/supabase-js';

const PHOTO_BUCKET = 'visita-fotos';
const PHOTO_MARKER = 'GINFOTOS_JSON:';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function clean(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function safeName(value, fallback = 'foto.jpg') {
  const name = clean(value || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return name || fallback;
}

function parsePhotoPayload(notes) {
  const raw = clean(notes);
  const markerIndex = raw.indexOf(PHOTO_MARKER);
  if (markerIndex < 0) return { text: raw, photos: [] };

  const text = raw.slice(0, markerIndex).replace(/\s+$/g, '');
  const json = raw.slice(markerIndex + PHOTO_MARKER.length).trim();
  try {
    const parsed = JSON.parse(json);
    return { text, photos: Array.isArray(parsed?.fotos) ? parsed.fotos : [] };
  } catch {
    return { text: raw, photos: [] };
  }
}

function withPhotoPayload(notes, photos) {
  const base = parsePhotoPayload(notes).text;
  if (!Array.isArray(photos) || photos.length === 0) return base;
  return `${base}\n${PHOTO_MARKER}${JSON.stringify({ fotos: photos })}`;
}

function decodeDataUrl(dataUrl) {
  const value = clean(dataUrl);
  const match = /^data:([^;]+);base64,(.+)$/s.exec(value);
  if (!match) return null;
  try {
    return { contentType: match[1] || 'image/jpeg', buffer: Buffer.from(match[2], 'base64') };
  } catch {
    return null;
  }
}

async function ensurePhotoBucket(supabase) {
  try {
    const { data } = await supabase.storage.listBuckets();
    const exists = Array.isArray(data) && data.some((bucket) => bucket.id === PHOTO_BUCKET || bucket.name === PHOTO_BUCKET);
    if (!exists) await supabase.storage.createBucket(PHOTO_BUCKET, { public: false });
  } catch {
    // O upload logo abaixo informará o erro real caso o bucket não esteja disponível.
  }
}

async function signedUrlForPath(supabase, path) {
  if (!path) return '';
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, 60 * 60);
  return error ? '' : clean(data?.signedUrl);
}

async function listLegacyStoredPhotos(supabase, visitId) {
  try {
    const { data, error } = await supabase.storage.from(PHOTO_BUCKET).list(String(visitId), {
      limit: 100,
      sortBy: { column: 'name', order: 'asc' }
    });
    if (error || !Array.isArray(data)) return [];
    return data
      .filter((item) => item?.name && item.name !== '.emptyFolderPlaceholder')
      .map((item) => ({ name: item.name, caption: '', path: `${visitId}/${item.name}` }));
  } catch {
    return [];
  }
}

async function hydratePhotos(supabase, row, includeLegacyStorage = false) {
  const parsed = parsePhotoPayload(row.notes);
  const photoMap = new Map();

  for (const photo of parsed.photos) {
    const normalized = {
      name: clean(photo?.name || 'Foto da visita'),
      caption: clean(photo?.caption),
      path: clean(photo?.path || photo?.storagePath),
      dataUrl: clean(photo?.dataUrl)
    };
    const key = normalized.path || normalized.dataUrl || normalized.name;
    if (key) photoMap.set(key, normalized);
  }

  if (includeLegacyStorage) {
    const legacy = await listLegacyStoredPhotos(supabase, row.id);
    for (const photo of legacy) {
      const key = photo.path || photo.name;
      if (!photoMap.has(key)) photoMap.set(key, photo);
    }
  }

  const hydrated = [];
  for (const photo of photoMap.values()) {
    let url = photo.dataUrl || '';
    if (!url && photo.path) url = await signedUrlForPath(supabase, photo.path);
    hydrated.push({
      name: photo.name || 'Foto da visita',
      caption: photo.caption || '',
      path: photo.path || '',
      url
    });
  }
  return hydrated;
}

function normalizeVisit(row, photos = null) {
  const parsed = parsePhotoPayload(row.notes);
  const photoCount = Array.isArray(photos) ? photos.length : parsed.photos.length;
  return {
    id: row.id,
    visitor_name: clean(row.visitor_name),
    unidade_id: clean(row.unidade_id),
    visit_date: clean(row.visit_date),
    notes: parsed.text,
    created_by: clean(row.created_by),
    created_at: clean(row.created_at),
    photo_count: photoCount,
    photos: Array.isArray(photos) ? photos : []
  };
}

async function uploadVisitPhotos(supabase, visitId, photos) {
  await ensurePhotoBucket(supabase);
  const metadata = [];
  const errors = [];

  for (let index = 0; index < photos.length; index += 1) {
    const photo = photos[index] || {};
    const decoded = decodeDataUrl(photo.dataUrl);
    if (!decoded) {
      errors.push(`Foto ${index + 1}: arquivo inválido.`);
      continue;
    }

    const original = safeName(photo.name || `foto-${index + 1}.jpg`);
    const stem = original.replace(/\.[^.]+$/, '') || `foto-${index + 1}`;
    const extension = decoded.contentType === 'image/png' ? 'png' : 'jpg';
    const path = `${visitId}/${Date.now()}-${index + 1}-${stem}.${extension}`;

    const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, decoded.buffer, {
      contentType: decoded.contentType,
      cacheControl: '3600',
      upsert: true
    });

    if (error) {
      errors.push(`Foto ${index + 1}: ${error.message}`);
      metadata.push({ name: original, caption: clean(photo.caption), dataUrl: clean(photo.dataUrl) });
      continue;
    }

    metadata.push({ name: original, caption: clean(photo.caption), path });
  }

  return { metadata, errors };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');

  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: 'SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente no Vercel.' });

  if (req.method === 'GET') {
    const visitId = clean(req.query?.id);

    if (visitId) {
      const { data, error } = await supabase.from('visitas').select('*').eq('id', visitId).maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(404).json({ error: 'Visita não encontrada.' });
      const photos = await hydratePhotos(supabase, data, true);
      return res.status(200).json({ ok: true, visit: normalizeVisit(data, photos) });
    }

    const { data, error } = await supabase
      .from('visitas')
      .select('*')
      .order('visit_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1000);

    if (error) return res.status(500).json({ error: error.message, data: [] });
    return res.status(200).json({ data: (data || []).map((row) => normalizeVisit(row)), count: data?.length || 0 });
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const visit = body.visit || body;
    const photos = Array.isArray(visit.photos || visit.fotos) ? (visit.photos || visit.fotos).slice(0, 8) : [];

    const record = {
      visitor_name: clean(visit.visitor_name || visit.representante || 'ENGA. MARCIA BRAGA'),
      unidade_id: clean(visit.unidade_id || visit.designacao || ''),
      visit_date: clean(visit.visit_date || new Date().toISOString().slice(0, 10)),
      notes: parsePhotoPayload(clean(visit.notes || '')).text,
      created_by: clean(visit.created_by || 'app')
    };

    const { data: inserted, error: insertError } = await supabase
      .from('visitas')
      .insert([record])
      .select('*')
      .single();

    if (insertError) return res.status(500).json({ error: insertError.message });

    let uploaded = { metadata: [], errors: [] };
    if (photos.length > 0) uploaded = await uploadVisitPhotos(supabase, inserted.id, photos);

    const notesWithPhotos = withPhotoPayload(record.notes, uploaded.metadata);
    let finalRow = { ...inserted, notes: notesWithPhotos };

    if (notesWithPhotos !== inserted.notes) {
      const { data: updated, error: updateError } = await supabase
        .from('visitas')
        .update({ notes: notesWithPhotos })
        .eq('id', inserted.id)
        .select('*')
        .single();
      if (!updateError && updated) finalRow = updated;
      if (updateError) uploaded.errors.push(`Metadados das fotos: ${updateError.message}`);
    }

    const hydrated = await hydratePhotos(supabase, finalRow, false);
    return res.status(200).json({
      ok: true,
      visit: normalizeVisit(finalRow, hydrated),
      photo_errors: uploaded.errors
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
