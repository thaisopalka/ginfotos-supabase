import { createClient } from '@supabase/supabase-js';
import { setSessionCookie } from './_session.js';

function normalizeSupabaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try { return new URL(raw).origin; }
  catch { return raw.replace(/\/+rest\/v1\/?$/i, '').replace(/\/+$/, ''); }
}

function safeUser(user) {
  return {
    email: String(user.email || '').toLowerCase(),
    name: String(user.name || ''),
    role: String(user.role || 'gin'),
    status: 'ATIVO'
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = String(req.body?.token || '').trim();
  if (!token) return res.status(400).json({ error: 'Token ausente.' });

  const supabaseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const supabaseServiceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !supabaseServiceKey) return res.status(500).json({ error: 'Configuração do Supabase ausente no Vercel.' });

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });

  const { data, error } = await supabase
    .from('ginfotos_access_links')
    .select('token, email, name, role, status')
    .eq('token', token)
    .eq('status', 'ATIVO')
    .maybeSingle();

  if (error || !data) return res.status(401).json({ error: 'Link de acesso não encontrado ou bloqueado.' });
  if (String(data.role || '').toLowerCase() !== 'gin') return res.status(403).json({ error: 'Este link não possui perfil GIN válido.' });

  const user = safeUser(data);
  setSessionCookie(res, user);
  return res.status(200).json({ ok: true, user });
}
