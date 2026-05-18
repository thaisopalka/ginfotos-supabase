import { FormEvent, useState } from 'react';
import { setCurrentUser } from '../lib/session';

const ADMIN_EMAIL = 'thaisopalka@gmail.com';

export default function Login() {
  const [email, setEmail] = useState(ADMIN_EMAIL);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedEmail = email.trim();
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
    setMessage('');

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail, password })
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || 'Não foi possível entrar. Confira o e-mail e a senha.');
        setSubmitting(false);
        return;
      }

      if (data.ok && data.user) {
        setCurrentUser(data.user);
        window.location.assign('/');
      } else {
        setMessage('Não foi possível entrar. Confira o e-mail e a senha.');
        setSubmitting(false);
      }
    } catch (err) {
      console.error('Login error:', err);
      setMessage('Erro ao conectar ao servidor. Tente novamente.');
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
            required
          />

          <label htmlFor="password">Senha</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Digite sua senha"
            required
          />

          <button className="primary large" type="submit" disabled={submitting}>
            {submitting ? 'Entrando...' : 'ENTRAR NO GINFOTOS'}
          </button>
        </form>

        {message && <p className="notice">{message}</p>}
      </div>

      <div className="login-footer">DESENVOLVIDO POR THAÍS OPALKA</div>
    </div>
  );
}
