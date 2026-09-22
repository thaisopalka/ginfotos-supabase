import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { requireSession } from './_session.js';

const PHOTO_BUCKET = 'visita-fotos';
const PHOTO_MARKER = 'GINFOTOS_JSON:';
const CLIENT_MARKER = 'GINFOTOS_CLIENT_ID:';

function clean(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function safeName(value, fallback = 'foto') {
  const name = clean(value || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return name || fallback;
}

function extractClientId(notes) {
  const line = clean(notes).split('\n').find((item) => item.trim().startsWith(CLIENT_MARKER));
  return line ? clean(line.slice(CLIENT_MARKER.length)) : '';
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

function notesHasLabel(notes, label) {
  const prefix = `${label.toLowerCase()}:`;
  return clean(notes).split('\n').some((line) => line.trim().toLowerCase().startsWith(prefix));
}

function enrichNotesWithUnit(notes, unitNotes) {
  const parsed = parsePhotoPayload(notes);
  if (!unitNotes) return parsed.text;
  const additions = unitNotes.split('\n').filter((line) => {
    const index = line.indexOf(':');
    if (index < 0) return false;
    return !notesHasLabel(parsed.text, line.slice(0, index));
  });
  return [...additions, parsed.text].filter(Boolean).join('\n');
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
    try { normalizedUrl = new URL(url).origin; }
    catch { return; }
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
  if (candidates.length === 0) throw new Error('Variáveis do Supabase ausentes no Vercel.');

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
  throw new Error(`Não foi possível conectar ao Supabase. ${errors.join(' | ')}`);
}

async function ensurePhotoBucket(client) {
  const { data, error } = await client.storage.listBuckets();
  if (error) throw new Error(error.message);
  const exists = Array.isArray(data) && data.some((bucket) => bucket.id === PHOTO_BUCKET || bucket.name === PHOTO_BUCKET);
  if (!exists) {
    const created = await client.storage.createBucket(PHOTO_BUCKET, { public: false });
    if (created.error) throw new Error(created.error.message);
  }
}

async function readUnitMap(client) {
  const map = new Map();
  try {
    const { data, error } = await client
      .from('unidades')
      .select('id, designacao, name, address, bairro, telefone, diretor_geral')
      .limit(2000);
    if (error || !Array.isArray(data)) return map;

    for (const unit of data) {
      const notes = [
        `Designacao: ${clean(unit.designacao) || clean(unit.id)}`,
        `Unidade escolar: ${clean(unit.name) || clean(unit.id)}`,
        `Endereco: ${clean(unit.address) || 'Nao informado'}`,
        `Bairro: ${clean(unit.bairro) || 'Nao informado'}`,
        `Telefone: ${clean(unit.telefone) || 'Nao informado'}`,
        `Diretor: ${clean(unit.diretor_geral) || 'Nao informado'}`
      ].join('\n');
      map.set(clean(unit.id), notes);
      if (unit.designacao) map.set(clean(unit.designacao), notes);
    }
  } catch {
    // A lista continua disponível mesmo se a base de unidades falhar.
  }
  return map;
}

async function listStructuredPhotos(client, visitId) {
  try {
    const { data, error } = await client
      .from('fotos_visita')
      .select('storage_path, legenda, ordem')
      .eq('visita_id', visitId)
      .order('ordem', { ascending: true })
      .limit(5000);
    if (error || !Array.isArray(data)) return [];
    return data.map((item) => ({
      name: clean(item.storage_path).split('/').pop() || 'Foto da visita',
      caption: clean(item.legenda),
      path: clean(item.storage_path)
    })).filter((item) => item.path);
  } catch {
    return [];
  }
}

async function listLegacyStoredPhotos(client, visitId) {
  const result = [];
  let offset = 0;
  const pageSize = 100;

  while (true) {
    try {
      const { data, error } = await client.storage.from(PHOTO_BUCKET).list(String(visitId), {
        limit: pageSize,
        offset,
        sortBy: { column: 'name', order: 'asc' }
      });
      if (error || !Array.isArray(data)) break;
      const page = data
        .filter((item) => item?.name && item.name !== '.emptyFolderPlaceholder')
        .map((item) => ({ name: item.name, caption: '', path: `${visitId}/${item.name}` }));
      result.push(...page);
      if (data.length < pageSize) break;
      offset += pageSize;
      if (offset > 10000) break;
    } catch {
      break;
    }
  }
  return result;
}

async function signPhotoPaths(client, paths) {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
  if (uniquePaths.length === 0) return new Map();

  try {
    const { data, error } = await client.storage.from(PHOTO_BUCKET).createSignedUrls(uniquePaths, 60 * 60);
    if (!error && Array.isArray(data)) {
      const map = new Map();
      data.forEach((item, index) => {
        const path = clean(item?.path || uniquePaths[index]);
        const signedUrl = clean(item?.signedUrl);
        if (path && signedUrl) map.set(path, signedUrl);
      });
      return map;
    }
  } catch {
    // fallback abaixo
  }

  const map = new Map();
  for (const path of uniquePaths) {
    try {
      const { data, error } = await client.storage.from(PHOTO_BUCKET).createSignedUrl(path, 60 * 60);
      if (!error && data?.signedUrl) map.set(path, clean(data.signedUrl));
    } catch { /* ignore */ }
  }
  return map;
}

async function hydratePhotos(client, row, includeLegacyStorage = false) {
  const parsed = parsePhotoPayload(row.notes);
  const photoMap = new Map();

  const structured = await listStructuredPhotos(client, row.id);
  for (const photo of structured) photoMap.set(photo.path, photo);

  for (const photo of parsed.photos) {
    const normalized = {
      name: clean(photo?.name || 'Foto da visita'),
      caption: clean(photo?.caption),
      path: clean(photo?.path || photo?.storagePath),
      dataUrl: clean(photo?.dataUrl)
    };
    const key = normalized.path || normalized.dataUrl || `${normalized.name}-${photoMap.size}`;
    if (key && !photoMap.has(key)) photoMap.set(key, normalized);
  }

  if (includeLegacyStorage) {
    const legacy = await listLegacyStoredPhotos(client, row.id);
    for (const photo of legacy) {
      const key = photo.path || `${photo.name}-${photoMap.size}`;
      if (!photoMap.has(key)) photoMap.set(key, photo);
    }
  }

  const values = Array.from(photoMap.values());
  const signed = await signPhotoPaths(client, values.map((photo) => photo.path));
  return values.map((photo) => ({
    name: photo.name || 'Foto da visita',
    caption: photo.caption || '',
    path: photo.path || '',
    url: photo.dataUrl || signed.get(photo.path) || '',
    dataUrl: photo.dataUrl || ''
  }));
}

function normalizeVisit(row, options = {}) {
  const parsed = parsePhotoPayload(options.notes ?? row.notes);
  const photos = Array.isArray(options.photos) ? options.photos : [];
  const photoCount = Number.isFinite(options.photoCount)
    ? Number(options.photoCount)
    : Math.max(parsed.photos.length, photos.length);

  return {
    id: row.id,
    client_id: clean(row.client_id),
    visitor_name: clean(row.visitor_name),
    unidade_id: clean(row.unidade_id),
    visit_date: clean(row.visit_date),
    notes: parsed.text,
    created_by: clean(row.created_by),
    created_at: clean(row.created_at),
    photo_count: photoCount,
    photos
  };
}

async function registerPhotoLink(client, visitId, metadata) {
  if (!metadata?.path) throw new Error('Caminho da foto ausente.');

  const { data: existing, error: existingError } = await client
    .from('fotos_visita')
    .select('id, ordem')
    .eq('storage_path', metadata.path)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  if (existing?.id) {
    const { error } = await client.from('fotos_visita').update({
      visita_id: visitId,
      legenda: clean(metadata.caption),
      status_legenda: clean(metadata.caption) ? 'COM_LEGENDA' : 'SEM_LEGENDA'
    }).eq('id', existing.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { count, error: countError } = await client
    .from('fotos_visita')
    .select('id', { count: 'exact', head: true })
    .eq('visita_id', visitId);
  if (countError) throw new Error(countError.message);

  const { error } = await client.from('fotos_visita').insert({
    visita_id: visitId,
    storage_path: metadata.path,
    arquivo_url: metadata.path,
    legenda: clean(metadata.caption),
    ordem: Number(count || 0),
    status_legenda: clean(metadata.caption) ? 'COM_LEGENDA' : 'SEM_LEGENDA'
  });
  if (error) throw new Error(error.message);
}

async function uploadSinglePhoto(client, visitId, photo, index) {
  const decoded = decodeDataUrl(photo?.dataUrl);
  if (!decoded) throw new Error(`Foto ${index + 1}: arquivo inválido.`);

  await ensurePhotoBucket(client);
  const original = safeName(photo?.name || `foto-${index + 1}.jpg`, `foto-${index + 1}.jpg`);
  const stem = safeName(original.replace(/\.[^.]+$/, ''), `foto-${index + 1}`);
  const extension = decoded.contentType === 'image/png' ? 'png' : 'jpg';
  const explicitId = safeName(photo?.id || photo?.client_photo_id || '', '');
  const contentHash = crypto.createHash('sha1').update(decoded.buffer).digest('hex').slice(0, 16);
  const stableId = explicitId || contentHash;
  const path = `${visitId}/${stableId}-${stem}.${extension}`;

  const { error: uploadError } = await client.storage.from(PHOTO_BUCKET).upload(path, decoded.buffer, {
    contentType: decoded.contentType,
    cacheControl: '3600',
    upsert: true
  });
  if (uploadError) throw new Error(uploadError.message);

  const metadata = { name: original, caption: clean(photo?.caption), path };
  await registerPhotoLink(client, visitId, metadata);
  return metadata;
}

async function structuredPhotoCountMap(client) {
  const map = new Map();
  try {
    const { data, error } = await client.from('fotos_visita').select('visita_id').limit(10000);
    if (error || !Array.isArray(data)) return map;
    for (const row of data) {
      const id = clean(row.visita_id);
      if (id) map.set(id, Number(map.get(id) || 0) + 1);
    }
  } catch { /* ignore */ }
  return map;
}

async function photoCountForVisit(client, visitId, notes) {
  const parsedCount = parsePhotoPayload(notes).photos.length;
  try {
    const { count, error } = await client.from('fotos_visita').select('id', { count: 'exact', head: true }).eq('visita_id', visitId);
    if (!error) return Math.max(parsedCount, Number(count || 0));
  } catch { /* ignore */ }
  return parsedCount;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');

  const sessionUser = requireSession(req, res);
  if (!sessionUser) return;

  let active;
  try { active = await getWorkingSupabase(); }
  catch (error) {
    return res.status(503).json({ error: error instanceof Error ? error.message : String(error), data: [] });
  }

  const supabase = active.client;

  if (req.method === 'GET') {
    const visitId = clean(req.query?.id);

    if (visitId) {
      try {
        const { data, error } = await supabase.from('visitas').select('*').eq('id', visitId).maybeSingle();
        if (error) return res.status(500).json({ error: error.message });
        if (!data) return res.status(404).json({ error: 'Visita não encontrada.' });

        const unitMap = await readUnitMap(supabase);
        const notes = enrichNotesWithUnit(data.notes, unitMap.get(clean(data.unidade_id)) || '');
        const photos = await hydratePhotos(supabase, data, true);
        return res.status(200).json({
          ok: true,
          source: active.label,
          server_time: new Date().toISOString(),
          visit: normalizeVisit(data, { photos, photoCount: photos.length, notes })
        });
      } catch (error) {
        return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
      }
    }

    try {
      const { data, error } = await supabase
        .from('visitas')
        .select('*')
        .order('created_at', { ascending: false, nullsFirst: false })
        .limit(1000);

      if (error) return res.status(500).json({ error: error.message, data: [] });

      const unitMap = await readUnitMap(supabase);
      const countMap = await structuredPhotoCountMap(supabase);
      const list = (data || []).map((row) => {
        const notes = enrichNotesWithUnit(row.notes, unitMap.get(clean(row.unidade_id)) || '');
        const legacyCount = parsePhotoPayload(row.notes).photos.length;
        const photoCount = Math.max(Number(countMap.get(clean(row.id)) || 0), legacyCount);
        return normalizeVisit(row, { photos: [], photoCount, notes });
      });

      return res.status(200).json({
        data: list,
        count: list.length,
        source: active.label,
        server_time: new Date().toISOString()
      });
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
        const { data: row, error: readError } = await supabase.from('visitas').select('id, notes').eq('id', visitId).maybeSingle();
        if (readError) return res.status(500).json({ error: readError.message });
        if (!row) return res.status(404).json({ error: 'Visita não encontrada.' });

        const metadata = await uploadSinglePhoto(supabase, visitId, body.photo || body, 0);
        const photoCount = await photoCountForVisit(supabase, visitId, row.notes);
        return res.status(200).json({ ok: true, source: active.label, photo: metadata, photo_count: photoCount });
      } catch (error) {
        return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
      }
    }

    try {
      const visit = body.visit || body;
      const legacyPhotos = Array.isArray(visit.photos || visit.fotos) ? (visit.photos || visit.fotos) : [];
      const cleanNotes = parsePhotoPayload(clean(visit.notes || '')).text;
      const clientId = clean(visit.client_id || extractClientId(cleanNotes));

      if (clientId) {
        const { data: existing, error: existingError } = await supabase
          .from('visitas')
          .select('*')
          .eq('client_id', clientId)
          .maybeSingle();
        if (existingError) return res.status(500).json({ error: existingError.message });
        if (existing) {
          const photoCount = await photoCountForVisit(supabase, existing.id, existing.notes);
          return res.status(200).json({
            ok: true,
            deduplicated: true,
            source: active.label,
            visit: normalizeVisit(existing, { photos: [], photoCount })
          });
        }
      }

      const record = {
        client_id: clientId || null,
        visitor_name: clean(visit.visitor_name || visit.representante || sessionUser.name || 'GIN 6ª CRE'),
        unidade_id: clean(visit.unidade_id || visit.designacao || ''),
        visit_date: clean(visit.visit_date || new Date().toISOString().slice(0, 10)),
        notes: cleanNotes,
        created_by: clean(sessionUser.email || visit.created_by || 'app')
      };

      const { data: inserted, error: insertError } = await supabase.from('visitas').insert([record]).select('*').single();
      if (insertError) {
        if (clientId && String(insertError.code || '') === '23505') {
          const { data: existing } = await supabase.from('visitas').select('*').eq('client_id', clientId).maybeSingle();
          if (existing) {
            const photoCount = await photoCountForVisit(supabase, existing.id, existing.notes);
            return res.status(200).json({
              ok: true,
              deduplicated: true,
              source: active.label,
              visit: normalizeVisit(existing, { photos: [], photoCount })
            });
          }
        }
        return res.status(500).json({ error: insertError.message });
      }

      let photoCount = 0;
      const photoErrors = [];
      for (let index = 0; index < legacyPhotos.length; index += 1) {
        try {
          await uploadSinglePhoto(supabase, inserted.id, legacyPhotos[index], index);
          photoCount += 1;
        } catch (error) {
          photoErrors.push(`Foto ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      return res.status(200).json({
        ok: true,
        source: active.label,
        visit: normalizeVisit(inserted, { photos: [], photoCount }),
        photo_errors: photoErrors
      });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
