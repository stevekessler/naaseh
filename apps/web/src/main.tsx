import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App.js';
import { announceServiceWorkerUpdate } from './app/service-worker-update.js';
import './styles/app.css';

const applyServiceWorkerUpdate = registerSW({
  immediate: true,
  onNeedRefresh() {
    announceServiceWorkerUpdate(() => void applyServiceWorkerUpdate(true));
  },
});
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<p role="status">Loading…</p>}>
      <App />
    </Suspense>
  </StrictMode>,
);
