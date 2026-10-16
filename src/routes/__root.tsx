import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Link, Outlet, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { AccountNav } from '@/shared/components/account-nav';
import { NoticesRegion } from '@/shared/components/notices-region';

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFound,
});

/** Leva o foco ao conteúdo principal: usado pelo link "Pular" e a cada troca de página (SPA). */
function focusMain() {
  const main = document.querySelector<HTMLElement>('main');
  if (!main) return;
  main.tabIndex = -1;
  main.focus({ preventScroll: false });
}

function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const previous = useRef(pathname);
  useEffect(() => {
    // Anuncia a nova página a leitores de tela e teclado; ignora o carregamento inicial (e o StrictMode).
    if (previous.current === pathname) return;
    previous.current = pathname;
    const frame = requestAnimationFrame(focusMain);
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  return (
    <>
      <a
        href="#conteudo"
        className="skip-link"
        onClick={(e) => {
          e.preventDefault();
          focusMain();
        }}
      >
        Pular para o conteúdo
      </a>
      <AccountNav />
      <Outlet />
      <NoticesRegion />
    </>
  );
}

export function NotFound() {
  return (
    <main className="mx-auto max-w-3xl p-4 outline-none sm:p-8">
      <h1>Página não encontrada</h1>
      <p>O endereço que você acessou não existe.</p>
      <Link to="/">Voltar ao início</Link>
    </main>
  );
}
