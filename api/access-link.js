import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { requireSession } from './_session.js';

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

async function saveMagicLink(email, name, role, token) {
  const candidates = buildSupabaseCandidates();
  if (candidates.length === 0) throw new Error('Configuração do Supabase ausente no Vercel.');

  const errors = [];
  for (const candidate of candidates) {
    try {
      const { error: userError } = await candidate.client
        .from('app_users')
        .upsert([{
          email,
          name,
          role,
          status: 'ATIVO',
          magic_token: token,
          created_by: 'admin'
        }], { onConflict: 'email' });

      const { data: existing, error: readError } = await candidate.client
        .from('ginfotos_access_links')
        .select('token,email')
        .eq('email', email)
        .maybeSingle();

      if (readError) throw readError;

      let linkError = null;
      if (existing) {
        const { error } = await candidate.client
          .from('ginfotos_access_links')
          .update({ token, name, role, status: 'ATIVO' })
          .eq('email', email);
        linkError = error;
      } else {
        const { error } = await candidate.client
          .from('ginfotos_access_links')
          .insert([{ token, email, name, role, status: 'ATIVO' }]);
        linkError = error;
      }

      if (!userError && !linkError) return candidate.label;
      errors.push(`${candidate.label}: ${userError?.message || ''} ${linkError?.message || ''}`.trim());
    } catch (error) {
      errors.push(`${candidate.label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(errors.join(' | ') || 'Não foi possível gravar o link mágico.');
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sessionUser = requireSession(req, res);
  if (!sessionUser) return;
  if (String(sessionUser.role || '').toLowerCase() !== 'admin') {
    return res.status(403).json({ error: 'Somente a administradora pode gerar links de acesso.' });
  }

  const email = clean(req.body?.email).toLowerCase();
  const name = clean(req.body?.name);
  const role = clean(req.body?.role || 'gin').toLowerCase();
  if (!email || !name) return res.status(400).json({ error: 'Nome e e-mail são obrigatórios.' });
  if (!['gin', 'admin'].includes(role)) return res.status(400).json({ error: 'Perfil inválido para link direto.' });

  const token = `${role === 'admin' ? 'adm' : 'gin'}_${crypto.randomBytes(16).toString('hex')}`;

  try {
    const source = await saveMagicLink(email, name, role, token);
    const origin = `https://${req.headers.host}`;
    return res.status(200).json({
      ok: true,
      link: `${origin}/login?acesso=${encodeURIComponent(token)}`,
      email,
      name,
      role,
      source
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Não foi possível gerar o link mágico.'
    });
  }
}
