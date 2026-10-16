import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { endSession } from './features/auth/session';
import { isPrivatePath } from './features/auth/guard';
import { SESSION_EXPIRED_EVENT } from './shared/api/client';
import { createQueryClient } from './shared/api/query-client';
import { createAppRouter } from './router';
import { pushNotice } from './shared/realtime/notices';

const mocksEnabled = import.meta.env.VITE_ENABLE_MOCKS === 'true';

// Importante: `socket.io-client` (engine.io) captura `globalThis.WebSocket` ao ser avaliado. Com mocks
// ativos, o MSW só o substitui em `startMocks()`; portanto os módulos que importam o socket devem ser
// carregados (import dinâmico) DEPOIS de `enableMocks()`.
async function enableMocks() {
  if (mocksEnabled) {
    const { startMocks } = await import('./mocks/browser');
    await startMocks();
  }
}

/** Conecta o tempo real fora do caminho crítico (depois do primeiro render). */
function startRealtimeLater(queryClient: ReturnType<typeof createQueryClient>) {
  if (!mocksEnabled && !import.meta.env.VITE_SOCKET_URL) return;
  const start = () => void import('./shared/realtime/realtime').then((m) => m.startRealtime(queryClient));
  if ('requestIdleCallback' in window) window.requestIdleCallback(start);
  else setTimeout(start, 0);
}

enableMocks().then(() => {
  const queryClient = createQueryClient();
  const router = createAppRouter(queryClient);

  // O interceptor Axios só avisa; quem decide o que fazer com a sessão expirada é a aplicação.
  window.addEventListener(SESSION_EXPIRED_EVENT, () => {
    const { pathname, href } = router.state.location;
    endSession(queryClient, { expired: true });
    pushNotice('warning', 'Sua sessão expirou. Entre novamente para continuar.');
    if (isPrivatePath(pathname)) void router.navigate({ to: '/auth/login', search: { redirect: href } });
  });

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </React.StrictMode>
  );
  startRealtimeLater(queryClient);
});
