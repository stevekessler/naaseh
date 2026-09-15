import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.js';
import { ErrorBoundary } from './app/ErrorBoundary.js';
import { installPreloadRecovery } from './app/preload-recovery.js';
import { signOutBrowser } from './features/auth/sign-out.js';
import { registerAppServiceWorker } from './app/register-service-worker.js';
import './styles/app.css';

installPreloadRecovery();

void registerAppServiceWorker();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary
      onResetLocalData={async () => {
        await signOutBrowser();
        window.location.reload();
      }}
    >
      <Suspense fallback={<p role="status">Loading…</p>}>
        <App />
      </Suspense>
    </ErrorBoundary>
  </StrictMode>,
);
