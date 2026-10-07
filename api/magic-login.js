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

  add(serviceUrl, serviceKey, 'servidor');
  add(publicUrl, serviceKey, 'url-publica-chave-servidor');
  add(publicUrl, publicKey, 'publico');
  add(serviceUrl, publicKey, 'url-servidor-chave-publica');
  return candidates;
}

async function findAccessLink(token) {
  const candidates = buildSupabaseCandidates();
  if (candidates.length === 0) throw new Error('Configuração do Supabase ausente no Vercel.');

  const errors = [];
  for (const candidate of candidates) {
    try {
      const { data, error } = await candidate.client
        .from('ginfotos_access_links')
        .select('token, email, name, role, status')
        .eq('token', token)
        .eq('status', 'ATIVO')
        .maybeSingle();

      if (!error && data) return { data, source: `${candidate.label}/access_links` };
      if (error) errors.push(`${candidate.label}/access_links: ${error.message}`);
    } catch (error) {
      errors.push(`${candidate.label}/access_links: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      const { data, error } = await candidate.client
        .from('app_users')
        .select('email, name, role, status, magic_token')
        .eq('magic_token', token)
        .eq('status', 'ATIVO')
        .maybeSingle();

      if (!error && data) return { data, source: `${candidate.label}/app_users` };
      if (error) errors.push(`${candidate.label}/app_users: ${error.message}`);
    } catch (error) {
      errors.push(`${candidate.label}/app_users: ${error instanceof Error ? error.message : String(error)}`);
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

function getToken(req) {
  if (req.method === 'GET') {
    return clean(req.query?.acesso || req.query?.token);
  }
  return clean(req.body?.token || req.body?.acesso);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');

  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = getToken(req);
  if (!token) {
    if (req.method === 'GET') return res.redirect(302, '/login?erro=token-ausente');
    return res.status(400).json({ error: 'Token ausente.' });
  }

  let found;
  try {
    found = await findAccessLink(token);
  } catch (error) {
    if (req.method === 'GET') return res.redirect(302, '/login?erro=servidor');
    return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }

  if (!found.data) {
    if (req.method === 'GET') return res.redirect(302, '/login?erro=link-invalido');
    return res.status(401).json({ error: 'Link mágico não encontrado ou bloqueado.' });
  }

  const role = clean(found.data.role).toLowerCase();
  if (!['gin', 'admin'].includes(role)) {
    if (req.method === 'GET') return res.redirect(302, '/login?erro=perfil-invalido');
    return res.status(403).json({ error: 'Este link não possui perfil de acesso válido.' });
  }

  const user = safeUser(found.data);
  const sessionToken = setSessionCookie(res, user);

  if (req.method === 'GET') {
    res.setHeader('Location', '/?acesso=ok');
    return res.status(302).end();
  }

  return res.status(200).json({
    ok: true,
    user,
    token: sessionToken,
    source: found.source
  });
}
