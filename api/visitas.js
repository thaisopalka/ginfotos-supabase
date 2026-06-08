import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function clean(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function normalizeVisit(row) {
  return {
    id: row.id,
    visitor_name: clean(row.visitor_name),
    unidade_id: clean(row.unidade_id),
    visit_date: clean(row.visit_date),
    notes: clean(row.notes),
    created_by: clean(row.created_by),
    created_at: clean(row.created_at)
  };
}

function appendPhotosToNotes(notes, photos) {
  if (!Array.isArray(photos) || photos.length === 0) return notes;
  const compact = photos.slice(0, 8).map((photo, index) => ({
    name: clean(photo.name || `foto-${index + 1}.jpg`),
    caption: clean(photo.caption || ''),
    dataUrl: clean(photo.dataUrl || '')
  })).filter((photo) => photo.dataUrl);
  if (compact.length === 0) return notes;
  return `${notes || ''}\nGINFOTOS_JSON:${JSON.stringify({ fotos: compact })}`;
}

export default async function handler(req, res) {
  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: 'SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente no Vercel.' });

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('visitas')
      .select('*')
      .order('visit_date', { ascending: false })
      .limit(1000);

    if (error) return res.status(500).json({ error: error.message, data: [] });
    return res.status(200).json({ data: (data || []).map(normalizeVisit), count: data?.length || 0 });
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const visit = body.visit || body;
    const record = {
      visitor_name: clean(visit.visitor_name || visit.representante || 'ENGA. MARCIA BRAGA'),
      unidade_id: clean(visit.unidade_id || visit.designacao || ''),
      visit_date: clean(visit.visit_date || new Date().toISOString().slice(0, 10)),
      notes: appendPhotosToNotes(clean(visit.notes || ''), visit.photos || visit.fotos || []),
      created_by: clean(visit.created_by || 'app')
    };

    const { data, error } = await supabase
      .from('visitas')
      .insert([record])
      .select('id, visitor_name, unidade_id, visit_date, notes, created_by, created_at')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, visit: normalizeVisit(data) });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
