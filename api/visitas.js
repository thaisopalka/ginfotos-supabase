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
    // O upload abaixo devolve o erro real se o bucket nao estiver disponivel.
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

async function uploadSinglePhoto(supabase, visitId, photo, index = 0) {
  const decoded = decodeDataUrl(photo?.dataUrl);
  if (!decoded) return { metadata: null, error: 'Arquivo de foto invalido.' };

  await ensurePhotoBucket(supabase);
  const original = safeName(photo?.name || `foto-${index + 1}.jpg`);
  const stem = original.replace(/\.[^.]+$/, '') || `foto-${index + 1}`;
  const extension = decoded.contentType === 'image/png' ? 'png' : 'jpg';
  const path = `${visitId}/${Date.now()}-${index + 1}-${stem}.${extension}`;

  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, decoded.buffer, {
    contentType: decoded.contentType,
    cacheControl: '3600',
    upsert: true
  });

  if (error) return { metadata: null, error: error.message };
  return {
    metadata: { name: original, caption: clean(photo?.caption), path },
    error: ''
  };
}

async function uploadVisitPhotos(supabase, visitId, photos) {
  const metadata = [];
  const errors = [];
  for (let index = 0; index < photos.length; index += 1) {
    const result = await uploadSinglePhoto(supabase, visitId, photos[index], index);
    if (result.metadata) metadata.push(result.metadata);
    if (result.error) errors.push(`Foto ${index + 1}: ${result.error}`);
  }
  return { metadata, errors };
}

async function migrateEmbeddedPhotos(supabase, row) {
  const parsed = parsePhotoPayload(row.notes);
  if (!parsed.photos.some((photo) => clean(photo?.dataUrl))) return row;

  const migrated = [];
  let changed = false;

  for (let index = 0; index < parsed.photos.length; index += 1) {
    const photo = parsed.photos[index] || {};
    if (!clean(photo.dataUrl)) {
      migrated.push({
        name: clean(photo.name || `foto-${index + 1}.jpg`),
        caption: clean(photo.caption),
        path: clean(photo.path || photo.storagePath)
      });
      continue;
    }

    const uploaded = await uploadSinglePhoto(supabase, row.id, photo, index);
    if (uploaded.metadata) {
      migrated.push(uploaded.metadata);
      changed = true;
    } else {
      migrated.push({
        name: clean(photo.name || `foto-${index + 1}.jpg`),
        caption: clean(photo.caption),
        dataUrl: clean(photo.dataUrl)
      });
    }
  }

  if (!changed) return row;
  const notes = withPhotoPayload(parsed.text, migrated);
  const { data, error } = await supabase
    .from('visitas')
    .update({ notes })
    .eq('id', row.id)
    .select('*')
    .single();
  return !error && data ? data : { ...row, notes };
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
    let url = '';
    if (photo.path) url = await signedUrlForPath(supabase, photo.path);
    else if (photo.dataUrl) url = photo.dataUrl;
    hydrated.push({
      name: photo.name || 'Foto da visita',
      caption: photo.caption || '',
      path: photo.path || '',
      url
    });
  }
  return hydrated;
}

function normalizeVisit(row, photos = null, notesOverride = null) {
  const parsed = parsePhotoPayload(notesOverride === null ? row.notes : notesOverride);
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

async function readUnitMap(supabase) {
  const tables = ['unidades', 'unidades_escolares', 'base_oficial_ginfotos_unidades_supabase'];
  for (const table of tables) {
    try {
      const { data, error } = await supabase.from(table).select('*').limit(2000);
      if (error || !Array.isArray(data) || data.length === 0) continue;
      const map = new Map();
      for (const row of data) {
        const id = clean(row.id);
        const designacao = clean(row.designacao || row.DESIGNACAO || row['DESIGNAÇÃO'] || row.codigo);
        const name = clean(row.name || row.nome || row.unidade || row.unidade_escolar || row['UNIDADE ESCOLAR'] || row.escola);
        const bairro = clean(row.bairro || row.BAIRRO);
        const telefone = clean(row.telefone || row.TELEFONE);
        const diretor = clean(row.diretor_geral || row.diretorGeral || row['DIRETOR(A) GERAL'] || row['DIRETOR GERAL']);
        const notes = [
          `Designacao: ${designacao || id || 'Nao informado'}`,
          `Unidade escolar: ${name || 'Nao informado'}`,
          `Bairro: ${bairro || 'Nao informado'}`,
          `Telefone: ${telefone || 'Nao informado'}`,
          `Diretor: ${diretor || 'Nao informado'}`
        ].join('\n');
        if (id) map.set(id, notes);
        if (designacao) map.set(designacao, notes);
        if (designacao) map.set(designacao.replace(/\./g, '-'), notes);
      }
      return map;
    } catch {
      // tenta a proxima tabela
    }
  }
  return new Map();
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
      if (!data) return res.status(404).json({ error: 'Visita nao encontrada.' });

      const migrated = await migrateEmbeddedPhotos(supabase, data);
      const photos = await hydratePhotos(supabase, migrated, true);
      return res.status(200).json({ ok: true, visit: normalizeVisit(migrated, photos) });
    }

    // IMPORTANTE: a lista nao baixa o campo notes. Visitas antigas podem conter fotos em base64
    // dentro de notes e deixar a resposta grande demais para celular/Vercel. Os detalhes sao
    // carregados somente quando o usuario toca em ABRIR.
    const { data, error } = await supabase
      .from('visitas')
      .select('id, visitor_name, unidade_id, visit_date, created_by, created_at')
      .order('visit_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1000);

    if (error) return res.status(500).json({ error: error.message, data: [] });

    const unitMap = await readUnitMap(supabase);
    const list = (data || []).map((row) => {
      const unitNotes = unitMap.get(clean(row.unidade_id)) || '';
      return normalizeVisit({ ...row, notes: unitNotes }, [], unitNotes);
    });
    return res.status(200).json({ data: list, count: list.length });
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const action = clean(req.query?.action);
    const visitId = clean(req.query?.id || body.visit_id || body.id);

    if (action === 'add-photo') {
      if (!visitId) return res.status(400).json({ error: 'ID da visita ausente.' });
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
      return res.status(200).json({ ok: true, visit: normalizeVisit(updated, photos) });
    }

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

    // Compatibilidade com versoes antigas do app. As novas enviam uma foto por requisicao.
    if (legacyPhotos.length > 0) {
      const uploaded = await uploadVisitPhotos(supabase, inserted.id, legacyPhotos);
      const notes = withPhotoPayload(record.notes, uploaded.metadata);
      const { data: updated } = await supabase
        .from('visitas')
        .update({ notes })
        .eq('id', inserted.id)
        .select('*')
        .single();
      const finalRow = updated || { ...inserted, notes };
      return res.status(200).json({
        ok: true,
        visit: normalizeVisit(finalRow, null),
        photo_errors: uploaded.errors
      });
    }

    return res.status(200).json({ ok: true, visit: normalizeVisit(inserted, []) });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
