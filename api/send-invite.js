import nodemailer from 'nodemailer';

function inviteHtml({ name, email, password, inviteText }) {
  const safeName = name || 'usuário(a)';
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#0f172a;max-width:620px;margin:auto;border:1px solid #dbe3ef;border-radius:18px;padding:24px;background:#ffffff">
      <h2 style="color:#10243f;margin-top:0">GINFOTOS 6ª CRE</h2>
      <p>Olá, <strong>${safeName}</strong>.</p>
      <p>Seu acesso ao aplicativo <strong>GINFOTOS 6ª CRE</strong> foi criado.</p>
      <div style="background:#f1f5f9;border-radius:14px;padding:16px;margin:18px 0">
        <p style="margin:0 0 8px"><strong>Link de acesso:</strong><br><a href="https://ginfotos-supabase.vercel.app">https://ginfotos-supabase.vercel.app</a></p>
        <p style="margin:0 0 8px"><strong>E-mail:</strong><br>${email}</p>
        <p style="margin:0"><strong>Senha provisória:</strong><br>${password || '[senha não informada]'}</p>
      </div>
      <p>Após entrar, guarde seus dados de acesso com segurança.</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0" />
      <pre style="white-space:pre-wrap;font-family:Arial,Helvetica,sans-serif;background:#fafafa;border-radius:12px;padding:12px;color:#334155">${inviteText || ''}</pre>
    </div>
  `;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, name, password, inviteText } = req.body || {};
  if (!email) return res.status(400).json({ error: 'E-mail do usuário é obrigatório.' });

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  if (!host || !user || !pass || !from) {
    return res.status(500).json({
      error: 'SMTP não configurado no Vercel. Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS e SMTP_FROM.'
    });
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });

    await transporter.sendMail({
      from,
      to: email,
      subject: 'Seu acesso ao GINFOTOS 6ª CRE',
      text: inviteText || `Olá! Seu acesso ao GINFOTOS 6ª CRE foi criado.\n\nAcesse: https://ginfotos-supabase.vercel.app\nE-mail: ${email}\nSenha provisória: ${password || '[senha não informada]'}`,
      html: inviteHtml({ name, email, password, inviteText })
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Falha ao enviar convite por e-mail.' });
  }
}
