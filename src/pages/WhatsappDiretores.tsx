import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

interface UnidadeDiretor {
  id: string;
  name?: string | null;
  nome?: string | null;
  unidade?: string | null;
  address?: string | null;
  endereco?: string | null;
  designacao?: string | null;
  bairro?: string | null;
  telefone?: string | null;
  diretor_geral?: string | null;
  diretorGeral?: string | null;
  celular_diretor_geral?: string | null;
  celularDiretorGeral?: string | null;
  diretor_adjunto?: string | null;
  diretorAdjunto?: string | null;
  celular_diretor_adjunto?: string | null;
  celularDiretorAdjunto?: string | null;
  origem?: string;
  [key: string]: unknown;
}

const LOCAL_UNIDADES_KEY = 'ginfotos_unidades_local';

const fallbackUnidades: UnidadeDiretor[] = [
  { id: '06-22-204', designacao: '06.22.204', name: 'GET JOAO DO RIO', address: '', bairro: '', origem: 'Base provisoria' },
  { id: '06-22-001', designacao: '06.22.001', name: 'EM GUILHERME TELL', address: '', bairro: '', origem: 'Base provisoria' },
  { id: '06-25-000', designacao: '06.25.000', name: 'EM ALZIRO ZARUR', address: '', bairro: '', origem: 'Base provisoria' }
];

const defaultMessage = 'Prezada Direcao, boa tarde. Entramos em contato pela E/6 CRE/GIN sobre a unidade {designacao} - {unidade}. Poderia nos retornar, por gentileza?';

function loadLocalUnidades(): UnidadeDiretor[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_UNIDADES_KEY) || '[]') as UnidadeDiretor[];
  } catch {
    return [];
  }
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function getNome(unidade: UnidadeDiretor) {
  return unidade.name || unidade.nome || unidade.unidade || textValue(unidade['UNIDADE ESCOLAR']) || 'Unidade sem nome';
}

function getEndereco(unidade: UnidadeDiretor) {
  return unidade.address || unidade.endereco || textValue(unidade['ENDERECO']) || textValue(unidade['ENDEREÇO']) || 'Endereco nao informado';
}

function getDesignacao(unidade: UnidadeDiretor) {
  return unidade.designacao || textValue(unidade['DESIGNACAO']) || textValue(unidade['DESIGNAÇÃO']) || '';
}

function getBairro(unidade: UnidadeDiretor) {
  return unidade.bairro || textValue(unidade['BAIRRO']) || '';
}

function getTelefone(unidade: UnidadeDiretor) {
  return unidade.telefone || textValue(unidade['TELEFONE']) || '';
}

function getDiretorGeral(unidade: UnidadeDiretor) {
  return unidade.diretorGeral || unidade.diretor_geral || textValue(unidade['DIRETOR(A) GERAL']) || textValue(unidade['DIRETOR GERAL']) || '';
}

function getCelularDiretorGeral(unidade: UnidadeDiretor) {
  return unidade.celularDiretorGeral || unidade.celular_diretor_geral || textValue(unidade['CELULAR DIRETOR(A)']) || textValue(unidade['CELULAR DIRETOR']) || '';
}

function getDiretorAdjunto(unidade: UnidadeDiretor) {
  return unidade.diretorAdjunto || unidade.diretor_adjunto || textValue(unidade['DIRETOR(A) ADJUNTO(A)']) || textValue(unidade['DIRETOR ADJUNTO']) || '';
}

function getCelularDiretorAdjunto(unidade: UnidadeDiretor) {
  return unidade.celularDiretorAdjunto || unidade.celular_diretor_adjunto || textValue(unidade['CELULAR ADJUNTO(A)']) || textValue(unidade['CELULAR ADJUNTO']) || '';
}

function normalizeUnidade(unidade: UnidadeDiretor): UnidadeDiretor {
  return {
    ...unidade,
    id: unidade.id || `local-${getDesignacao(unidade) || getNome(unidade)}`,
    name: getNome(unidade),
    address: getEndereco(unidade),
    designacao: getDesignacao(unidade),
    bairro: getBairro(unidade),
    telefone: getTelefone(unidade),
    diretor_geral: getDiretorGeral(unidade),
    celular_diretor_geral: getCelularDiretorGeral(unidade),
    diretor_adjunto: getDiretorAdjunto(unidade),
    celular_diretor_adjunto: getCelularDiretorAdjunto(unidade),
    origem: unidade.origem || 'Local'
  };
}

function mergeUnidades(...groups: UnidadeDiretor[][]) {
  const map = new Map<string, UnidadeDiretor>();
  groups.flat().forEach((item) => {
    const normalized = normalizeUnidade(item);
    const key = (normalized.designacao || normalized.id || getNome(normalized)).toLowerCase();
    if (!map.has(key)) map.set(key, normalized);
  });
  return Array.from(map.values()).sort((a, b) => (getDesignacao(a) || getNome(a)).localeCompare(getDesignacao(b) || getNome(b)));
}

function normalizeBrazilPhone(value: string) {
  let digits = value.replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('550')) {
    digits = `55${digits.slice(3)}`;
  }

  if (digits.startsWith('55')) {
    return digits;
  }

  if (digits.length === 8 || digits.length === 9) {
    return `5521${digits}`;
  }

  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  return digits;
}

function buildMessage(template: string, unidade: UnidadeDiretor, pessoa: string) {
  return template
    .replaceAll('{designacao}', getDesignacao(unidade) || 'sem designacao')
    .replaceAll('{unidade}', getNome(unidade))
    .replaceAll('{bairro}', getBairro(unidade) || 'bairro nao informado')
    .replaceAll('{endereco}', getEndereco(unidade))
    .replaceAll('{diretor}', pessoa || 'Direcao');
}

function openWhatsapp(phone: string, message: string) {
  const normalized = normalizeBrazilPhone(phone);
  if (!normalized) return;
  window.open(`https://wa.me/${normalized}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
}

export default function WhatsappDiretores() {
  const [unidades, setUnidades] = useState<UnidadeDiretor[]>(fallbackUnidades);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState(defaultMessage);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    async function loadUnidades() {
      const local = loadLocalUnidades().map((item) => ({ ...item, origem: item.origem || 'Local' }));
      setUnidades(mergeUnidades(local, fallbackUnidades));

      try {
        const { data, error } = await supabase.from('unidades').select('*').order('name');
        if (!error && data && data.length > 0) {
          setUnidades(mergeUnidades(local, (data as UnidadeDiretor[]).map((item) => ({ ...item, origem: 'Supabase' })), fallbackUnidades));
        } else if (error) {
          setNotice('Base do Supabase nao carregou. Mostrando unidades locais/importadas.');
        }
      } catch {
        setNotice('Base do Supabase nao carregou. Mostrando unidades locais/importadas.');
      }
    }

    loadUnidades();
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return unidades;
    return unidades.filter((unidade) =>
      [
        getDesignacao(unidade),
        getNome(unidade),
        getEndereco(unidade),
        getBairro(unidade),
        getTelefone(unidade),
        getDiretorGeral(unidade),
        getCelularDiretorGeral(unidade),
        getDiretorAdjunto(unidade),
        getCelularDiretorAdjunto(unidade)
      ]
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }, [query, unidades]);

  const handleCopy = async (unidade: UnidadeDiretor, pessoa: string) => {
    await navigator.clipboard.writeText(buildMessage(message, unidade, pessoa));
    setNotice('Mensagem copiada para a area de transferencia.');
  };

  return (
    <div className="dashboard-page">
      <div className="top-row">
        <div>
          <p className="page-label">Comunicacao</p>
          <h1>WhatsApp Diretores</h1>
        </div>
        <span className="status-pill">{filtered.length} unidade(s)</span>
      </div>

      <section className="page-card">
        <p className="page-description">
          Busque a unidade escolar, confira telefone, direcao geral e direcao adjunta, e abra o WhatsApp com mensagem pronta.
        </p>

        <div style={{ display: 'grid', gap: 14, marginTop: 18 }}>
          <div className="field">
            <label htmlFor="busca-whatsapp">Buscar unidade, telefone ou diretor</label>
            <input
              id="busca-whatsapp"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Digite designacao, unidade, bairro, telefone ou nome do diretor"
            />
          </div>

          <div className="field">
            <label htmlFor="mensagem-whatsapp">Mensagem padrao editavel</label>
            <textarea
              id="mensagem-whatsapp"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={4}
            />
            <p className="page-description">
              Campos automaticos permitidos: {'{designacao}'}, {'{unidade}'}, {'{bairro}'}, {'{endereco}'}, {'{diretor}'}.
            </p>
          </div>
        </div>

        {notice && <p className="notice">{notice}</p>}
      </section>

      {filtered.length === 0 ? (
        <section className="empty-state">
          <p>Nenhuma unidade encontrada.</p>
        </section>
      ) : (
        <section className="stats-grid">
          {filtered.map((unidade) => {
            const diretorGeral = getDiretorGeral(unidade);
            const celularGeral = getCelularDiretorGeral(unidade);
            const diretorAdjunto = getDiretorAdjunto(unidade);
            const celularAdjunto = getCelularDiretorAdjunto(unidade);
            const telefoneUnidade = getTelefone(unidade);
            const mensagemGeral = buildMessage(message, unidade, diretorGeral);
            const mensagemAdjunto = buildMessage(message, unidade, diretorAdjunto);

            return (
              <article className="page-card" key={`${unidade.origem}-${unidade.id}-${getDesignacao(unidade)}`} style={{ padding: 20 }}>
                <p className="page-label">{getDesignacao(unidade) || 'Sem designacao'}</p>
                <h2 style={{ marginTop: 0 }}>{getNome(unidade)}</h2>
                <p className="page-description">{getEndereco(unidade)}</p>
                {getBairro(unidade) && <p className="page-description">Bairro: {getBairro(unidade)}</p>}
                <p className="page-description">Telefone da unidade: {telefoneUnidade || 'Nao informado'}</p>
                <p className="page-description">Origem da base: {unidade.origem || 'Supabase'}</p>

                <div style={{ marginTop: 18, display: 'grid', gap: 14 }}>
                  <div className="empty-state" style={{ textAlign: 'left', padding: 16 }}>
                    <p><strong>Diretor(a) Geral:</strong> {diretorGeral || 'Nao informado'}</p>
                    <p><strong>Celular:</strong> {celularGeral || 'Nao informado'}</p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="empty-button"
                        disabled={!celularGeral}
                        onClick={() => openWhatsapp(celularGeral, mensagemGeral)}
                      >
                        WhatsApp Diretor(a) Geral
                      </button>
                      <button type="button" className="empty-link" onClick={() => handleCopy(unidade, diretorGeral)}>
                        Copiar mensagem
                      </button>
                    </div>
                  </div>

                  <div className="empty-state" style={{ textAlign: 'left', padding: 16 }}>
                    <p><strong>Diretor(a) Adjunto(a):</strong> {diretorAdjunto || 'Nao informado'}</p>
                    <p><strong>Celular:</strong> {celularAdjunto || 'Nao informado'}</p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="empty-button"
                        disabled={!celularAdjunto}
                        onClick={() => openWhatsapp(celularAdjunto, mensagemAdjunto)}
                      >
                        WhatsApp Adjunto(a)
                      </button>
                      <button type="button" className="empty-link" onClick={() => handleCopy(unidade, diretorAdjunto)}>
                        Copiar mensagem
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
