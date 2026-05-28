import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = String(req.body?.token || '').trim();
  if (!token) return res.status(400).json({ error: 'Token ausente.' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) return res.status(500).json({ error: 'Configuração do Supabase ausente no Vercel.' });

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from('ginfotos_access_links')
    .select('token, email, name, role, status')
    .eq('token', token)
    .eq('status', 'ATIVO')
    .maybeSingle();

  if (error || !data) return res.status(401).json({ error: 'Link de acesso não encontrado ou bloqueado.' });

  return res.status(200).json({
    ok: true,
    user: {
      email: data.email,
      name: data.name,
      role: data.role || 'gin',
      status: 'ATIVO'
    }
  });
}
