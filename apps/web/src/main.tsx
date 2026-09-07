import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App.js';
import { ErrorBoundary } from './app/ErrorBoundary.js';
import { installPreloadRecovery } from './app/preload-recovery.js';
import { announceServiceWorkerUpdate } from './app/service-worker-update.js';
import './styles/app.css';

installPreloadRecovery();

const applyServiceWorkerUpdate = registerSW({
  immediate: true,
  onNeedRefresh() {
    announceServiceWorkerUpdate(() => void applyServiceWorkerUpdate(true));
  },
});
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Suspense fallback={<p role="status">Loading…</p>}>
        <App />
      </Suspense>
    </ErrorBoundary>
  </StrictMode>,
);
