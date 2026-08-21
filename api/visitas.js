import { createClient } from '@supabase/supabase-js';

const PHOTO_BUCKET = 'visita-fotos';
const PHOTO_MARKER = 'GINFOTOS_JSON:';

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

function buildSupabaseCandidates() {
  const serviceUrl = clean(process.env.SUPABASE_URL);
  const serviceKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const publicUrl = clean(process.env.VITE_SUPABASE_URL);
  const publicKey = clean(process.env.VITE_SUPABASE_ANON_KEY);
  const candidates = [];
  const seen = new Set();

  const add = (url, key, label) => {
    if (!url || !key) return;
    let normalizedUrl = url;
    try {
      normalizedUrl = new URL(url).origin;
    } catch {
      return;
    }
    const signature = `${normalizedUrl}|${key.slice(0, 12)}`;
    if (seen.has(signature)) return;
    seen.add(signature);
    candidates.push({
      label,
      url: normalizedUrl,
      client: createClient(normalizedUrl, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      })
    });
  };

  add(serviceUrl, serviceKey, 'servidor');
  add(publicUrl, serviceKey, 'url-publica-chave-servidor');
  add(publicUrl, publicKey, 'publico');
  add(serviceUrl, publicKey, 'url-servidor-chave-publica');
  return candidates;
}

async function getWorkingSupabase() {
  const candidates = buildSupabaseCandidates();
  if (candidates.length === 0) {
    throw new Error('Variaveis do Supabase ausentes no Vercel.');
  }

  const errors = [];
  for (const candidate of candidates) {
    try {
      const { error } = await candidate.client.from('visitas').select('id').limit(1);
      if (!error) return candidate;
      errors.push(`${candidate.label}: ${error.message}`);
    } catch (error) {
      errors.push(`${candidate.label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Nao foi possivel conectar ao Supabase. ${errors.join(' | ')}`);
}

async function ensurePhotoBucket(client) {
  try {
    const { data } = await client.storage.listBuckets();
    const exists = Array.isArray(data) && data.some((bucket) => bucket.id === PHOTO_BUCKET || bucket.name === PHOTO_BUCKET);
    if (!exists) await client.storage.createBucket(PHOTO_BUCKET, { public: false });
  } catch {
    // Se nao houver permissao para criar, o upload abaixo retorna o erro real.
  }
}

async function signedUrlForPath(client, path) {
  if (!path) return '';
  try {
    const { data, error } = await client.storage.from(PHOTO_BUCKET).createSignedUrl(path, 60 * 60);
    return error ? '' : clean(data?.signedUrl);
  } catch {
    return '';
  }
}

async function listLegacyStoredPhotos(client, visitId) {
  try {
    const { data, error } = await client.storage.from(PHOTO_BUCKET).list(String(visitId), {
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

async function hydratePhotos(client, row, includeLegacyStorage = false) {
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
    const legacy = await listLegacyStoredPhotos(client, row.id);
    for (const photo of legacy) {
      const key = photo.path || photo.name;
      if (!photoMap.has(key)) photoMap.set(key, photo);
    }
  }

  const hydrated = [];
  for (const photo of photoMap.values()) {
    let url = photo.dataUrl || '';
    if (!url && photo.path) url = await signedUrlForPath(client, photo.path);
    hydrated.push({
      name: photo.name || 'Foto da visita',
      caption: photo.caption || '',
      path: photo.path || '',
      url,
      dataUrl: photo.dataUrl || ''
    });
  }
  return hydrated;
}

function normalizeVisit(row, photos = null, notesOverride = null) {
  const parsed = parsePhotoPayload(notesOverride === null ? row.notes : notesOverride);
  return {
    id: row.id,
    visitor_name: clean(row.visitor_name),
    unidade_id: clean(row.unidade_id),
    visit_date: clean(row.visit_date),
    notes: parsed.text,
    created_by: clean(row.created_by),
    created_at: clean(row.created_at),
    photo_count: Array.isArray(photos) ? photos.length : parsed.photos.length,
    photos: Array.isArray(photos) ? photos : []
  };
}

async function uploadSinglePhoto(client, visitId, photo, index) {
  const decoded = decodeDataUrl(photo?.dataUrl);
  if (!decoded) return { metadata: null, error: `Foto ${index + 1}: arquivo invalido.` };

  await ensurePhotoBucket(client);
  const original = safeName(photo?.name || `foto-${index + 1}.jpg`);
  const stem = original.replace(/\.[^.]+$/, '') || `foto-${index + 1}`;
  const extension = decoded.contentType === 'image/png' ? 'png' : 'jpg';
  const path = `${visitId}/${Date.now()}-${index + 1}-${stem}.${extension}`;

  try {
    const { error } = await client.storage.from(PHOTO_BUCKET).upload(path, decoded.buffer, {
      contentType: decoded.contentType,
      cacheControl: '3600',
      upsert: true
    });
    if (error) {
      return {
        metadata: { name: original, caption: clean(photo?.caption), dataUrl: clean(photo?.dataUrl) },
        error: error.message
      };
    }
    return { metadata: { name: original, caption: clean(photo?.caption), path }, error: '' };
  } catch (error) {
    return {
      metadata: { name: original, caption: clean(photo?.caption), dataUrl: clean(photo?.dataUrl) },
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function uploadVisitPhotos(client, visitId, photos) {
  const metadata = [];
  const errors = [];
  for (let index = 0; index < photos.length; index += 1) {
    const uploaded = await uploadSinglePhoto(client, visitId, photos[index], index);
    if (uploaded.metadata) metadata.push(uploaded.metadata);
    if (uploaded.error) errors.push(`Foto ${index + 1}: ${uploaded.error}`);
  }
  return { metadata, errors };
}

async function readUnitMap(client) {
  const map = new Map();
  try {
    const { data, error } = await client.from('unidades').select('id, designacao, name, bairro, telefone, diretor_geral').limit(2000);
    if (error || !Array.isArray(data)) return map;
    for (const unit of data) {
      const notes = [
        `Designacao: ${clean(unit.designacao) || clean(unit.id)}`,
        `Unidade escolar: ${clean(unit.name) || clean(unit.id)}`,
        `Bairro: ${clean(unit.bairro) || 'Nao informado'}`,
        `Telefone: ${clean(unit.telefone) || 'Nao informado'}`,
        `Diretor: ${clean(unit.diretor_geral) || 'Nao informado'}`
      ].join('\n');
      map.set(clean(unit.id), notes);
      if (unit.designacao) map.set(clean(unit.designacao), notes);
    }
  } catch {
    // A lista continua funcionando mesmo se a tabela de unidades nao responder.
  }
  return map;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');

  let active;
  try {
    active = await getWorkingSupabase();
  } catch (error) {
    return res.status(503).json({
      error: error instanceof Error ? error.message : String(error),
      data: []
    });
  }

  const supabase = active.client;

  if (req.method === 'GET') {
    const visitId = clean(req.query?.id);

    if (visitId) {
      try {
        const { data, error } = await supabase.from('visitas').select('*').eq('id', visitId).maybeSingle();
        if (error) return res.status(500).json({ error: error.message });
        if (!data) return res.status(404).json({ error: 'Visita nao encontrada.' });
        const photos = await hydratePhotos(supabase, data, true);
        return res.status(200).json({ ok: true, source: active.label, visit: normalizeVisit(data, photos) });
      } catch (error) {
        return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
      }
    }

    try {
      const { data, error } = await supabase
        .from('visitas')
        .select('id, visitor_name, unidade_id, visit_date, created_by, created_at')
        .order('visit_date', { ascending: false })
        .limit(1000);

      if (error) return res.status(500).json({ error: error.message, data: [] });

      const unitMap = await readUnitMap(supabase);
      const list = (data || []).map((row) => {
        const unitNotes = unitMap.get(clean(row.unidade_id)) || '';
        return normalizeVisit({ ...row, notes: unitNotes }, [], unitNotes);
      });
      return res.status(200).json({ data: list, count: list.length, source: active.label });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : String(error), data: [] });
    }
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const action = clean(req.query?.action);
    const visitId = clean(req.query?.id || body.visit_id || body.id);

    if (action === 'add-photo') {
      if (!visitId) return res.status(400).json({ error: 'ID da visita ausente.' });
      try {
        const photo = body.photo || body;
        const { data: row, error: readError } = await supabase.from('visitas').select('*').eq('id', visitId).maybeSingle();
        if (readError) return res.status(500).json({ error: readError.message });
        if (!row) return res.status(404).json({ error: 'Visita nao encontrada.' });

        const uploaded = await uploadSinglePhoto(supabase, visitId, photo, 0);
        if (!uploaded.metadata) return res.status(500).json({ error: uploaded.error || 'Falha ao enviar foto.' });

        const parsed = parsePhotoPayload(row.notes);
        const metadata = [...parsed.photos.map((item) => ({
          name: clean(item?.name),
          caption: clean(item?.caption),
          path: clean(item?.path || item?.storagePath),
          dataUrl: clean(item?.path || item?.storagePath) ? undefined : clean(item?.dataUrl)
        })).filter((item) => item.path || item.dataUrl), uploaded.metadata];

        const notes = withPhotoPayload(parsed.text, metadata);
        const { data: updated, error: updateError } = await supabase
          .from('visitas')
          .update({ notes })
          .eq('id', visitId)
          .select('*')
          .single();
        if (updateError) return res.status(500).json({ error: updateError.message });

        const photos = await hydratePhotos(supabase, updated, false);
        return res.status(200).json({ ok: true, source: active.label, visit: normalizeVisit(updated, photos), photo_error: uploaded.error || null });
      } catch (error) {
        return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
      }
    }

    try {
      const visit = body.visit || body;
      const legacyPhotos = Array.isArray(visit.photos || visit.fotos) ? (visit.photos || visit.fotos).slice(0, 8) : [];
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

      if (legacyPhotos.length > 0) {
        const uploaded = await uploadVisitPhotos(supabase, inserted.id, legacyPhotos);
        const notes = withPhotoPayload(record.notes, uploaded.metadata);
        const { data: updated, error: updateError } = await supabase
          .from('visitas')
          .update({ notes })
          .eq('id', inserted.id)
          .select('*')
          .single();
        const finalRow = !updateError && updated ? updated : { ...inserted, notes };
        return res.status(200).json({
          ok: true,
          source: active.label,
          visit: normalizeVisit(finalRow, null),
          photo_errors: uploaded.errors
        });
      }

      return res.status(200).json({ ok: true, source: active.label, visit: normalizeVisit(inserted, []) });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
