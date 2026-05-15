import { FormEvent, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const ADMIN_EMAIL = 'thaisopalka@gmail.com';

export default function Login() {
  const [mode, setMode] = useState<'password' | 'magic'>('password');
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

    setSubmitting(true);
    setMessage('');

    if (mode === 'password') {
      const { error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password
      });

      if (error) {
        setMessage('Não foi possível entrar. Confira o e-mail e a senha.');
        setSubmitting(false);
      } else {
        window.location.assign('/');
      }

      return;
    }

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

  const handleCreateAdmin = async () => {
    const trimmedEmail = email.trim();
    if (trimmedEmail.toLowerCase() !== ADMIN_EMAIL) {
      return;
    }

    if (!password) {
      setMessage('Digite uma senha para criar o acesso da administradora.');
      return;
    }

    setSubmitting(true);
    setMessage('');

    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password
    });

    if (error) {
      if (error.message.toLowerCase().includes('already registered')) {
        setMessage('Este e-mail já existe. Use a opção Entrar com senha.');
      } else {
        setMessage('Não foi possível criar o acesso. Confira o e-mail e tente novamente.');
      }
      setSubmitting(false);
      return;
    }

    const user = data.user ?? data.session?.user;
    if (!user) {
      setMessage('Não foi possível criar o acesso. Tente novamente.');
      setSubmitting(false);
      return;
    }

    const { error: profileError } = await supabase.from('user_profiles').upsert({
      id: user.id,
      email: ADMIN_EMAIL,
      display_name: 'Thaís Opalka',
      full_name: 'Thaís Opalka',
      role: 'admin',
      status: 'ATIVO'
    });

    if (profileError) {
      setMessage('Acesso criado, mas não foi possível gravar o perfil. Tente novamente.');
      setSubmitting(false);
      return;
    }

    setMessage('Acesso da administradora criado. Agora entre com e-mail e senha.');
    setSubmitting(false);
  };

  const showAdminSignup = email.trim().toLowerCase() === ADMIN_EMAIL;

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>GINFOTOS 6ª CRE</h1>
        <h3 className="login-sub">Sistema de Visitas Técnicas — E/6ª CRE/GIN</h3>
        <p className="login-desc">Acesso restrito a usuários autorizados</p>

        <div className="login-mode-group">
          <button
            type="button"
            className={`mode-button ${mode === 'password' ? 'active' : ''}`}
            onClick={() => setMode('password')}
          >
            Entrar com senha
          </button>
          <button
            type="button"
            className={`mode-button ${mode === 'magic' ? 'active' : ''}`}
            onClick={() => setMode('magic')}
          >
            Link mágico
          </button>
        </div>

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

          {mode === 'password' ? (
            <>
              <label htmlFor="password">Senha</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Digite sua senha"
                required
              />
              <p className="login-hint">Use sua senha de administradora para acessar.</p>
            </>
          ) : (
            <p className="login-hint">Digite seu e-mail completo para receber o link mágico.</p>
          )}

          <button className="primary large" type="submit" disabled={submitting}>
            {submitting
              ? mode === 'password'
                ? 'Entrando...'
                : 'Enviando...'
              : mode === 'password'
              ? 'ENTRAR COMO ADMINISTRADORA'
              : 'ENVIAR LINK MÁGICO'}
          </button>

          {mode === 'password' && showAdminSignup && (
            <div className="admin-first-access">
              <p className="admin-first-access-title">Primeiro acesso da administradora</p>
              <button
                type="button"
                className="secondary large"
                disabled={submitting}
                onClick={handleCreateAdmin}
              >
                {submitting ? 'Criando...' : 'CRIAR ACESSO DA ADMINISTRADORA'}
              </button>
              <p className="admin-first-access-hint">
                Crie o acesso inicial para a administradora diretamente pelo app.
              </p>
            </div>
          )}
        </form>

        {message && <p className="notice">{message}</p>}
      </div>

      <div className="login-footer">DESENVOLVIDO POR THAÍS OPALKA</div>
    </div>
  );
}
