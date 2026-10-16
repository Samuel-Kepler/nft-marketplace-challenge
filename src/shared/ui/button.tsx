import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

/** Botão shadcn/ui adaptado à identidade (tokens em `index.css`). Alvo mínimo de 44px. */
export const buttonVariants = cva(
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold no-underline transition-colors disabled:pointer-events-none disabled:opacity-55',
  {
    variants: {
      variant: {
        primary: 'border border-primary bg-primary text-primary-foreground hover:bg-primary-hover hover:text-primary-foreground',
        outline: 'border border-input bg-background text-foreground hover:bg-surface hover:text-foreground',
        ghost: 'text-foreground hover:bg-surface hover:text-foreground',
      },
      size: { default: '', lg: 'min-h-12 px-6 text-base', icon: 'size-11 px-0' },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  }
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, type = 'button', ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return <Comp {...(!asChild && { type })} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
