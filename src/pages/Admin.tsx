import { FormEvent, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  deleteLocalAppUser,
  loadLocalAppUsers,
  saveLocalAppUsers,
  updateLocalAppUser,
  upsertLocalAppUser
} from '../lib/localAdmin';

interface AppUser {
  id: string;
  email: string;
  name?: string | null;
  role: string;
  status: string;
  temporary_password?: string | null;
  created_by?: string | null;
}

interface Invite {
  id: string;
  email: string;
  role?: string | null;
  invited_by?: string | null;
}

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'gin', label: 'GIN' },
  { value: 'engenharia', label: 'Engenharia' },
  { value: 'consulta', label: 'Consulta' }
];

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let password = 'GIN-';
  for (let index = 0; index < 6; index += 1) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }
  return password;
}

function makeInviteText(user: AppUser) {
  return `Ola! Seu acesso ao GINFOTOS 6a CRE foi criado.\n\nAcesse:\nhttps://ginfotos-supabase.vercel.app\n\nE-mail:\n${user.email}\n\nSenha provisoria:\n${user.temporary_password || '[SENHA NAO INFORMADA]'}`;
}

function mergeUsers(localUsers: AppUser[], remoteUsers: AppUser[]) {
  const map = new Map<string, AppUser>();
  [...remoteUsers, ...localUsers].forEach((user) => {
    map.set(user.email.trim().toLowerCase(), user);
  });
  return Array.from(map.values()).sort((a, b) => a.email.localeCompare(b.email));
}

export default function Admin() {
  const [appUsers, setAppUsers] = useState<AppUser[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('consulta');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchAdminData = async () => {
    setLoading(true);
    const localUsers = loadLocalAppUsers() as AppUser[];
    setAppUsers(localUsers);

    try {
      const [{ data: appUsersData, error: appUsersError }, { data: invitesData }] = await Promise.all([
        supabase.from('app_users').select('*').order('email'),
        supabase.from('user_invites').select('*').order('email')
      ]);

      if (!appUsersError && appUsersData) {
        const merged = mergeUsers(localUsers, appUsersData as AppUser[]);
        setAppUsers(merged);
        saveLocalAppUsers(merged);
        setMessage('Usuarios carregados. Base local sincronizada.');
      } else if (appUsersError) {
        setMessage(`Supabase nao carregou usuarios. Modo local ativado: ${appUsersError.message}`);
      }

      if (invitesData) {
        setInvites(invitesData as Invite[]);
      }
    } catch {
      setMessage('Supabase nao respondeu. Modo local ativado para usuarios.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const filteredUsers = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return appUsers;
    return appUsers.filter((user) => [user.email, user.name, user.role, user.status].join(' ').toLowerCase().includes(term));
  }, [appUsers, query]);

  const handleCreateAppUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();
    if (!cleanEmail || !cleanName) {
      setMessage('Preencha nome e e-mail.');
      return;
    }

    const tempPassword = generatePassword();
    const localUser = upsertLocalAppUser({
      id: `local-user-${Date.now()}`,
      email: cleanEmail,
      name: cleanName,
      role,
      status: 'ATIVO',
      temporary_password: tempPassword,
      created_by: 'admin'
    }) as AppUser;

    setAppUsers(mergeUsers([localUser], appUsers));
    setName('');
    setEmail('');
    setRole('consulta');

    try {
      const { error } = await supabase.from('app_users').insert([
        {
          email: cleanEmail,
          name: cleanName,
          role,
          status: 'ATIVO',
          temporary_password: tempPassword,
          created_by: 'admin'
        }
      ]);

      if (error) {
        setMessage(`Usuario criado no modo local. Senha provisoria: ${tempPassword}. Supabase falhou: ${error.message}`);
        return;
      }

      setMessage(`Usuario criado e sincronizado. Senha provisoria: ${tempPassword}`);
      fetchAdminData();
    } catch {
      setMessage(`Usuario criado no modo local. Senha provisoria: ${tempPassword}.`);
    }
  };

  const handleToggleStatus = async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'ATIVO' ? 'BLOQUEADO' : 'ATIVO';
    const updatedLocal = updateLocalAppUser(userId, { status: newStatus }) as AppUser[];
    setAppUsers(updatedLocal);

    try {
      const { error } = await supabase.from('app_users').update({ status: newStatus }).eq('id', userId);
      setMessage(error ? `Status atualizado localmente para ${newStatus}. Supabase falhou.` : `Status atualizado para ${newStatus}.`);
    } catch {
      setMessage(`Status atualizado localmente para ${newStatus}.`);
    }
  };

  const handleResetPassword = async (userId: string) => {
    const tempPassword = generatePassword();
    const updatedLocal = updateLocalAppUser(userId, { temporary_password: tempPassword }) as AppUser[];
    setAppUsers(updatedLocal);

    try {
      const { error } = await supabase.from('app_users').update({ temporary_password: tempPassword }).eq('id', userId);
      setMessage(error ? `Nova senha provisoria local: ${tempPassword}. Supabase falhou.` : `Nova senha provisoria: ${tempPassword}`);
    } catch {
      setMessage(`Nova senha provisoria local: ${tempPassword}`);
    }
  };

  const handleDeleteAppUser = async (userId: string) => {
    if (!window.confirm('Remover este usuario do app?')) return;
    const updatedLocal = deleteLocalAppUser(userId) as AppUser[];
    setAppUsers(updatedLocal);

    try {
      const { error } = await supabase.from('app_users').delete().eq('id', userId);
      setMessage(error ? 'Usuario removido localmente. Supabase falhou.' : 'Usuario removido.');
    } catch {
      setMessage('Usuario removido localmente.');
    }
  };

  const handleCopyInvite = async (user: AppUser) => {
    await navigator.clipboard.writeText(makeInviteText(user));
    setMessage('Convite copiado para a area de transferencia.');
  };

  return (
    <div className="dashboard-page">
      <div className="top-row">
        <div>
          <p className="page-label">Controle de acesso</p>
          <h1>Admin</h1>
        </div>
        <button type="button" className="empty-button" onClick={fetchAdminData}>Atualizar</button>
      </div>

      <section className="page-card">
        <h2 style={{ marginTop: 0 }}>Criar usuario do app</h2>
        <p className="page-description">Crie usuarios, gere senha provisoria e copie o convite de acesso. Se o Supabase falhar, o app salva no modo local deste navegador.</p>
        <form onSubmit={handleCreateAppUser} style={{ display: 'grid', gap: 14, marginTop: 18 }}>
          <div className="field"><label htmlFor="admin-name">Nome</label><input id="admin-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome completo" required /></div>
          <div className="field"><label htmlFor="admin-email">E-mail</label><input id="admin-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email@exemplo.com" required /></div>
          <div className="field"><label htmlFor="admin-role">Perfil</label><select id="admin-role" value={role} onChange={(event) => setRole(event.target.value)}>{ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
          <button className="primary large" type="submit">Criar usuario e senha provisoria</button>
        </form>
        {message && <p className="notice">{message}</p>}
      </section>

      <section className="page-card">
        <div className="recent-header"><div><p className="page-label">Usuarios cadastrados</p><h2>Usuarios do App</h2></div><span className="status-pill">{filteredUsers.length} usuario(s)</span></div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}><input aria-label="Buscar usuario" placeholder="Buscar por nome, e-mail, perfil ou status" value={query} onChange={(event) => setQuery(event.target.value)} style={{ flex: '1 1 260px' }} /></div>
        {loading ? <div className="empty-state"><p>Carregando usuarios...</p></div> : filteredUsers.length === 0 ? <div className="empty-state"><p>Nenhum usuario encontrado.</p></div> : (
          <div style={{ overflowX: 'auto' }}><table className="table-list"><thead><tr><th>E-mail</th><th>Nome</th><th>Perfil</th><th>Status</th><th>Senha provisoria</th><th>Acoes</th></tr></thead><tbody>{filteredUsers.map((user) => (
            <tr key={user.id}><td>{user.email}</td><td>{user.name || '-'}</td><td>{user.role}</td><td><span className="status-chip">{user.status}</span></td><td>{user.temporary_password || '-'}</td><td><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" className="empty-link" onClick={() => handleCopyInvite(user)}>Copiar convite</button><button type="button" className="empty-link" onClick={() => handleResetPassword(user.id)}>Nova senha</button><button type="button" className="empty-link" onClick={() => handleToggleStatus(user.id, user.status)}>{user.status === 'ATIVO' ? 'Bloquear' : 'Ativar'}</button><button type="button" className="empty-link" onClick={() => handleDeleteAppUser(user.id)}>Remover</button></div></td></tr>
          ))}</tbody></table></div>
        )}
      </section>

      <section className="page-card">
        <p className="page-label">Convites antigos</p><h2 style={{ marginTop: 0 }}>Convites registrados</h2>
        {invites.length === 0 ? <div className="empty-state"><p>Nenhum convite antigo encontrado.</p></div> : (
          <div style={{ overflowX: 'auto' }}><table className="table-list"><thead><tr><th>E-mail</th><th>Perfil</th><th>Convidado por</th></tr></thead><tbody>{invites.map((invite) => <tr key={invite.id}><td>{invite.email}</td><td>{invite.role || '-'}</td><td>{invite.invited_by || '-'}</td></tr>)}</tbody></table></div>
        )}
      </section>
    </div>
  );
}
