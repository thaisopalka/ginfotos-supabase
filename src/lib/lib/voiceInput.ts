type VoiceStatusCallback = (message: string, isError?: boolean) => void;

declare global {
  interface Window {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  }
}

interface SpeechRecognitionResultItem {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionResultItem;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
}

const vocabulary: Record<string, string> = {
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
  infiltrações: 'infiltrações',
  manutencao: 'manutenção',
  substituicao: 'substituição',
  iluminacao: 'iluminação',
  direcao: 'direção',
  'ar condicionado': 'ar-condicionado',
  goteira: 'goteira',
  goteiras: 'goteiras',
  vazamento: 'vazamento',
  vazamentos: 'vazamentos',
  pintura: 'pintura',
  tomada: 'tomada',
  tomadas: 'tomadas',
  interruptor: 'interruptor',
  interruptores: 'interruptores',
  disjuntor: 'disjuntor',
  disjuntores: 'disjuntores',
  quadro: 'quadro',
  fio: 'fio',
  fios: 'fios',
  fiacao: 'fiação',
  rampa: 'rampa',
  banheiro: 'banheiro',
  banheiros: 'banheiros',
  telhado: 'telhado',
  telha: 'telha',
  telhas: 'telhas',
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
  vistorias: 'vistorias',
  cre: '6ª CRE',
  '6 cre': '6ª CRE',
  '6a cre': '6ª CRE',
  gin: 'GIN',
  get: 'GET',
  ciep: 'CIEP',
  edi: 'EDI',
  em: 'E.M.',
  eng: 'Engª',
  engenheira: 'Engenheira',
  engenheiro: 'Engenheiro'
};

function smartPunctuation(text: string): string {
  return text
    .replace(/\bvirgula\b/gi, ',')
    .replace(/\bponto e virgula\b/gi, ';')
    .replace(/\bdois pontos\b/gi, ':')
    .replace(/\bponto final\b/gi, '.')
    .replace(/\bponto\b/gi, '.')
    .replace(/\binterrogacao\b/gi, '?')
    .replace(/\bexclamacao\b/gi, '!');
}

function capitalizeSentences(text: string): string {
  return text.replace(/(^|[.!?]\s+)([a-záéíóúâêôãõç])/g, (_, boundary, letter: string) => `${boundary}${letter.toUpperCase()}`);
}

export function cleanDictationText(value: string): string {
  if (!value) return '';
  let text = smartPunctuation(value.trim().replace(/\s+/g, ' '));

  Object.entries(vocabulary).forEach(([wrong, right]) => {
    const regex = new RegExp(`\\b${wrong}\\b`, 'gi');
    text = text.replace(regex, right);
  });

  // Espaçamentos corretos de pontuação
  text = text.replace(/\s+([,.;:!?])/g, '$1');
  text = text.replace(/([,.;:!?])([^\s0-9])/g, '$1 $2');
  text = text.replace(/\s+/g, ' ').trim();

  if (!text) return '';
  text = text.charAt(0).toUpperCase() + text.slice(1);
  return capitalizeSentences(text);
}

export function appendDictation(current: string, newText: string): string {
  const cleaned = cleanDictationText(newText);
  if (!cleaned) return current;
  const trimmed = (current || '').trim();
  if (!trimmed) return cleaned;

  // Se o texto anterior não termina com pontuação, adiciona ponto antes da nova fala
  const endsWithPunct = /[.!?;:]$/.test(trimmed);
  const separator = endsWithPunct ? ' ' : '. ';
  return `${trimmed}${separator}${cleaned}`;
}

let activeRecognition: SpeechRecognitionInstance | null = null;

export function stopVoiceInput(): void {
  if (activeRecognition) {
    try {
      activeRecognition.stop();
    } catch {
      // ignore
    }
    activeRecognition = null;
  }
}

export interface VoiceInputOptions {
  onFinalText: (text: string) => void;
  onInterimText?: (text: string) => void;
  onStatus?: VoiceStatusCallback;
  onListeningChange?: (isListening: boolean) => void;
}

export function startVoiceInput(
  onTextOrOptions: ((text: string) => void) | VoiceInputOptions,
  legacyStatus?: VoiceStatusCallback
): { stop: () => void } {
  stopVoiceInput();

  const options: VoiceInputOptions = typeof onTextOrOptions === 'function'
    ? { onFinalText: onTextOrOptions, onStatus: legacyStatus }
    : onTextOrOptions;

  const SpeechRecognitionCtor = (window.SpeechRecognition || window.webkitSpeechRecognition) as (new () => SpeechRecognitionInstance) | undefined;

  if (!SpeechRecognitionCtor) {
    options.onStatus?.('Microfone pelo botão indisponível neste navegador. Dica: Toque no campo e use o microfone do próprio teclado do celular.', true);
    options.onListeningChange?.(false);
    return { stop: () => {} };
  }

  let recognition: SpeechRecognitionInstance;
  try {
    recognition = new SpeechRecognitionCtor();
  } catch (err) {
    options.onStatus?.('Não foi possível iniciar o microfone.', true);
    options.onListeningChange?.(false);
    return { stop: () => {} };
  }

  activeRecognition = recognition;
  let accumulatedFinal = '';
  let receivedAny = false;

  recognition.lang = 'pt-BR';
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    options.onListeningChange?.(true);
    options.onStatus?.('🎙️ Gravando... Fale pausadamente. Toque no botão novamente para parar.');
  };

  recognition.onerror = (event) => {
    options.onListeningChange?.(false);
    const err = event.error || '';
    if (err === 'no-speech') {
      options.onStatus?.('Nenhuma fala detectada. Toque no botão e tente falar mais próximo ao celular.', true);
    } else if (err === 'not-allowed' || err === 'service-not-allowed') {
      options.onStatus?.('Microfone bloqueado. Permita o microfone nas permissões do navegador.', true);
    } else if (err === 'network') {
      options.onStatus?.('Falha de rede na transcrição de voz. Verifique a internet.', true);
    } else {
      options.onStatus?.(`Gravação encerrada (${err}).`, true);
    }
  };

  recognition.onend = () => {
    options.onListeningChange?.(false);
    if (activeRecognition === recognition) {
      activeRecognition = null;
    }
    if (receivedAny) {
      options.onStatus?.('✅ Áudio transcrito com sucesso.');
    }
  };

  recognition.onresult = (event: SpeechRecognitionEventLike) => {
    let currentInterim = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const item = event.results[i];
      const text = item[0]?.transcript || '';
      if (item.isFinal) {
        accumulatedFinal += ` ${text}`;
        receivedAny = true;
        const cleaned = cleanDictationText(text);
        if (cleaned) {
          options.onFinalText(cleaned);
        }
      } else {
        currentInterim += ` ${text}`;
      }
    }

    if (options.onInterimText && currentInterim.trim()) {
      options.onInterimText(currentInterim.trim());
    }
  };

  try {
    recognition.start();
  } catch (startErr) {
    options.onListeningChange?.(false);
    options.onStatus?.('Microfone ocupado ou não liberado. Aguarde e tente novamente.', true);
  }

  return {
    stop: () => {
      try {
        recognition.stop();
      } catch {
        // ignore
      }
      if (activeRecognition === recognition) {
        activeRecognition = null;
      }
      options.onListeningChange?.(false);
    }
  };
}