import { FormEvent, useState } from 'react';

interface AccessLinkResponse {
  ok?: boolean;
  link?: string;
  error?: string;
}

export default function GerarAcesso() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('gin');
  const [link, setLink] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setLink('');
    setMessage('Gerando link direto sem senha...');

    try {
      const response = await fetch('/api/access-link', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), role })
      });
      const payload = await response.json().catch(() => ({})) as AccessLinkResponse;
      if (!response.ok || !payload.link) throw new Error(payload.error || 'Não foi possível gerar o link.');
      setLink(payload.link);
      setMessage('✅ Link direto criado. Ele entra no GINFOTOS sem pedir senha e renova a sessão automaticamente.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível gerar o link.');
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setMessage('✅ Link copiado. Agora é só enviar pelo WhatsApp.');
  };

  return (
    <div className="dashboard-page">
      <div className="top-row">
        <div>
          <p className="page-label">Administração</p>
          <h1>Gerar link direto</h1>
        </div>
      </div>

      <section className="page-card">
        <p className="page-description">Crie um link individual de acesso ao GINFOTOS. O usuário abre o link e entra sem digitar senha.</p>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14, marginTop: 18 }}>
          <div className="field"><label htmlFor="access-name">Nome</label><input id="access-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome completo" required /></div>
          <div className="field"><label htmlFor="access-email">E-mail</label><input id="access-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email@exemplo.com" required /></div>
          <div className="field"><label htmlFor="access-role">Perfil</label><select id="access-role" value={role} onChange={(event) => setRole(event.target.value)}><option value="gin">GIN</option><option value="admin">ADMIN</option></select></div>
          <button className="primary large" type="submit" disabled={loading}>{loading ? 'GERANDO LINK...' : '🔗 GERAR LINK DIRETO SEM SENHA'}</button>
        </form>

        {message && <p className="notice">{message}</p>}
        {link && <div className="page-card" style={{ marginTop: 16, boxShadow: 'none', background: '#f8fafc' }}><strong>Link criado:</strong><p style={{ wordBreak: 'break-all' }}>{link}</p><button type="button" className="primary" onClick={copyLink}>COPIAR LINK</button></div>}
      </section>
    </div>
  );
}
