const NOTIFICATION_EVENT = 'ginfotos-notification';

function playSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const audio = new AudioContextClass();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.value = 0.12;
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.18);
  } catch {
    // Som indisponível no navegador.
  }
}

export async function requestGinfotosNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const permission = await Notification.requestPermission();
  return permission === 'granted';
}

export async function notifyGinfotos(title: string, body: string) {
  playSound();
  window.dispatchEvent(new CustomEvent(NOTIFICATION_EVENT, { detail: { title, body } }));
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/ginfotos-logo.svg', badge: '/ginfotos-logo.svg' });
  }
}

export function onGinfotosNotification(callback: (payload: { title: string; body: string }) => void) {
  const handler = (event: Event) => callback((event as CustomEvent).detail);
  window.addEventListener(NOTIFICATION_EVENT, handler);
  return () => window.removeEventListener(NOTIFICATION_EVENT, handler);
}
