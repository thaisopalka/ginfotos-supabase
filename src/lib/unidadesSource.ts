import { supabase } from './supabaseClient';

export interface UnidadeApp {
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
  latitude?: string | number | null;
  longitude?: string | number | null;
  origem?: string;
  [key: string]: unknown;
}

export const LOCAL_UNIDADES_KEY = 'ginfotos_unidades_local';

const OFFICIAL_TABLES = ['unidades', 'unidades_escolares', 'base_oficial_ginfotos_unidades_supabase'];

function textValue(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function pick(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = textValue(row[key]);
    if (value) return value;
  }
  return '';
}

function makeId(designacao: string, name: string) {
  const base = (designacao || name || `local-${Date.now()}`)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return base || `local-${Date.now()}`;
}

export function normalizeUnidadeRow(row: Record<string, unknown>, origem = 'Supabase'): UnidadeApp {
  const designacao = pick(row, ['designacao', 'DESIGNACAO', 'DESIGNAÇÃO', 'Designacao', 'Designação', 'codigo', 'Código']);
  const name = pick(row, ['name', 'nome', 'unidade', 'unidade_escolar', 'UNIDADE ESCOLAR', 'UNIDADE_ESCOLAR', 'Unidade Escolar', 'escola']);
  const address = pick(row, ['address', 'endereco', 'ENDERECO', 'ENDEREÇO', 'Endereço', 'logradouro']);
  const bairro = pick(row, ['bairro', 'BAIRRO', 'Bairro']);
  const telefone = pick(row, ['telefone', 'TELEFONE', 'Telefone', 'tel']);
  const diretorGeral = pick(row, ['diretor_geral', 'diretorGeral', 'DIRETOR(A) GERAL', 'DIRETOR GERAL', 'Diretor(a) Geral', 'diretor']);
  const celularDiretor = pick(row, ['celular_diretor_geral', 'celularDiretorGeral', 'CELULAR DIRETOR(A)', 'CELULAR DIRETOR', 'Celular Diretor(a)', 'celular_diretor']);
  const diretorAdjunto = pick(row, ['diretor_adjunto', 'diretorAdjunto', 'DIRETOR(A) ADJUNTO(A)', 'DIRETOR ADJUNTO', 'Diretor(a) Adjunto(a)', 'adjunto']);
  const celularAdjunto = pick(row, ['celular_diretor_adjunto', 'celularDiretorAdjunto', 'CELULAR ADJUNTO(A)', 'CELULAR ADJUNTO', 'Celular Adjunto(a)', 'celular_adjunto']);
  const latitude = pick(row, ['latitude', 'lat', 'LATITUDE']);
  const longitude = pick(row, ['longitude', 'lng', 'lon', 'LONGITUDE']);
  const id = pick(row, ['id']) || makeId(designacao, name);

  return {
    id,
    designacao,
    name: name || 'Unidade sem nome',
    address,
    bairro,
    telefone,
    diretor_geral: diretorGeral,
    celular_diretor_geral: celularDiretor,
    diretor_adjunto: diretorAdjunto,
    celular_diretor_adjunto: celularAdjunto,
    latitude,
    longitude,
    origem
  };
}

export function loadLocalUnidades<T = UnidadeApp>(): T[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_UNIDADES_KEY) || '[]') as T[];
  } catch {
    return [];
  }
}

export function saveLocalUnidades(unidades: UnidadeApp[]) {
  localStorage.setItem(LOCAL_UNIDADES_KEY, JSON.stringify(unidades));
}

export function mergeUnidades<T extends UnidadeApp>(...groups: T[][]) {
  const map = new Map<string, T>();
  groups.flat().forEach((item) => {
    const normalized = normalizeUnidadeRow(item as Record<string, unknown>, item.origem || 'Local') as T;
    const key = String(normalized.designacao || normalized.id || normalized.name).toLowerCase();
    if (!map.has(key)) map.set(key, normalized);
  });
  return Array.from(map.values()).sort((a, b) => String(a.designacao || a.name).localeCompare(String(b.designacao || b.name)));
}

async function fetchViaServer() {
  try {
    const response = await fetch('/api/unidades', { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && Array.isArray(payload.data) && payload.data.length > 0) {
      return {
        unidades: payload.data.map((row: Record<string, unknown>) => normalizeUnidadeRow(row, payload.tableName ? `Servidor/${payload.tableName}` : 'Servidor')),
        tableName: payload.tableName || 'api/unidades',
        error: null as string | null
      };
    }
    return { unidades: [] as UnidadeApp[], tableName: '', error: payload.error || 'API /api/unidades não retornou unidades.' };
  } catch (error) {
    return { unidades: [] as UnidadeApp[], tableName: '', error: error instanceof Error ? error.message : 'Falha na API /api/unidades.' };
  }
}

export async function fetchSupabaseUnidades() {
  for (const tableName of OFFICIAL_TABLES) {
    try {
      const { data, error } = await supabase.from(tableName).select('*').limit(1000);
      if (!error && data && data.length > 0) {
        return {
          unidades: (data as Record<string, unknown>[]).map((row) => normalizeUnidadeRow(row, tableName === 'unidades' ? 'Supabase' : 'Supabase/base oficial')),
          tableName,
          error: null as string | null
        };
      }
    } catch {
      // Try next possible table name.
    }
  }

  return fetchViaServer();
}
