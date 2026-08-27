import { createClient } from '@supabase/supabase-js';
import { setSessionCookie } from './_session.js';

function normalizeSupabaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try { return new URL(raw).origin; }
  catch { return raw.replace(/\/+rest\/v1\/?$/i, '').replace(/\/+$/, ''); }
}

function sessionUser(user) {
  return {
    email: String(user.email || '').toLowerCase(),
    name: String(user.name || ''),
    role: String(user.role || 'consulta'),
    status: 'ATIVO'
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const adminPassword = String(process.env.ADMIN_PASSWORD || '');
  const supabaseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const supabaseServiceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (adminEmail && adminPassword && email === adminEmail && password === adminPassword) {
    const user = sessionUser({ email: adminEmail, name: 'Thaís Opalka', role: 'admin' });
    setSessionCookie(res, user);
    return res.status(200).json({ ok: true, user });
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Supabase configuration missing' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });

  try {
    const { data: user, error } = await supabase
      .from('app_users')
      .select('id, email, name, role, status, temporary_password')
      .eq('email', email)
      .maybeSingle();

    if (error || !user || user.temporary_password !== password) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    if (user.status !== 'ATIVO') {
      return res.status(403).json({ error: 'Acesso bloqueado pela administração.' });
    }

    const safeUser = sessionUser(user);
    setSessionCookie(res, safeUser);
    return res.status(200).json({ ok: true, user: safeUser });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
