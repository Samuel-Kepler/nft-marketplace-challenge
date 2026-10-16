import { useLocation, useNavigate } from '@tanstack/react-router';
import { useSession } from '@/features/auth/session';
import { useFavorites, useToggleFavorite } from '../queries';

/** Favorito com atualização otimista; visitante é levado ao login e volta para a mesma tela. */
export function FavoriteButton({ nftId, title, className = '' }: { nftId: string; title: string; className?: string }) {
  const session = useSession();
  const navigate = useNavigate();
  const href = useLocation({ select: (l) => l.href });
  const favorites = useFavorites();
  const toggle = useToggleFavorite();
  const isFavorite = favorites.data?.nftIds.includes(nftId) ?? false;

  const onClick = () => {
    if (!session) {
      void navigate({ to: '/auth/login', search: { redirect: href } });
      return;
    }
    toggle.mutate({ nftId, favorite: !isFavorite });
  };

  return (
    <button
      type="button"
      aria-pressed={isFavorite}
      aria-label={isFavorite ? `Remover ${title} dos favoritos` : `Favoritar ${title}`}
      onClick={onClick}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full border border-input bg-background px-3 text-sm font-medium text-foreground shadow-sm hover:bg-surface ${className}`}
    >
      <span aria-hidden="true">{isFavorite ? '♥' : '♡'}</span>
      <span className="sr-only sm:not-sr-only">{isFavorite ? 'Favoritado' : 'Favoritar'}</span>
    </button>
  );
}
