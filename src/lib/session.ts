export interface AppUser {
  email: string;
  name: string;
  role: string;
  status: string;
}

const STORAGE_KEY = 'ginfotos_user';

export function getCurrentUser(): AppUser | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as AppUser;
  } catch {
    return null;
  }
}

export function setCurrentUser(user: AppUser): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

export function clearCurrentUser(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function isAdmin(): boolean {
  const user = getCurrentUser();
  return user?.role === 'admin' ? true : false;
}
