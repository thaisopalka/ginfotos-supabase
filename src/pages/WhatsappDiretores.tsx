import { useEffect, useMemo, useState } from 'react';
import { fetchSupabaseUnidades, loadLocalUnidades, mergeUnidades, UnidadeApp } from '../lib/unidadesSource';

interface UnidadeDiretor extends UnidadeApp {
  nome?: string | null;
  unidade?: string | null;
  endereco?: string | null;
  diretorGeral?: string | null;
  celularDiretorGeral?: string | null;
  diretorAdjunto?: string | null;
  celularDiretorAdjunto?: string | null;
}

const fallbackUnidades: UnidadeDiretor[] = [
  { id: '06-22-204', designacao: '06.22.204', name: 'GET JOAO DO RIO', address: '', bairro: '', telefone: '', diretor_geral: '', celular_diretor_geral: '', diretor_adjunto: '', celular_diretor_adjunto: '', origem: 'Base provisoria' },
  { id: '06-22-001', designacao: '06.22.001', name: 'EM GUILHERME TELL', address: '', bairro: '', telefone: '', diretor_geral: '', celular_diretor_geral: '', diretor_adjunto: '', celular_diretor_adjunto: '', origem: 'Base provisoria' },
  { id: '06-25-000', designacao: '06.25.000', name: 'EM ALZIRO ZARUR', address: '', bairro: '', telefone: '', diretor_geral: '', celular_diretor_geral: '', diretor_adjunto: '', celular_diretor_adjunto: '', origem: 'Base provisoria' }
];

const defaultMessage = 'Prezada Direcao, boa tarde. Entramos em contato pela E/6 CRE/GIN sobre a unidade {designacao} - {unidade}. Poderia nos retornar, por gentileza?';

function getNome(unidade: UnidadeDiretor) { return unidade.name || unidade.nome || unidade.unidade || 'Unidade sem nome'; }
function getEndereco(unidade: UnidadeDiretor) { return unidade.address || unidade.endereco || 'Endereco nao informado'; }
function getDesignacao(unidade: UnidadeDiretor) { return unidade.designacao || ''; }
function getBairro(unidade: UnidadeDiretor) { return unidade.bairro || ''; }
function getTelefone(unidade: UnidadeDiretor) { return unidade.telefone || ''; }
function getDiretorGeral(unidade: UnidadeDiretor) { return unidade.diretorGeral || unidade.diretor_geral || ''; }
function getCelularDiretorGeral(unidade: UnidadeDiretor) { return unidade.celularDiretorGeral || unidade.celular_diretor_geral || ''; }
function getDiretorAdjunto(unidade: UnidadeDiretor) { return unidade.diretorAdjunto || unidade.diretor_adjunto || ''; }
function getCelularDiretorAdjunto(unidade: UnidadeDiretor) { return unidade.celularDiretorAdjunto || unidade.celular_diretor_adjunto || ''; }

function normalizeBrazilPhone(value: string) {
  let digits = value.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('550')) digits = `55${digits.slice(3)}`;
  if (digits.startsWith('55')) return digits;
  if (digits.length === 8 || digits.length === 9) return `5521${digits}`;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function replaceToken(text: string, token: string, value: string) { return text.split(token).join(value); }
function buildMessage(template: string, unidade: UnidadeDiretor, pessoa: string) {
  let output = template;
  output = replaceToken(output, '{designacao}', getDesignacao(unidade) || 'sem designacao');
  output = replaceToken(output, '{unidade}', getNome(unidade));
  output = replaceToken(output, '{bairro}', getBairro(unidade) || 'bairro nao informado');
  output = replaceToken(output, '{endereco}', getEndereco(unidade));
  output = replaceToken(output, '{diretor}', pessoa || 'Direcao');
  return output;
}

function openWhatsapp(phone: string, message: string) {
  const normalized = normalizeBrazilPhone(phone);
  const url = normalized ? `https://wa.me/${normalized}?text=${encodeURIComponent(message)}` : `https://wa.me/?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export default function WhatsappDiretores() {
  const [unidades, setUnidades] = useState<UnidadeDiretor[]>(fallbackUnidades);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState(defaultMessage);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    async function loadUnidades() {
      const local = loadLocalUnidades<UnidadeDiretor>().map((item) => ({ ...item, origem: item.origem || 'Local' }));
      setUnidades(mergeUnidades<UnidadeDiretor>(local, fallbackUnidades));
      const result = await fetchSupabaseUnidades();
      if (result.unidades.length > 0) {
        setUnidades(mergeUnidades<UnidadeDiretor>(result.unidades as UnidadeDiretor[], local, fallbackUnidades));
        setNotice(`Base carregada do Supabase: ${result.tableName} (${result.unidades.length} unidade(s)).`);
      } else {
        setNotice('Base do Supabase nao carregou. Mostrando unidades locais/importadas.');
      }
    }
    loadUnidades();
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return unidades;
    return unidades.filter((unidade) => [getDesignacao(unidade), getNome(unidade), getEndereco(unidade), getBairro(unidade), getTelefone(unidade), getDiretorGeral(unidade), getCelularDiretorGeral(unidade), getDiretorAdjunto(unidade), getCelularDiretorAdjunto(unidade)].join(' ').toLowerCase().includes(term));
  }, [query, unidades]);

  const handleCopy = async (unidade: UnidadeDiretor, pessoa: string) => {
    await navigator.clipboard.writeText(buildMessage(message, unidade, pessoa));
    setNotice('Mensagem copiada para a area de transferencia.');
  };

  return (
    <div className="dashboard-page">
      <div className="top-row"><div><p className="page-label">Comunicacao</p><h1>WhatsApp Diretores</h1></div><span className="status-pill">{filtered.length} unidade(s)</span></div>
      <section className="page-card">
        <p className="page-description">Busque a unidade escolar, confira telefone, direcao geral e direcao adjunta, e abra o WhatsApp com mensagem pronta. Sem telefone cadastrado, o app abre o WhatsApp para escolher o contato manualmente.</p>
        <div style={{ display: 'grid', gap: 14, marginTop: 18 }}>
          <div className="field"><label htmlFor="busca-whatsapp">Buscar unidade, telefone ou diretor</label><input id="busca-whatsapp" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Digite designacao, unidade, bairro, telefone ou nome do diretor" /></div>
          <div className="field"><label htmlFor="mensagem-whatsapp">Mensagem padrao editavel</label><textarea id="mensagem-whatsapp" value={message} onChange={(event) => setMessage(event.target.value)} rows={4} /><p className="page-description">Campos automaticos permitidos: {'{designacao}'}, {'{unidade}'}, {'{bairro}'}, {'{endereco}'}, {'{diretor}'}.</p></div>
        </div>
        {notice && <p className="notice">{notice}</p>}
      </section>
      {filtered.length === 0 ? <section className="empty-state"><p>Nenhuma unidade encontrada.</p></section> : (
        <section className="stats-grid">{filtered.map((unidade) => {
          const diretorGeral = getDiretorGeral(unidade); const celularGeral = getCelularDiretorGeral(unidade); const diretorAdjunto = getDiretorAdjunto(unidade); const celularAdjunto = getCelularDiretorAdjunto(unidade); const telefoneUnidade = getTelefone(unidade);
          const mensagemGeral = buildMessage(message, unidade, diretorGeral); const mensagemAdjunto = buildMessage(message, unidade, diretorAdjunto);
          return <article className="page-card" key={`${unidade.origem}-${unidade.id}-${getDesignacao(unidade)}`} style={{ padding: 20 }}><p className="page-label">{getDesignacao(unidade) || 'Sem designacao'}</p><h2 style={{ marginTop: 0 }}>{getNome(unidade)}</h2><p className="page-description">{getEndereco(unidade)}</p>{getBairro(unidade) && <p className="page-description">Bairro: {getBairro(unidade)}</p>}<p className="page-description">Telefone da unidade: {telefoneUnidade || 'Nao informado'}</p><p className="page-description">Origem da base: {unidade.origem || 'Supabase'}</p><div style={{ marginTop: 18, display: 'grid', gap: 14 }}><div className="empty-state" style={{ textAlign: 'left', padding: 16 }}><p><strong>Diretor(a) Geral:</strong> {diretorGeral || 'Nao informado'}</p><p><strong>Celular:</strong> {celularGeral || 'Nao informado'}</p><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" className="empty-button" onClick={() => openWhatsapp(celularGeral, mensagemGeral)}>WhatsApp Diretor(a) Geral</button><button type="button" className="empty-link" onClick={() => handleCopy(unidade, diretorGeral)}>Copiar mensagem</button></div></div><div className="empty-state" style={{ textAlign: 'left', padding: 16 }}><p><strong>Diretor(a) Adjunto(a):</strong> {diretorAdjunto || 'Nao informado'}</p><p><strong>Celular:</strong> {celularAdjunto || 'Nao informado'}</p><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" className="empty-button" onClick={() => openWhatsapp(celularAdjunto, mensagemAdjunto)}>WhatsApp Adjunto(a)</button><button type="button" className="empty-link" onClick={() => handleCopy(unidade, diretorAdjunto)}>Copiar mensagem</button></div></div></div></article>;
        })}</section>
      )}
    </div>
  );
}
