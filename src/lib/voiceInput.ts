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
  infiltracao: 'infiltração',
  manutencao: 'manutenção',
  substituicao: 'substituição',
  iluminacao: 'iluminação',
  direcao: 'direção',
  unidade escolar: 'unidade escolar',
  ar condicionado: 'ar-condicionado',
  goteira: 'goteira',
  vazamento: 'vazamento',
  pintura: 'pintura',
  tomada: 'tomada',
  interruptor: 'interruptor'
};

export function cleanDictationText(value: string) {
  let text = value.trim().replace(/\s+/g, ' ');
  Object.entries(fixes).forEach(([wrong, right]) => {
    text = text.replace(new RegExp(`\\b${wrong}\\b`, 'gi'), right);
  });
  text = text.replace(/\s+([,.;:!?])/g, '$1');
  if (text && !/[.!?]$/.test(text)) text += '.';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function appendDictation(current: string, dictated: string) {
  const cleaned = cleanDictationText(dictated);
  if (!current.trim()) return cleaned;
  return `${current.trim()} ${cleaned}`;
}

export function startVoiceInput(onText: (text: string) => void, onStatus?: VoiceStatus) {
  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognitionCtor) {
    onStatus?.('Este navegador não liberou ditado por voz. Use Google Chrome atualizado e permita o microfone.');
    return;
  }

  const recognition = new (SpeechRecognitionCtor as new () => {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
    maxAlternatives: number;
    start: () => void;
    stop: () => void;
    onstart: (() => void) | null;
    onend: (() => void) | null;
    onerror: ((event: { error?: string }) => void) | null;
    onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  })();

  recognition.lang = 'pt-BR';
  recognition.interimResults = false;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => onStatus?.('🎤 Gravando... fale devagar e com calma.');
  recognition.onerror = () => onStatus?.('Não consegui captar o áudio. Verifique a permissão do microfone e tente novamente.');
  recognition.onend = () => onStatus?.('Ditado finalizado. O texto foi transcrito com correção básica.');
  recognition.onresult = (event) => {
    const transcript = Array.from(event.results)
      .map((result) => result[0]?.transcript || '')
      .join(' ');
    onText(cleanDictationText(transcript));
  };

  recognition.start();
}
