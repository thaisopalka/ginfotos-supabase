import { FormEvent, useEffect, useState } from 'react';
import { setCurrentUser } from '../lib/session';

const ADMIN_EMAIL = 'thaisopalka@gmail.com';
const MAGIC_ACCESS_KEY = 'ginfotos_magic_access';

type LoginResponse = {
  ok?: boolean;
  error?: string;
  user?: Parameters<typeof setCurrentUser>[0];
};

async function readLoginResponse(response: Response): Promise<LoginResponse> {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text) as LoginResponse; }
  catch { return { error: text }; }
}

function friendlyLoginError(status: number, error?: string) {
  const normalized = (error || '').toLowerCase();
  if (status === 404) return 'O backend de login ainda não foi publicado no Vercel. Faça o redeploy e tente novamente.';
  if (normalized.includes('supabase') || normalized.includes('configuration') || normalized.includes('configur')) return 'Login pelo Supabase ainda não está configurado. Use um link de acesso direto.';
  if (status === 401) return error || 'E-mail ou senha provisória incorretos.';
  if (status === 403) return error || 'Usuário bloqueado pela administração.';
  return error || 'Não foi possível entrar. Confira o e-mail e a senha.';
}

export default function Login() {
  const [email, setEmail] = useState(ADMIN_EMAIL);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const sessionNotice = sessionStorage.getItem('ginfotos_session_notice');
    if (sessionNotice) {
      setMessage(sessionNotice);
      sessionStorage.removeItem('ginfotos_session_notice');
    }

    const params = new URLSearchParams(window.location.search);
    const token = params.get('acesso');
    if (!token) return;

    try { localStorage.setItem(MAGIC_ACCESS_KEY, token); } catch { /* ignore */ }
    setMessage('Validando link de acesso...');
    fetch('/api/magic-login', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      body: JSON.stringify({ token })
    })
      .then(async (response) => {
        const data = await readLoginResponse(response);
        if (!response.ok || !data.ok || !data.user) throw new Error(data.error || 'Link inválido.');
        setCurrentUser(data.user);
        window.location.assign('/');
      })
      .catch((error) => {
        try { localStorage.removeItem(MAGIC_ACCESS_KEY); } catch { /* ignore */ }
        setMessage(error instanceof Error ? error.message : 'Não foi possível entrar pelo link de acesso.');
        window.history.replaceState({}, document.title, '/login');
      });
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail.includes('@') || !trimmedEmail.includes('.')) {
      setMessage('Digite um e-mail completo. Exemplo: thaisopalka@gmail.com');
      return;
    }
    if (!password) {
      setMessage('Digite a senha.');
      return;
    }

    setSubmitting(true);
    setMessage('Validando acesso e renovando a sessão...');

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        body: JSON.stringify({ email: trimmedEmail, password })
      });
      const data = await readLoginResponse(response);

      if (!response.ok) {
        setMessage(friendlyLoginError(response.status, data.error));
        setSubmitting(false);
        return;
      }

      if (data.ok && data.user) {
        try { localStorage.removeItem(MAGIC_ACCESS_KEY); } catch { /* ignore */ }
        setCurrentUser(data.user);
        window.location.assign('/');
      } else {
        setMessage('Resposta de login inválida. Atualize o app e tente novamente.');
        setSubmitting(false);
      }
    } catch (err) {
      console.error('Login error:', err);
      setMessage('Erro ao conectar ao servidor de login. Tente novamente ou use seu link de acesso direto.');
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>GINFOTOS 6ª CRE</h1>
        <h3 className="login-sub">Sistema de Visitas Técnicas — E/6ª CRE/GIN</h3>
        <p className="login-desc">Acesso restrito a usuários autorizados</p>

        <form onSubmit={handleSubmit} className="login-form">
          <label htmlFor="email">E-mail</label>
          <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="thaisopalka@gmail.com" autoComplete="email" required />

          <label htmlFor="password">Senha</label>
          <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Digite sua senha" autoComplete="current-password" required />

          <button className="primary large" type="submit" disabled={submitting}>{submitting ? 'RENOVANDO ACESSO...' : 'ENTRAR NO GINFOTOS'}</button>
        </form>

        <p className="login-desc" style={{ marginTop: 16 }}>Se você recebeu um link de acesso direto da administradora, abra novamente esse link para renovar sua sessão automaticamente.</p>
        {message && <p className="notice">{message}</p>}
      </div>
    </div>
  );
}
