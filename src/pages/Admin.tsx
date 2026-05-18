import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

interface UserProfile {
  id: string;
  full_name?: string | null;
  email?: string | null;
  role?: string | null;
}

interface AppUser {
  id: string;
  email: string;
  name?: string | null;
  role: string;
  status: string;
  temporary_password?: string | null;
}

interface Invite {
  id: string;
  email: string;
  role?: string | null;
  invited_by?: string | null;
}

export default function Admin() {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [appUsers, setAppUsers] = useState<AppUser[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('consulta');
  const [message, setMessage] = useState('');
  const [appMessage, setAppMessage] = useState('');

  useEffect(() => {
    fetchAdminData();
  }, []);

  const fetchAdminData = async () => {
    const [{ data: profileData }, { data: invitesData }, { data: appUsersData }] = await Promise.all([
      supabase.from('user_profiles').select('*').order('email'),
      supabase.from('user_invites').select('*').order('email'),
      supabase.from('app_users').select('*').order('email')
    ]);

    if (profileData) setProfiles(profileData as UserProfile[]);
    if (invitesData) setInvites(invitesData as Invite[]);
    if (appUsersData) setAppUsers(appUsersData as AppUser[]);
  };

  const handleInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const { data: currentUser } = await supabase.auth.getUser();

    const { error } = await supabase.from('user_invites').insert([
      {
        email,
        role,
        invited_by: currentUser?.user?.id ?? null
      }
    ]);

    if (error) {
      setMessage(`Erro ao enviar convite: ${error.message}`);
    } else {
      setEmail('');
      setRole('user');
      setMessage('Convite enviado com sucesso. O usuário receberá um link de acesso por e-mail.');
      fetchAdminData();
    }
  };

  const generatePassword = () => {
    return Math.random().toString(36).slice(-8).toUpperCase();
  };

  const handleCreateAppUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppMessage('');

    if (!email || !name) {
      setAppMessage('Preencha todos os campos');
      return;
    }

    const tempPassword = generatePassword();

    const { error } = await supabase.from('app_users').insert([
      {
        email,
        name,
        role,
        status: 'ATIVO',
        temporary_password: tempPassword,
        created_by: 'admin'
      }
    ]);

    if (error) {
      setAppMessage(`Erro ao criar usuário: ${error.message}`);
    } else {
      setAppMessage(`✓ Usuário criado com sucesso. Senha provisória: ${tempPassword}`);
      setEmail('');
      setName('');
      setRole('consulta');
      fetchAdminData();
    }
  };

  const handleToggleStatus = async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'ATIVO' ? 'BLOQUEADO' : 'ATIVO';

    const { error } = await supabase.from('app_users').update({ status: newStatus }).eq('id', userId);

    if (error) {
      setAppMessage(`Erro ao atualizar: ${error.message}`);
    } else {
      fetchAdminData();
    }
  };

  const handleDeleteAppUser = async (userId: string) => {
    if (!window.confirm('Tem certeza que deseja remover este usuário?')) return;

    const { error } = await supabase.from('app_users').delete().eq('id', userId);

    if (error) {
      setAppMessage(`Erro ao remover: ${error.message}`);
    } else {
      fetchAdminData();
    }
  };

  const handleCopyInvite = (user: AppUser) => {
    const inviteText = `Olá! Seu acesso ao GINFOTOS 6ª CRE foi criado.

Acesse:
https://ginfotos-supabase.vercel.app

E-mail:
${user.email}

Senha provisória:
${user.temporary_password || '[SEM SENHA]'}`;

    navigator.clipboard.writeText(inviteText);
    setAppMessage('✓ Convite copiado para a área de transferência');
  };

  return (
    <div>
      <div className="page-card">
        <h1 className="page-title">ADMINISTRAÇÃO</h1>
        <p className="page-description">Painel administrativo para convites, perfis de usuário e controle de acesso.</p>
        <form onSubmit={handleInvite}>
          <div className="field">
            <label htmlFor="email">Nome</label>
            <input id="invite-name" type="text" placeholder="Nome completo" />
          </div>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="role">Perfil</label>
            <select id="role" value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="user">Usuário</option>
              <option value="manager">Gerente</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
          <button className="primary" type="submit">Criar e Enviar Convite</button>
        </form>
        {message && <p className="notice">{message}</p>}
      </div>

      <div className="page-card">
        <h2>Usuários do App</h2>
        <form onSubmit={handleCreateAppUser} className="admin-form">
          <div className="field">
            <label htmlFor="app-name">Nome</label>
            <input
              id="app-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nome completo"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="app-email">E-mail</label>
            <input
              id="app-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="email@example.com"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="app-role">Perfil</label>
            <select id="app-role" value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="consulta">Consulta</option>
              <option value="operador">Operador</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button className="primary" type="submit">Criar Usuário</button>
        </form>
        {appMessage && <p className="notice">{appMessage}</p>}

        <table className="table-list">
          <thead>
            <tr>
              <th>E-mail</th>
              <th>Nome</th>
              <th>Perfil</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {appUsers.map((user) => (
              <tr key={user.id}>
                <td>{user.email}</td>
                <td>{user.name || '—'}</td>
                <td>{user.role}</td>
                <td>{user.status}</td>
                <td>
                  <button
                    className="secondary small"
                    onClick={() => handleCopyInvite(user)}
                    title="Copiar convite"
                  >
                    📋 Convite
                  </button>
                  <button
                    className="secondary small"
                    onClick={() => handleToggleStatus(user.id, user.status)}
                    title={user.status === 'ATIVO' ? 'Bloquear' : 'Ativar'}
                  >
                    {user.status === 'ATIVO' ? '🔒 Bloquear' : '🔓 Ativar'}
                  </button>
                  <button
                    className="secondary small danger"
                    onClick={() => handleDeleteAppUser(user.id)}
                    title="Remover"
                  >
                    🗑️ Remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="page-card">
        <h2>Usuários</h2>
        <table className="table-list">
          <thead>
            <tr>
              <th>E-mail</th>
              <th>Nome</th>
              <th>Função</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((profile) => (
              <tr key={profile.id}>
                <td>{profile.email || '—'}</td>
                <td>{profile.full_name || '—'}</td>
                <td>{profile.role || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="page-card">
        <h2>Convites de Usuários</h2>
        <table className="table-list">
          <thead>
            <tr>
              <th>E-mail</th>
              <th>Função</th>
              <th>Convidado por</th>
            </tr>
          </thead>
          <tbody>
            {invites.map((invite) => (
              <tr key={invite.id}>
                <td>{invite.email}</td>
                <td>{invite.role || '—'}</td>
                <td>{invite.invited_by || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
