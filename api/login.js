import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Check admin credentials
  if (email === adminEmail && password === adminPassword) {
    return res.status(200).json({
      ok: true,
      user: {
        email: adminEmail,
        name: 'Thaís Opalka',
        role: 'admin',
        status: 'ATIVO'
      }
    });
  }

  // Check app users in Supabase
  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Supabase configuration missing' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { data: user, error } = await supabase
      .from('app_users')
      .select('id, email, name, role, status, temporary_password')
      .eq('email', email)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (user.status !== 'ATIVO') {
      return res.status(403).json({ error: 'Acesso bloqueado pela administração.' });
    }

    if (user.temporary_password !== password) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    return res.status(200).json({
      ok: true,
      user: {
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
