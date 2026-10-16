import { Link, useNavigate } from '@tanstack/react-router';
import { useLogout, useSession } from '@/features/auth/session';

const NAV_LINK = 'inline-flex min-h-11 items-center px-2 font-medium';

/** Navegação de conta: visitante vê "Entrar"; usuário autenticado acessa perfil, carteiras e sai. */
export function AccountNav() {
  const session = useSession();
  const navigate = useNavigate();
  const logout = useLogout();

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border bg-background px-4 py-2 sm:px-8">
      <Link to="/" className="inline-flex min-h-11 items-center text-lg font-bold text-foreground no-underline">
        NFT Marketplace
      </Link>
      <nav aria-label="Conta" className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {session ? (
          <>
            <Link to="/profile" className={NAV_LINK}>
              Perfil
            </Link>
            <Link to="/profile/wallets" className={NAV_LINK}>
              Carteiras
            </Link>
            <button
              type="button"
              disabled={logout.isPending}
              onClick={() => {
                logout.mutate();
                void navigate({ to: '/' });
              }}
            >
              Sair
            </button>
          </>
        ) : (
          <>
            <Link to="/auth/login" className={NAV_LINK}>
              Entrar
            </Link>
            <Link to="/auth/register" className={NAV_LINK}>
              Criar conta
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
