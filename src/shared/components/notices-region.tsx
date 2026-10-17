import { useSyncExternalStore } from 'react';
import { dismissNotice, getNotices, subscribeNotices, type Notice } from '@/shared/realtime/notices';
import { cn } from '@/shared/ui/cn';

// Cada tipo tem rótulo textual + ícone + borda: o estado nunca depende apenas de cor.
const KIND: Record<Notice['kind'], { label: string; icon: string; tone: string }> = {
  info: { label: 'Informação', icon: 'ℹ', tone: 'border-primary bg-surface' },
  success: { label: 'Sucesso', icon: '✓', tone: 'border-success bg-success-surface' },
  warning: { label: 'Aviso', icon: '⚠', tone: 'border-warning bg-warning-surface' },
  error: { label: 'Erro', icon: '✕', tone: 'border-danger bg-danger-surface' },
};

/** Região `aria-live` única: leitores de tela anunciam mutations e alterações em tempo real. */
export function NoticesRegion() {
  const notices = useSyncExternalStore(subscribeNotices, getNotices, getNotices);
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      className="fixed inset-x-3 bottom-3 z-50 flex flex-col gap-2 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-96"
    >
      {notices.map((notice) => {
        const kind = KIND[notice.kind];
        return (
          <div
            key={notice.id}
            className={cn('flex items-start gap-3 rounded-md border-l-4 p-3 text-sm text-foreground shadow-lg', kind.tone)}
            data-kind={notice.kind}
          >
            <span aria-hidden="true" className="font-bold">
              {kind.icon}
            </span>
            <span className="flex-1">
              <span className="sr-only">{kind.label}: </span>
              {notice.message}
            </span>
            <button
              type="button"
              onClick={() => dismissNotice(notice.id)}
              aria-label="Dispensar aviso"
              className="-m-1 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-lg hover:bg-foreground/10"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
