import { createFileRoute } from '@tanstack/react-router';
import { requireAuth } from '@/features/auth/guard';
import { ProfilePage } from '@/features/profile/profile-page';

export const Route = createFileRoute('/profile/')({
  beforeLoad: requireAuth,
  component: ProfilePage,
});
