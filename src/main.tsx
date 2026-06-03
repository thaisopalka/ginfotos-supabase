import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import './layout-fixes.css';
import './mobile-pwa.css';

function applyMobileClass() {
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const narrowScreen = window.innerWidth <= 1024;
  const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent);
  document.body.classList.toggle('ginfotos-mobile', coarsePointer || narrowScreen || mobileUserAgent);
}

applyMobileClass();
window.addEventListener('resize', applyMobileClass);
window.addEventListener('orientationchange', applyMobileClass);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      registration.update().catch(() => undefined);
    }).catch((error) => {
      console.warn('Service worker registration failed:', error);
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
