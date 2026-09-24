export interface LocalAppUser {
  id: string;
  email: string;
  name?: string | null;
  role: string;
  status: string;
  temporary_password?: string | null;
  created_by?: string | null;
}

const LOCAL_APP_USERS_KEY = 'ginfotos_app_users_local';

export function loadLocalAppUsers(): LocalAppUser[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_APP_USERS_KEY) || '[]') as LocalAppUser[];
  } catch {
    return [];
  }
}

export function saveLocalAppUsers(users: LocalAppUser[]) {
  localStorage.setItem(LOCAL_APP_USERS_KEY, JSON.stringify(users));
}

export function upsertLocalAppUser(user: LocalAppUser) {
  const cleanEmail = user.email.trim().toLowerCase();
  const current = loadLocalAppUsers();
  const filtered = current.filter((item) => item.email.trim().toLowerCase() !== cleanEmail && item.id !== user.id);
  const normalized: LocalAppUser = {
    ...user,
    id: user.id || `local-user-${Date.now()}`,
    email: cleanEmail,
    status: user.status || 'ATIVO',
    role: user.role || 'consulta'
  };
  saveLocalAppUsers([normalized, ...filtered]);
  return normalized;
}

export function updateLocalAppUser(userId: string, patch: Partial<LocalAppUser>) {
  const updated = loadLocalAppUsers().map((user) => (user.id === userId ? { ...user, ...patch } : user));
  saveLocalAppUsers(updated);
  return updated;
}

export function deleteLocalAppUser(userId: string) {
  const updated = loadLocalAppUsers().filter((user) => user.id !== userId);
  saveLocalAppUsers(updated);
  return updated;
}

export function findLocalAppUserByEmail(email: string) {
  const cleanEmail = email.trim().toLowerCase();
  return loadLocalAppUsers().find((user) => user.email.trim().toLowerCase() === cleanEmail) || null;
}
