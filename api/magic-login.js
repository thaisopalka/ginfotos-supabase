import { createClient } from '@supabase/supabase-js';
import { setSessionCookie } from './_session.js';

function clean(value) {
  return String(value || '').trim();
}

function normalizeSupabaseUrl(value) {
  const raw = clean(value);
  if (!raw) return '';
  try { return new URL(raw).origin; }
  catch { return raw.replace(/\/+rest\/v1\/?$/i, '').replace(/\/+$/, ''); }
}

function buildSupabaseCandidates() {
  const serviceUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL);
  const publicUrl = normalizeSupabaseUrl(process.env.VITE_SUPABASE_URL);
  const serviceKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const publicKey = clean(process.env.VITE_SUPABASE_ANON_KEY);

  const candidates = [];
  const seen = new Set();

  const add = (url, key, label) => {
    if (!url || !key) return;
    const signature = `${url}|${key.slice(0, 12)}`;
    if (seen.has(signature)) return;
    seen.add(signature);
    candidates.push({
      label,
      client: createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      })
    });
  };

  // Tenta todas as combinações usadas pelo restante do GINFOTOS.
  // Isso evita que um SUPABASE_URL antigo impeça o link direto de funcionar
  // quando VITE_SUPABASE_URL já aponta para a base oficial atual.
  add(serviceUrl, serviceKey, 'servidor');
  add(publicUrl, serviceKey, 'url-publica-chave-servidor');
  add(publicUrl, publicKey, 'publico');
  add(serviceUrl, publicKey, 'url-servidor-chave-publica');

  return candidates;
}

async function findAccessLink(token) {
  const candidates = buildSupabaseCandidates();
  if (candidates.length === 0) {
    throw new Error('Configuração do Supabase ausente no Vercel.');
  }

  const errors = [];
  for (const candidate of candidates) {
    try {
      const { data, error } = await candidate.client
        .from('ginfotos_access_links')
        .select('token, email, name, role, status')
        .eq('token', token)
        .eq('status', 'ATIVO')
        .maybeSingle();

      if (!error && data) {
        return { data, source: candidate.label };
      }

      if (error) errors.push(`${candidate.label}: ${error.message}`);
    } catch (error) {
      errors.push(`${candidate.label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { data: null, source: '', errors };
}

function safeUser(user) {
  return {
    email: clean(user.email).toLowerCase(),
    name: clean(user.name),
    role: clean(user.role || 'gin').toLowerCase(),
    status: 'ATIVO'
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = clean(req.body?.token);
  if (!token) return res.status(400).json({ error: 'Token ausente.' });

  let found;
  try {
    found = await findAccessLink(token);
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }

  const data = found.data;
  if (!data) {
    return res.status(401).json({
      error: 'Link de acesso não encontrado ou bloqueado.'
    });
  }

  const role = clean(data.role).toLowerCase();
  if (!['gin', 'admin'].includes(role)) {
    return res.status(403).json({ error: 'Este link não possui perfil de acesso válido.' });
  }

  const user = safeUser(data);
  const tokenGenerated = setSessionCookie(res, user);

  return res.status(200).json({
    ok: true,
    user,
    token: tokenGenerated,
    source: found.source
  });
}
