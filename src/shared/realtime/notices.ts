/**
 * Avisos para a região `aria-live` da UI (mutations que falham, alterações em tempo real).
 * A UI assina com `useSyncExternalStore`; quem produz o aviso não conhece a UI.
 */
export interface Notice {
  id: number;
  kind: 'info' | 'warning' | 'error' | 'success';
  message: string;
}

type Listener = () => void;

const MAX_NOTICES = 20;
let nextId = 1;
let notices: Notice[] = [];
const listeners = new Set<Listener>();

export function pushNotice(kind: Notice['kind'], message: string): void {
  notices = [...notices, { id: nextId++, kind, message }].slice(-MAX_NOTICES);
  listeners.forEach((l) => l());
}

export function dismissNotice(id: number): void {
  notices = notices.filter((n) => n.id !== id);
  listeners.forEach((l) => l());
}

export function clearNotices(): void {
  notices = [];
  listeners.forEach((l) => l());
}

export const getNotices = (): readonly Notice[] => notices;

export function subscribeNotices(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
