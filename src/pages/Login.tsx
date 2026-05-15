import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function Login() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedEmail = email.trim();
    if (!trimmedEmail.includes('@') || !trimmedEmail.includes('.')) {
      setMessage('Digite um e-mail completo. Exemplo: thaisopalka@gmail.com');
      return;
    }

    setSubmitting(true);
    setMessage('Enviando link mágico...');

    const { error } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
      options: {
        emailRedirectTo: window.location.origin
      }
    });

    if (error) {
      setMessage(`Erro ao enviar e-mail: ${error.message}`);
    } else {
      setMessage('Verifique seu e-mail para acessar a aplicação.');
    }

    setSubmitting(false);
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
          <p className="login-hint">Digite seu e-mail completo para receber o link mágico.</p>

          <button className="primary large" type="submit" disabled={submitting}>
            {submitting ? 'Enviando...' : 'ENVIAR LINK MÁGICO'}
          </button>
        </form>

        {message && <p className="notice">{message}</p>}
      </div>

      <div className="login-footer">DESENVOLVIDO POR THAÍS OPALKA</div>
    </div>
  );
}
