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
  [key: string]: unknown;
}

const fallbackUnidades: UnidadeDiretor[] = [
  { id: '06-22-204', designacao: '06.22.204', name: 'GET JOAO DO RIO', address: '', bairro: '' },
  { id: '06-22-001', designacao: '06.22.001', name: 'EM GUILHERME TELL', address: '', bairro: '' },
  { id: '06-25-000', designacao: '06.25.000', name: 'EM ALZIRO ZARUR', address: '', bairro: '' }
];

const defaultMessage = 'Prezada Direcao, boa tarde. Entramos em contato pela E/6 CRE/GIN para tratar de informacoes relacionadas a unidade escolar.';

function textValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function getNome(unidade: UnidadeDiretor) {
  return unidade.name || unidade.nome || unidade.unidade || 'Unidade sem nome';
}

function getEndereco(unidade: UnidadeDiretor) {
  return unidade.address || unidade.endereco || 'Endereco nao informado';
}

function getDiretorGeral(unidade: UnidadeDiretor) {
  return unidade.diretorGeral || unidade.diretor_geral || textValue(unidade['DIRETOR(A) GERAL']) || '';
}

function getCelularDiretorGeral(unidade: UnidadeDiretor) {
  return unidade.celularDiretorGeral || unidade.celular_diretor_geral || textValue(unidade['CELULAR DIRETOR(A)']) || '';
}

function getDiretorAdjunto(unidade: UnidadeDiretor) {
  return unidade.diretorAdjunto || unidade.diretor_adjunto || textValue(unidade['DIRETOR(A) ADJUNTO(A)']) || '';
}

function getCelularDiretorAdjunto(unidade: UnidadeDiretor) {
  return unidade.celularDiretorAdjunto || unidade.celular_diretor_adjunto || textValue(unidade['CELULAR ADJUNTO(A)']) || '';
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
      const { data, error } = await supabase.from('unidades').select('*').order('name');
      if (!error && data && data.length > 0) {
        setUnidades(data as UnidadeDiretor[]);
      } else if (error) {
        setNotice('Base do Supabase nao carregou. Mostrando base local provisoria.');
      }
    }

    loadUnidades();
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return unidades;
    return unidades.filter((unidade) =>
      [unidade.designacao, getNome(unidade), getEndereco(unidade), unidade.bairro, getDiretorGeral(unidade), getDiretorAdjunto(unidade)]
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }, [query, unidades]);

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
          Busque a unidade escolar, confira os contatos cadastrados e abra o WhatsApp com mensagem pronta.
        </p>

        <div style={{ display: 'grid', gap: 14, marginTop: 18 }}>
          <div className="field">
            <label htmlFor="busca-whatsapp">Buscar unidade ou diretor</label>
            <input
              id="busca-whatsapp"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Digite designacao, unidade, bairro ou nome do diretor"
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

            return (
              <article className="page-card" key={unidade.id} style={{ padding: 20 }}>
                <p className="page-label">{unidade.designacao || 'Sem designacao'}</p>
                <h2 style={{ marginTop: 0 }}>{getNome(unidade)}</h2>
                <p className="page-description">{getEndereco(unidade)}</p>
                {unidade.bairro && <p className="page-description">Bairro: {unidade.bairro}</p>}
                {unidade.telefone && <p className="page-description">Telefone da unidade: {unidade.telefone}</p>}

                <div style={{ marginTop: 18, display: 'grid', gap: 14 }}>
                  <div className="empty-state" style={{ textAlign: 'left', padding: 16 }}>
                    <p><strong>Diretor(a) Geral:</strong> {diretorGeral || 'Nao informado'}</p>
                    <p><strong>Celular:</strong> {celularGeral || 'Nao informado'}</p>
                    <button
                      type="button"
                      className="empty-button"
                      disabled={!celularGeral}
                      onClick={() => openWhatsapp(celularGeral, message)}
                    >
                      Abrir WhatsApp Diretor(a) Geral
                    </button>
                  </div>

                  <div className="empty-state" style={{ textAlign: 'left', padding: 16 }}>
                    <p><strong>Diretor(a) Adjunto(a):</strong> {diretorAdjunto || 'Nao informado'}</p>
                    <p><strong>Celular:</strong> {celularAdjunto || 'Nao informado'}</p>
                    <button
                      type="button"
                      className="empty-button"
                      disabled={!celularAdjunto}
                      onClick={() => openWhatsapp(celularAdjunto, message)}
                    >
                      Abrir WhatsApp Adjunto(a)
                    </button>
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
