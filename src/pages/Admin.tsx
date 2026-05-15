import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

interface UserProfile {
  id: string;
  full_name?: string | null;
  email?: string | null;
  role?: string | null;
}

interface Invite {
  id: string;
  email: string;
  role?: string | null;
  invited_by?: string | null;
}

export default function Admin() {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('user');
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchAdminData();
  }, []);

  const fetchAdminData = async () => {
    const [{ data: profileData }, { data: invitesData }] = await Promise.all([
      supabase.from('user_profiles').select('*').order('email'),
      supabase.from('user_invites').select('*').order('email')
    ]);

    if (profileData) setProfiles(profileData as UserProfile[]);
    if (invitesData) setInvites(invitesData as Invite[]);
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
