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

interface UnidadeAdmin {
  id: string;
  designacao?: string | null;
  name: string;
  address?: string | null;
  bairro?: string | null;
  telefone?: string | null;
  diretor_geral?: string | null;
  celular_diretor_geral?: string | null;
  diretor_adjunto?: string | null;
  celular_diretor_adjunto?: string | null;
  origem?: string;
}

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'gin', label: 'GIN' },
  { value: 'engenharia', label: 'Engenharia' },
  { value: 'consulta', label: 'Consulta' }
];

const LOCAL_UNIDADES_KEY = 'ginfotos_unidades_local';

const emptyUnidade: UnidadeAdmin = {
  id: '',
  designacao: '',
  name: '',
  address: '',
  bairro: '',
  telefone: '',
  diretor_geral: '',
  celular_diretor_geral: '',
  diretor_adjunto: '',
  celular_diretor_adjunto: '',
  origem: 'Admin'
};

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let password = 'GIN-';
  for (let index = 0; index < 6; index += 1) password += chars[Math.floor(Math.random() * chars.length)];
  return password;
}

function makeInviteText(user: AppUser) {
  return `Olá! Seu acesso ao GINFOTOS 6ª CRE foi criado.\n\nAcesse:\nhttps://ginfotos-supabase.vercel.app\n\nE-mail:\n${user.email}\n\nSenha provisória:\n${user.temporary_password || '[SENHA NÃO INFORMADA]'}\n\nAtenciosamente,\nE/6ª CRE/GIN`;
}

function gmailComposeUrl(user: AppUser) {
  const params = new URLSearchParams({
    view: 'cm',
    fs: '1',
    to: user.email,
    su: 'Seu acesso ao GINFOTOS 6ª CRE',
    body: makeInviteText(user)
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

function outlookComposeUrl(user: AppUser) {
  const params = new URLSearchParams({
    to: user.email,
    subject: 'Seu acesso ao GINFOTOS 6ª CRE',
    body: makeInviteText(user)
  });
  return `https://outlook.office.com/mail/deeplink/compose?${params.toString()}`;
}

function openGmailCompose(user: AppUser, popup?: Window | null) {
  const url = gmailComposeUrl(user);
  if (popup && !popup.closed) popup.location.href = url;
  else window.open(url, '_blank', 'noopener,noreferrer');
}

function openOutlookCompose(user: AppUser) {
  window.open(outlookComposeUrl(user), '_blank', 'noopener,noreferrer');
}

function openMailClient(user: AppUser) {
  const subject = encodeURIComponent('Seu acesso ao GINFOTOS 6ª CRE');
  const body = encodeURIComponent(makeInviteText(user));
  window.location.href = `mailto:${user.email}?subject=${subject}&body=${body}`;
}

function mergeUsers(localUsers: AppUser[], remoteUsers: AppUser[]) {
  const map = new Map<string, AppUser>();
  [...remoteUsers, ...localUsers].forEach((user) => map.set(user.email.trim().toLowerCase(), user));
  return Array.from(map.values()).sort((a, b) => a.email.localeCompare(b.email));
}

function loadLocalUnidades(): UnidadeAdmin[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_UNIDADES_KEY) || '[]') as UnidadeAdmin[]; } catch { return []; }
}

function saveLocalUnidades(unidades: UnidadeAdmin[]) {
  localStorage.setItem(LOCAL_UNIDADES_KEY, JSON.stringify(unidades));
  window.dispatchEvent(new Event('ginfotos-unidades-updated'));
}

function normalizeUnidade(raw: Partial<UnidadeAdmin>): UnidadeAdmin {
  return {
    id: raw.id || `local-${Date.now()}-${Math.random()}`,
    designacao: raw.designacao || '',
    name: raw.name || 'Unidade sem nome',
    address: raw.address || '',
    bairro: raw.bairro || '',
    telefone: raw.telefone || '',
    diretor_geral: raw.diretor_geral || '',
    celular_diretor_geral: raw.celular_diretor_geral || '',
    diretor_adjunto: raw.diretor_adjunto || '',
    celular_diretor_adjunto: raw.celular_diretor_adjunto || '',
    origem: raw.origem || 'Admin'
  };
}

function mergeUnidades(...groups: UnidadeAdmin[][]) {
  const map = new Map<string, UnidadeAdmin>();
  groups.flat().forEach((item) => {
    const normalized = normalizeUnidade(item);
    const key = (normalized.designacao || normalized.id || normalized.name).toLowerCase();
    if (!map.has(key)) map.set(key, normalized);
  });
  return Array.from(map.values()).sort((a, b) => (a.designacao || a.name).localeCompare(b.designacao || b.name));
}

function parseImportText(text: string): UnidadeAdmin[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (line.split('\t').length > 1 ? line.split('\t') : line.split(';')))
    .map((cols) => normalizeUnidade({
      id: `local-${cols[0]?.trim() || Date.now()}-${Math.random()}`,
      designacao: cols[0]?.trim() || '',
      name: cols[1]?.trim() || '',
      address: cols[2]?.trim() || '',
      bairro: cols[3]?.trim() || '',
      telefone: cols[4]?.trim() || '',
      diretor_geral: cols[5]?.trim() || '',
      celular_diretor_geral: cols[6]?.trim() || '',
      diretor_adjunto: cols[7]?.trim() || '',
      celular_diretor_adjunto: cols[8]?.trim() || '',
      origem: 'Importada no Admin'
    }))
    .filter((item) => item.name && item.name !== 'Unidade sem nome');
}

function toSupabaseRecord(record: UnidadeAdmin) {
  return {
    name: record.name,
    address: record.address || '',
    designacao: record.designacao || '',
    bairro: record.bairro || '',
    telefone: record.telefone || '',
    diretor_geral: record.diretor_geral || '',
    celular_diretor_geral: record.celular_diretor_geral || '',
    diretor_adjunto: record.diretor_adjunto || '',
    celular_diretor_adjunto: record.celular_diretor_adjunto || ''
  };
}

function withoutUnidade(list: UnidadeAdmin[], record: UnidadeAdmin) {
  return list.filter((item) => item.id !== record.id && (item.designacao || '') !== (record.designacao || ''));
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
  const [sendingInviteId, setSendingInviteId] = useState<string | null>(null);
  const [unidades, setUnidades] = useState<UnidadeAdmin[]>([]);
  const [unidadeForm, setUnidadeForm] = useState<UnidadeAdmin>(emptyUnidade);
  const [unidadeQuery, setUnidadeQuery] = useState('');
  const [importText, setImportText] = useState('');
  const [unitMessage, setUnitMessage] = useState('');

  const fetchUnidadesAdmin = async () => {
    const local = loadLocalUnidades();
    setUnidades(local);
    try {
      const { data, error } = await supabase.from('unidades').select('*').order('designacao');
      if (!error && data && data.length > 0) {
        const merged = mergeUnidades(local, (data as UnidadeAdmin[]).map((item) => ({ ...item, origem: 'Supabase' })));
        setUnidades(merged);
        saveLocalUnidades(merged);
        setUnitMessage(`${data.length} unidade(s) carregada(s) do Supabase e salvas na base local.`);
      } else if (error) setUnitMessage(`Supabase não carregou unidades. Base local mantida. ${error.message}`);
    } catch { setUnitMessage('Supabase não respondeu. Base local mantida.'); }
  };

  const fetchAdminData = async () => {
    setLoading(true);
    const localUsers = loadLocalAppUsers() as AppUser[];
    setAppUsers(localUsers);
    fetchUnidadesAdmin();
    try {
      const [{ data: appUsersData, error: appUsersError }, { data: invitesData }] = await Promise.all([
        supabase.from('app_users').select('*').order('email'),
        supabase.from('user_invites').select('*').order('email')
      ]);
      if (!appUsersError && appUsersData) {
        const merged = mergeUsers(localUsers, appUsersData as AppUser[]);
        setAppUsers(merged);
        saveLocalAppUsers(merged);
        setMessage('Usuários carregados. Base local sincronizada.');
      } else if (appUsersError) setMessage(`Supabase não carregou usuários. Modo local ativado: ${appUsersError.message}`);
      if (invitesData) setInvites(invitesData as Invite[]);
    } catch { setMessage('Supabase não respondeu. Modo local ativado para usuários.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAdminData(); }, []);

  const filteredUsers = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return appUsers;
    return appUsers.filter((user) => [user.email, user.name, user.role, user.status].join(' ').toLowerCase().includes(term));
  }, [appUsers, query]);

  const filteredUnidades = useMemo(() => {
    const term = unidadeQuery.trim().toLowerCase();
    if (!term) return unidades;
    return unidades.filter((item) => [item.designacao, item.name, item.address, item.bairro, item.telefone, item.diretor_geral, item.celular_diretor_geral, item.diretor_adjunto, item.celular_diretor_adjunto].join(' ').toLowerCase().includes(term));
  }, [unidades, unidadeQuery]);

  const sendInviteEmail = async (user: AppUser, popup?: Window | null) => {
    setSendingInviteId(user.id);
    setMessage('Tentando enviar convite automático...');
    try {
      const response = await fetch('/api/send-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, name: user.name, password: user.temporary_password, inviteText: makeInviteText(user) })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Não foi possível enviar o convite.');
      if (popup && !popup.closed) popup.close();
      setMessage(`Convite enviado automaticamente para ${user.email}.`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'SMTP não configurado.';
      setMessage(`${errorMessage} Abri uma janela do Gmail já preenchida. Basta clicar em Enviar.`);
      openGmailCompose(user, popup);
    } finally {
      setSendingInviteId(null);
    }
  };

  const handleCreateAppUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    const composeWindow = window.open('', '_blank');
    if (composeWindow) composeWindow.document.write('<p style="font-family:Arial;padding:20px">Preparando convite do GINFOTOS...</p>');
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();
    if (!cleanEmail || !cleanName) { setMessage('Preencha nome e e-mail.'); if (composeWindow) composeWindow.close(); return; }
    const tempPassword = generatePassword();
    const localUser = upsertLocalAppUser({ id: `local-user-${Date.now()}`, email: cleanEmail, name: cleanName, role, status: 'ATIVO', temporary_password: tempPassword, created_by: 'admin' }) as AppUser;
    setAppUsers(mergeUsers([localUser], appUsers));
    setName(''); setEmail(''); setRole('consulta');
    try {
      const { error } = await supabase.from('app_users').insert([{ email: cleanEmail, name: cleanName, role, status: 'ATIVO', temporary_password: tempPassword, created_by: 'admin' }]);
      if (error) setMessage(`Usuário criado no modo local. Senha provisória: ${tempPassword}. Supabase falhou: ${error.message}`);
      else { setMessage(`Usuário criado e sincronizado. Senha provisória: ${tempPassword}`); fetchAdminData(); }
    } catch { setMessage(`Usuário criado no modo local. Senha provisória: ${tempPassword}.`); }
    sendInviteEmail(localUser, composeWindow);
  };

  const handleToggleStatus = async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'ATIVO' ? 'BLOQUEADO' : 'ATIVO';
    const updatedLocal = updateLocalAppUser(userId, { status: newStatus }) as AppUser[];
    setAppUsers(updatedLocal);
    try {
      const { error } = await supabase.from('app_users').update({ status: newStatus }).eq('id', userId);
      setMessage(error ? `Status atualizado localmente para ${newStatus}. Supabase falhou.` : `Status atualizado para ${newStatus}.`);
    } catch { setMessage(`Status atualizado localmente para ${newStatus}.`); }
  };

  const handleResetPassword = async (userId: string) => {
    const tempPassword = generatePassword();
    const updatedLocal = updateLocalAppUser(userId, { temporary_password: tempPassword }) as AppUser[];
    setAppUsers(updatedLocal);
    try {
      const { error } = await supabase.from('app_users').update({ temporary_password: tempPassword }).eq('id', userId);
      setMessage(error ? `Nova senha provisória local: ${tempPassword}. Supabase falhou.` : `Nova senha provisória: ${tempPassword}`);
    } catch { setMessage(`Nova senha provisória local: ${tempPassword}`); }
  };

  const handleDeleteAppUser = async (userId: string) => {
    if (!window.confirm('Remover este usuário do app?')) return;
    const updatedLocal = deleteLocalAppUser(userId) as AppUser[];
    setAppUsers(updatedLocal);
    try {
      const { error } = await supabase.from('app_users').delete().eq('id', userId);
      setMessage(error ? 'Usuário removido localmente. Supabase falhou.' : 'Usuário removido.');
    } catch { setMessage('Usuário removido localmente.'); }
  };

  const handleCopyInvite = async (user: AppUser) => {
    await navigator.clipboard.writeText(makeInviteText(user));
    setMessage('Convite copiado para a área de transferência.');
  };

  const saveUnidadeAdmin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const record = normalizeUnidade({ ...unidadeForm, id: unidadeForm.id || `local-${Date.now()}`, origem: unidadeForm.origem || 'Admin' });
    const updated = mergeUnidades([record], withoutUnidade(loadLocalUnidades(), record));
    saveLocalUnidades(updated);
    setUnidades(mergeUnidades(updated, unidades));
    setUnidadeForm(emptyUnidade);
    setUnitMessage('Unidade salva na base local do app. Todas as abas passam a puxar esta base local.');
    try {
      const { error } = await supabase.from('unidades').upsert([toSupabaseRecord(record)], { onConflict: 'designacao' });
      if (!error) { setUnitMessage('Unidade salva na base local e sincronizada com Supabase.'); fetchUnidadesAdmin(); }
    } catch { /* local ok */ }
  };

  const importUnidadesAdmin = async () => {
    const imported = parseImportText(importText);
    if (imported.length === 0) { setUnitMessage('Nenhuma unidade válida encontrada.'); return; }
    const updated = mergeUnidades(imported, loadLocalUnidades());
    saveLocalUnidades(updated);
    setUnidades(updated);
    setImportText('');
    setUnitMessage(`${imported.length} unidade(s) importada(s) para a base local do app.`);
    try {
      const { error } = await supabase.from('unidades').upsert(imported.map(toSupabaseRecord), { onConflict: 'designacao' });
      if (!error) { setUnitMessage(`${imported.length} unidade(s) importada(s) e sincronizada(s) com Supabase.`); fetchUnidadesAdmin(); }
    } catch { /* local ok */ }
  };

  const editUnidadeAdmin = (item: UnidadeAdmin) => { setUnidadeForm(normalizeUnidade(item)); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const deleteUnidadeAdmin = async (item: UnidadeAdmin) => {
    if (!window.confirm(`Excluir ${item.designacao || ''} - ${item.name}?`)) return;
    const updated = withoutUnidade(loadLocalUnidades(), item);
    saveLocalUnidades(updated);
    setUnidades(withoutUnidade(unidades, item));
    setUnitMessage('Unidade excluída da base local.');
    try { if (item.designacao) await supabase.from('unidades').delete().eq('designacao', item.designacao); } catch { /* local ok */ }
  };

  return (
    <div className="dashboard-page">
      <div className="top-row"><div><p className="page-label">Controle de acesso</p><h1>Admin</h1></div><button type="button" className="empty-button" onClick={fetchAdminData}>Atualizar</button></div>

      <section className="page-card">
        <h2 style={{ marginTop: 0 }}>Criar usuário do app</h2>
        <p className="page-description">Crie usuários, gere senha provisória e envie o convite. Sem SMTP no Vercel, o app abre uma janela do Gmail já preenchida para você clicar em Enviar.</p>
        <form onSubmit={handleCreateAppUser} style={{ display: 'grid', gap: 14, marginTop: 18 }}>
          <div className="field"><label htmlFor="admin-name">Nome</label><input id="admin-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome completo" required /></div>
          <div className="field"><label htmlFor="admin-email">E-mail</label><input id="admin-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email@exemplo.com" required /></div>
          <div className="field"><label htmlFor="admin-role">Perfil</label><select id="admin-role" value={role} onChange={(event) => setRole(event.target.value)}>{ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
          <button className="primary large" type="submit">Criar usuário e abrir convite no Gmail</button>
        </form>
        {message && <p className="notice">{message}</p>}
      </section>

      <section className="page-card">
        <div className="recent-header"><div><p className="page-label">Usuários cadastrados</p><h2>Usuários do App</h2></div><span className="status-pill">{filteredUsers.length} usuário(s)</span></div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}><input aria-label="Buscar usuário" placeholder="Buscar por nome, e-mail, perfil ou status" value={query} onChange={(event) => setQuery(event.target.value)} style={{ flex: '1 1 260px' }} /></div>
        {loading ? <div className="empty-state"><p>Carregando usuários...</p></div> : filteredUsers.length === 0 ? <div className="empty-state"><p>Nenhum usuário encontrado.</p></div> : <div style={{ overflowX: 'auto' }}><table className="table-list"><thead><tr><th>E-mail</th><th>Nome</th><th>Perfil</th><th>Status</th><th>Senha provisória</th><th>Ações</th></tr></thead><tbody>{filteredUsers.map((user) => <tr key={user.id}><td>{user.email}</td><td>{user.name || '-'}</td><td>{user.role}</td><td><span className="status-chip">{user.status}</span></td><td>{user.temporary_password || '-'}</td><td><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" className="empty-link" onClick={() => sendInviteEmail(user, window.open('', '_blank'))} disabled={sendingInviteId === user.id}>{sendingInviteId === user.id ? 'Enviando...' : 'Enviar/Gmail'}</button><button type="button" className="empty-link" onClick={() => openGmailCompose(user)}>Abrir Gmail</button><button type="button" className="empty-link" onClick={() => openOutlookCompose(user)}>Abrir Outlook</button><button type="button" className="empty-link" onClick={() => openMailClient(user)}>E-mail padrão</button><button type="button" className="empty-link" onClick={() => handleCopyInvite(user)}>Copiar convite</button><button type="button" className="empty-link" onClick={() => handleResetPassword(user.id)}>Nova senha</button><button type="button" className="empty-link" onClick={() => handleToggleStatus(user.id, user.status)}>{user.status === 'ATIVO' ? 'Bloquear' : 'Ativar'}</button><button type="button" className="empty-link danger-link" onClick={() => handleDeleteAppUser(user.id)}>Remover</button></div></td></tr>)}</tbody></table></div>}
      </section>

      <section className="page-card">
        <p className="page-label">Base das UEs</p><h2 style={{ marginTop: 0 }}>Unidades escolares da 6ª CRE</h2>
        <p className="page-description">Cole a planilha aqui ou cadastre manualmente. Esta base fica salva no app e alimenta Nova Visita, WhatsApp Diretores, Pastas e Relatórios.</p>
        <form onSubmit={saveUnidadeAdmin} style={{ display: 'grid', gap: 12, marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}><div className="field"><label>Designação</label><input value={unidadeForm.designacao || ''} onChange={(e) => setUnidadeForm((c) => ({ ...c, designacao: e.target.value }))} /></div><div className="field"><label>Unidade</label><input value={unidadeForm.name} onChange={(e) => setUnidadeForm((c) => ({ ...c, name: e.target.value }))} required /></div><div className="field"><label>Bairro</label><input value={unidadeForm.bairro || ''} onChange={(e) => setUnidadeForm((c) => ({ ...c, bairro: e.target.value }))} /></div></div>
          <div className="field"><label>Endereço</label><input value={unidadeForm.address || ''} onChange={(e) => setUnidadeForm((c) => ({ ...c, address: e.target.value }))} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}><div className="field"><label>Telefone</label><input value={unidadeForm.telefone || ''} onChange={(e) => setUnidadeForm((c) => ({ ...c, telefone: e.target.value }))} /></div><div className="field"><label>Diretor(a) Geral</label><input value={unidadeForm.diretor_geral || ''} onChange={(e) => setUnidadeForm((c) => ({ ...c, diretor_geral: e.target.value }))} /></div><div className="field"><label>Celular Diretor(a)</label><input value={unidadeForm.celular_diretor_geral || ''} onChange={(e) => setUnidadeForm((c) => ({ ...c, celular_diretor_geral: e.target.value }))} /></div><div className="field"><label>Diretor(a) Adjunto(a)</label><input value={unidadeForm.diretor_adjunto || ''} onChange={(e) => setUnidadeForm((c) => ({ ...c, diretor_adjunto: e.target.value }))} /></div><div className="field"><label>Celular Adjunto(a)</label><input value={unidadeForm.celular_diretor_adjunto || ''} onChange={(e) => setUnidadeForm((c) => ({ ...c, celular_diretor_adjunto: e.target.value }))} /></div></div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><button className="primary" type="submit">{unidadeForm.id ? 'Salvar edição da UE' : 'Adicionar UE'}</button><button className="empty-link" type="button" onClick={() => setUnidadeForm(emptyUnidade)}>Limpar</button><button className="empty-link" type="button" onClick={fetchUnidadesAdmin}>Recarregar base</button></div>
        </form>
        <div className="field" style={{ marginTop: 18 }}><label>Importar planilha colada</label><textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={5} placeholder="Cole aqui: DESIGNACAO, UNIDADE, ENDERECO, BAIRRO, TELEFONE, DIRETOR GERAL, CELULAR DIRETOR, DIRETOR ADJUNTO, CELULAR ADJUNTO" /><button type="button" className="primary" onClick={importUnidadesAdmin}>Importar para todas as abas</button></div>
        {unitMessage && <p className="notice">{unitMessage}</p>}
        <input placeholder="Buscar UE por designação, nome, bairro, telefone ou direção" value={unidadeQuery} onChange={(e) => setUnidadeQuery(e.target.value)} style={{ marginTop: 18 }} />
        <div style={{ overflowX: 'auto', marginTop: 14 }}><table className="table-list"><thead><tr><th>Designação</th><th>Unidade</th><th>Bairro</th><th>Diretor(a)</th><th>Celular</th><th>Adjunto(a)</th><th>Celular Adj.</th><th>Origem</th><th>Ações</th></tr></thead><tbody>{filteredUnidades.map((item) => <tr key={`${item.origem}-${item.id}-${item.designacao}`}><td>{item.designacao || '-'}</td><td>{item.name}</td><td>{item.bairro || '-'}</td><td>{item.diretor_geral || '-'}</td><td>{item.celular_diretor_geral || '-'}</td><td>{item.diretor_adjunto || '-'}</td><td>{item.celular_diretor_adjunto || '-'}</td><td><span className="status-chip">{item.origem || 'Local'}</span></td><td><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" className="empty-link" onClick={() => editUnidadeAdmin(item)}>Editar</button><button type="button" className="empty-link danger-link" onClick={() => deleteUnidadeAdmin(item)}>Excluir</button></div></td></tr>)}</tbody></table></div>
      </section>

      <section className="page-card"><p className="page-label">Convites antigos</p><h2 style={{ marginTop: 0 }}>Convites registrados</h2>{invites.length === 0 ? <div className="empty-state"><p>Nenhum convite antigo encontrado.</p></div> : <div style={{ overflowX: 'auto' }}><table className="table-list"><thead><tr><th>E-mail</th><th>Perfil</th><th>Convidado por</th></tr></thead><tbody>{invites.map((invite) => <tr key={invite.id}><td>{invite.email}</td><td>{invite.role || '-'}</td><td>{invite.invited_by || '-'}</td></tr>)}</tbody></table></div>}</section>
    </div>
  );
}
