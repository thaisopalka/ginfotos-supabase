import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { requireSession } from './_session.js';

function normalizeSupabaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try { return new URL(raw).origin; }
  catch { return raw.replace(/\/+rest\/v1\/?$/i, '').replace(/\/+$/, ''); }
}

function clean(value) {
  return String(value || '').trim();
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

  const supabaseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const supabaseServiceKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !supabaseServiceKey) return res.status(500).json({ error: 'Configuração do Supabase ausente no Vercel.' });

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });

  const token = crypto.randomBytes(32).toString('base64url');
  const { data: existing, error: readError } = await supabase
    .from('ginfotos_access_links')
    .select('email')
    .eq('email', email)
    .maybeSingle();

  if (readError) return res.status(500).json({ error: readError.message });

  if (existing) {
    const { error } = await supabase
      .from('ginfotos_access_links')
      .update({ token, name, role, status: 'ATIVO' })
      .eq('email', email);
    if (error) return res.status(500).json({ error: error.message });
  } else {
    const { error } = await supabase
      .from('ginfotos_access_links')
      .insert([{ token, email, name, role, status: 'ATIVO' }]);
    if (error) return res.status(500).json({ error: error.message });
  }

  const origin = `https://${req.headers.host}`;
  return res.status(200).json({
    ok: true,
    link: `${origin}/login?acesso=${encodeURIComponent(token)}`,
    email,
    name,
    role
  });
}
