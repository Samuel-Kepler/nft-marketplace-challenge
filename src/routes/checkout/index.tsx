import { createFileRoute } from '@tanstack/react-router';
import { requireAuth } from '@/features/auth/guard';
import { CheckoutPage } from '@/features/checkout/checkout-page';

export const Route = createFileRoute('/checkout/')({
  validateSearch: (raw: Record<string, unknown>): { coupon?: string } =>
    typeof raw.coupon === 'string' && raw.coupon.trim() ? { coupon: raw.coupon.trim().slice(0, 32) } : {},
  beforeLoad: requireAuth,
  component: CheckoutRoute,
});

function CheckoutRoute() {
  const { coupon } = Route.useSearch();
  return <CheckoutPage coupon={coupon} />;
}
