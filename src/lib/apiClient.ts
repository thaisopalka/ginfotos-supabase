const TOKEN_KEY = 'ginfotos_api_token';

export function getStoredToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY)?.trim() || '';
  } catch {
    return '';
  }
}

export function setStoredToken(token: string): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Cookie de sessão continua sendo usado mesmo sem localStorage.
  }
}

export function clearStoredToken(): void {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  const token = getStoredToken();

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(input, {
    ...init,
    credentials: init.credentials || 'same-origin',
    cache: init.cache || 'no-store',
    headers
  });
}
