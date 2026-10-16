import { setupWorker } from 'msw/browser';
import { createMockEnvironment } from './environment';
import { isScenarioName } from './scenarios';

export const mockEnv = createMockEnvironment({ storage: window.localStorage });
export const worker = setupWorker(...mockEnv.handlers);

/**
 * Liga o MSW (REST via Service Worker, Socket.IO via `ws` na página) e retoma o que o
 * refresh interrompeu. `?scenario=NOME` (lido só aqui) seleciona o cenário inicial.
 */
export async function startMocks(): Promise<void> {
  await worker.start({ onUnhandledRequest: 'bypass', quiet: true });
  mockEnv.db.resumePendingOrders();

  const requested = new URL(window.location.href).searchParams.get('scenario');
  if (isScenarioName(requested) && requested !== mockEnv.db.scenario.name) {
    mockEnv.db.setScenario(requested);
  }
}
