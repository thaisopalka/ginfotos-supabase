import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function Login() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage('Enviando link mágico...');

    const { error } = await supabase.auth.signInWithOtp({
      email,
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
    <div className="page-card">
      <h1 className="page-title">Acesso por Magic Link</h1>
      <p className="page-description">Use seu e-mail para receber um link mágico e entrar em seguida.</p>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="seu@email.com"
            required
          />
        </div>
        <button className="primary" type="submit" disabled={submitting}>
          {submitting ? 'Enviando...' : 'Enviar link mágico'}
        </button>
      </form>
      {message && <p className="notice">{message}</p>}
    </div>
  );
}
