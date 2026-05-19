import { FormEvent, useState } from 'react';
import { AppUser, setCurrentUser } from '../lib/session';
import { loadLocalAppUsers, saveLocalAppUsers } from '../lib/localAdmin';

interface PerfilProps { user: AppUser | null; onUserChange: (user: AppUser) => void; }

export default function Perfil({ user, onUserChange }: PerfilProps) {
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim() || cleanEmail;
    const updated: AppUser = { ...user, email: cleanEmail, name: cleanName };
    setCurrentUser(updated);
    onUserChange(updated);

    const users = loadLocalAppUsers();
    const nextUsers = users.map((item) => item.email === user.email ? { ...item, email: cleanEmail, name: cleanName, temporary_password: password.trim() || item.temporary_password } : item);
    saveLocalAppUsers(nextUsers);
    setMessage(password.trim() ? 'Perfil atualizado e senha local alterada.' : 'Perfil atualizado.');
    setPassword('');
  };

  return <div className="dashboard-page"><div className="top-row"><div><p className="page-label">Minha conta</p><h1>Perfil</h1></div></div><section className="page-card"><p className="page-description">Edite seu nome de exibição e, para usuários criados no modo local, altere a senha provisória.</p><form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14, marginTop: 18 }}><div className="field"><label>Nome</label><input value={name} onChange={(e) => setName(e.target.value)} /></div><div className="field"><label>E-mail</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div><div className="field"><label>Nova senha local</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Preencha somente se quiser alterar" /></div><button className="primary large" type="submit">Salvar perfil</button></form>{message && <p className="notice">{message}</p>}</section></div>;
}
