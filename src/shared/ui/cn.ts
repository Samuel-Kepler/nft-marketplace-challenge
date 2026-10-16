import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Utilitário padrão do shadcn/ui: combina classes condicionais e resolve conflitos do Tailwind. */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
