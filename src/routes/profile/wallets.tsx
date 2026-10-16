import { createFileRoute } from '@tanstack/react-router';
import { requireAuth } from '@/features/auth/guard';
import { WalletsPage } from '@/features/wallets/wallets-page';

export const Route = createFileRoute('/profile/wallets')({
  beforeLoad: requireAuth,
  component: WalletsPage,
});
