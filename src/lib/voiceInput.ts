type VoiceStatus = (message: string) => void;

declare global {
  interface Window {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  }
}

const fixes: Record<string, string> = {
  servicos: 'serviços',
  servico: 'serviço',
  observacoes: 'observações',
  observacao: 'observação',
  conclusao: 'conclusão',
  eletrica: 'elétrica',
  eletrico: 'elétrico',
  hidraulica: 'hidráulica',
  hidraulico: 'hidráulico',
  infiltracao: 'infiltração',
  manutencao: 'manutenção',
  substituicao: 'substituição',
  iluminacao: 'iluminação',
  direcao: 'direção',
  'ar condicionado': 'ar-condicionado',
  goteira: 'goteira',
  vazamento: 'vazamento',
  pintura: 'pintura',
  tomada: 'tomada',
  interruptor: 'interruptor',
  disjuntor: 'disjuntor',
  quadro: 'quadro',
  fio: 'fio',
  fios: 'fios',
  rampa: 'rampa',
  banheiro: 'banheiro',
  telhado: 'telhado',
  telha: 'telha',
  calha: 'calha',
  calhas: 'calhas',
  vazando: 'vazando',
  quebrado: 'quebrado',
  quebrada: 'quebrada',
  inadequado: 'inadequado',
  inadequada: 'inadequada',
  urgencia: 'urgência',
  emergencia: 'emergência',
  vistoria: 'vistoria',
  cre: 'CRE',
  gin: 'GIN',
  get: 'GET',
  ciep: 'CIEP',
  em: 'EM'
};

interface SpeechRecognitionResultLike {
  readonly transcript: string;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onresult: ((event: { results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>> }) => void) | null;
}

function smartPunctuation(text: string) {
  return text
    .replace(/\bvirgula\b/gi, ',')
    .replace(/\bponto final\b/gi, '.')
    .replace(/\bponto\b/gi, '.')
    .replace(/\bdois pontos\b/gi, ':')
    .replace(/\bponto e virgula\b/gi, ';')
    .replace(/\binterrogacao\b/gi, '?')
    .replace(/\bexclamacao\b/gi, '!');
}

function capitalizeSentences(value: string) {
  return value.replace(/(^|[.!?]\s+)([a-záéíóúâêôãõç])/g, (match) => match.toUpperCase());
}

export function cleanDictationText(value: string) {
  let text = smartPunctuation(value.trim().replace(/\s+/g, ' '));
  Object.entries(fixes).forEach(([wrong, right]) => {
    text = text.replace(new RegExp(`\\b${wrong}\\b`, 'gi'), right);
  });
  text = text.replace(/\s+([,.;:!?])/g, '$1');
  text = text.replace(/([,.;:!?])([^\s])/g, '$1 $2');
  text = text.replace(/\s+/g, ' ').trim();
  if (text && !/[.!?]$/.test(text)) text += '.';
  return text ? capitalizeSentences(text.charAt(0).toUpperCase() + text.slice(1)) : '';
}

export function appendDictation(current: string, dictated: string) {
  const cleaned = cleanDictationText(dictated);
  if (!cleaned) return current;
  if (!current.trim()) return cleaned;
  return `${current.trim()} ${cleaned}`;
}

function permissionMessage(error?: string) {
  if (error === 'not-allowed' || error === 'service-not-allowed') return 'Microfone bloqueado. Toque no cadeado do navegador e permita o microfone para o GINFOTOS.';
  if (error === 'no-speech') return 'Não ouvi sua fala. Toque novamente e fale mais perto do celular.';
  if (error === 'audio-capture') return 'Não encontrei o microfone do aparelho. Verifique a permissão do navegador.';
  if (error === 'network') return 'Falha de internet no ditado. Verifique a conexão e tente novamente.';
  return 'Não consegui captar o áudio. Permita o microfone e tente novamente.';
}

export function startVoiceInput(onText: (text: string) => void, onStatus?: VoiceStatus) {
  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognitionCtor) {
    onStatus?.('Este navegador não liberou gravação automática pelo botão. No iPhone/Safari, toque dentro do campo e use o microfone do teclado. No Android, use Chrome atualizado e permita o microfone.');
    return;
  }

  const recognition = new (SpeechRecognitionCtor as new () => SpeechRecognitionLike)();
  let receivedText = false;
  let hadError = false;

  recognition.lang = 'pt-BR';
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => onStatus?.('🎙️ GRAVANDO ÁUDIO... fale devagar. O texto será transcrito e corrigido automaticamente.');
  recognition.onerror = (event) => {
    hadError = true;
    onStatus?.(permissionMessage(event.error));
  };
  recognition.onend = () => {
    if (!hadError && receivedText) onStatus?.('✅ Áudio transcrito e texto corrigido automaticamente. Confira o campo antes de salvar.');
    if (!hadError && !receivedText) onStatus?.('Não recebi texto. Toque no botão novamente e fale com calma.');
  };
  recognition.onresult = (event) => {
    const transcript = Array.from(event.results)
      .map((result) => result[0]?.transcript || '')
      .join(' ');
    if (transcript.trim()) {
      receivedText = true;
      onText(cleanDictationText(transcript));
    }
  };

  try {
    recognition.start();
  } catch {
    onStatus?.('O gravador já está aberto ou o navegador bloqueou o microfone. Aguarde alguns segundos e tente novamente.');
  }
}