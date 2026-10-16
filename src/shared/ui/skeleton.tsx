import type { HTMLAttributes } from 'react';
import { cn } from './cn';

/** Bloco de carregamento decorativo (shimmer; estático sob `prefers-reduced-motion`). Quem usa reserva a dimensão. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn('skeleton', className)} {...props} />;
}
