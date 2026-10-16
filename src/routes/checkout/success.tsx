import { createFileRoute } from '@tanstack/react-router';
import { requireAuth } from '@/features/auth/guard';
import { OrderReceiptPage } from '@/features/checkout/receipt-page';

export const Route = createFileRoute('/checkout/success')({
  validateSearch: (raw: Record<string, unknown>): { orderId?: string } =>
    typeof raw.orderId === 'string' && raw.orderId ? { orderId: raw.orderId } : {},
  beforeLoad: requireAuth,
  component: SuccessRoute,
});

function SuccessRoute() {
  const { orderId } = Route.useSearch();
  return <OrderReceiptPage orderId={orderId} />;
}
