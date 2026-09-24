import { useEffect, useRef } from 'react';
import { getCurrentUser } from '../lib/session';
import { syncPendingVisitsOnce } from '../lib/visitSync';
import { apiFetch, apiReadJson } from '../lib/apiClient';

interface ApiVisit {
  id: string;
  created_at?: string | null;
  photo_count?: number;
}

async function serverSignature(): Promise<string> {
  try {
    const response = await apiFetch(`/api/visitas?ts=${Date.now()}`, {
      method: 'GET'
    });
    if (!response.ok) return '';
    const payload = await apiReadJson<{ data?: ApiVisit[] }>(response);
    const rows = Array.isArray(payload.data) ? payload.data : [];
    return rows.map((item) => `${item.id}:${item.created_at || ''}:${item.photo_count || 0}`).join('|');
  } catch {
    return '';
  }
}

export default function VisitSyncManager() {
  const runningRef = useRef(false);
  const signatureRef = useRef('');

  useEffect(() => {
    let disposed = false;

    const run = async () => {
      if (disposed || runningRef.current || document.visibilityState === 'hidden') return;
      const user = getCurrentUser();
      if (!user?.email || !navigator.onLine) return;

      runningRef.current = true;
      try {
        // 1. Sincroniza visitas e fotos pendentes salvas no aparelho
        await syncPendingVisitsOnce();

        // 2. Verifica se houve novas visitas adicionadas por outros usuários no servidor
        const signature = await serverSignature();
        if (signature) {
          if (signatureRef.current && signatureRef.current !== signature) {
            window.dispatchEvent(new Event('ginfotos-visitas-updated'));
          }
          signatureRef.current = signature;
        }
      } catch {
        // Modo offline resiliente: próxima rodada tenta novamente
      } finally {
        runningRef.current = false;
      }
    };

    void run();
    const interval = window.setInterval(() => void run(), 15000);
    const onOnline = () => void run();
    const onFocus = () => void run();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void run();
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return null;
}
