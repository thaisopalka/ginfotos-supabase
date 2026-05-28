import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function clean(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function pick(row, keys) {
  for (const key of keys) {
    const value = clean(row[key]);
    if (value) return value;
  }
  return '';
}

function makeId(designacao, name) {
  return (designacao || name || `ue-${Date.now()}`)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || `ue-${Date.now()}`;
}

function normalize(row) {
  const designacao = pick(row, ['designacao', 'DESIGNACAO', 'DESIGNAÇÃO', 'Designacao', 'Designação', 'codigo', 'Código']);
  const name = pick(row, ['name', 'nome', 'unidade', 'unidade_escolar', 'UNIDADE ESCOLAR', 'UNIDADE_ESCOLAR', 'Unidade Escolar', 'escola']);
  return {
    id: clean(row.id) || makeId(designacao, name),
    designacao,
    name: name || 'Unidade sem nome',
    address: pick(row, ['address', 'endereco', 'ENDERECO', 'ENDEREÇO', 'Endereço', 'logradouro']),
    bairro: pick(row, ['bairro', 'BAIRRO', 'Bairro']),
    telefone: pick(row, ['telefone', 'TELEFONE', 'Telefone', 'tel']),
    diretor_geral: pick(row, ['diretor_geral', 'diretorGeral', 'DIRETOR(A) GERAL', 'DIRETOR GERAL', 'Diretor(a) Geral', 'diretor']),
    celular_diretor_geral: pick(row, ['celular_diretor_geral', 'celularDiretorGeral', 'CELULAR DIRETOR(A)', 'CELULAR DIRETOR', 'Celular Diretor(a)', 'celular_diretor']),
    diretor_adjunto: pick(row, ['diretor_adjunto', 'diretorAdjunto', 'DIRETOR(A) ADJUNTO(A)', 'DIRETOR ADJUNTO', 'Diretor(a) Adjunto(a)', 'adjunto']),
    celular_diretor_adjunto: pick(row, ['celular_diretor_adjunto', 'celularDiretorAdjunto', 'CELULAR ADJUNTO(A)', 'CELULAR ADJUNTO', 'Celular Adjunto(a)', 'celular_adjunto']),
    latitude: pick(row, ['latitude', 'lat', 'LATITUDE']),
    longitude: pick(row, ['longitude', 'lng', 'lon', 'LONGITUDE']),
    origem: 'Supabase via servidor'
  };
}

async function readAnyTable(supabase) {
  const tables = ['unidades', 'unidades_escolares', 'base_oficial_ginfotos_unidades_supabase'];
  for (const tableName of tables) {
    try {
      const { data, error } = await supabase.from(tableName).select('*').limit(2000);
      if (!error && Array.isArray(data) && data.length > 0) return { tableName, data };
    } catch {
      // tenta a próxima tabela
    }
  }
  return { tableName: '', data: [] };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(500).json({ data: [], tableName: '', count: 0, error: 'SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente no Vercel.' });
  }

  const result = await readAnyTable(supabase);
  const data = result.data
    .map(normalize)
    .sort((a, b) => String(a.designacao || a.name).localeCompare(String(b.designacao || b.name)));

  return res.status(200).json({ data, tableName: result.tableName, count: data.length, error: data.length ? null : 'Tabela de unidades vazia ou não encontrada.' });
}
