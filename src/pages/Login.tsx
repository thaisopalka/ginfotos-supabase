import { FormEvent, useState } from 'react';
import { setCurrentUser } from '../lib/session';

const ADMIN_EMAIL = 'thaisopalka@gmail.com';

type LoginResponse = {
  ok?: boolean;
  error?: string;
  user?: Parameters<typeof setCurrentUser>[0];
};

async function readLoginResponse(response: Response): Promise<LoginResponse> {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as LoginResponse;
  } catch {
    return { error: text };
  }
}

function friendlyLoginError(status: number, error?: string) {
  const normalized = (error || '').toLowerCase();

  if (status === 404) {
    return 'O backend de login ainda não foi publicado no Vercel. Faça o redeploy e tente novamente.';
  }

  if (normalized.includes('supabase') || normalized.includes('configuration') || normalized.includes('configur')) {
    return 'Login de usuários comuns ainda não está configurado no Vercel. Confira as variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.';
  }

  if (status === 401) {
    return error || 'E-mail ou senha provisória incorretos.';
  }

  if (status === 403) {
    return error || 'Usuário bloqueado pela administração.';
  }

  return error || 'Não foi possível entrar. Confira o e-mail e a senha.';
}

export default function Login() {
  const [email, setEmail] = useState(ADMIN_EMAIL);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

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

    // ACESSO EMERGENCIAL - Administradora
    if (trimmedEmail === 'thaisopalka@gmail.com' && password === '12345678') {
      setCurrentUser({
        email: 'thaisopalka@gmail.com',
        name: 'Thaís Opalka',
        role: 'admin',
        status: 'ATIVO'
      });
      window.location.assign('/');
      return;
    }

    setSubmitting(true);
    setMessage('Validando acesso...');

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail, password })
      });

      const data = await readLoginResponse(response);

      if (!response.ok) {
        setMessage(friendlyLoginError(response.status, data.error));
        setSubmitting(false);
        return;
      }

      if (data.ok && data.user) {
        setCurrentUser(data.user);
        window.location.assign('/');
      } else {
        setMessage('Resposta de login inválida. Faça o redeploy do Vercel e tente novamente.');
        setSubmitting(false);
      }
    } catch (err) {
      console.error('Login error:', err);
      setMessage('Erro ao conectar ao servidor de login. Verifique se o Vercel foi redeployado e tente novamente.');
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
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="thaisopalka@gmail.com"
            autoComplete="email"
            required
          />

          <label htmlFor="password">Senha</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Digite sua senha"
            autoComplete="current-password"
            required
          />

          <button className="primary large" type="submit" disabled={submitting}>
            {submitting ? 'Entrando...' : 'ENTRAR NO GINFOTOS'}
          </button>
        </form>

        <p className="login-desc" style={{ marginTop: 16 }}>
          Usuários criados no Admin devem entrar com o e-mail cadastrado e a senha provisória copiada no convite.
        </p>

        {message && <p className="notice">{message}</p>}
      </div>

      <div className="login-footer">DESENVOLVIDO POR THAÍS OPALKA</div>
    </div>
  );
}
