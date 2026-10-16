import { test, expect } from '@playwright/test';
import { EventDeduplicator } from '@/shared/utils/realtime-dedup';

test.describe('Deduplicação de eventos em tempo real', () => {
  test('processa evento com versão nova', () => {
    const dedup = new EventDeduplicator();
    const result = dedup.shouldProcess('nft', '1', 1, 'event-1');
    expect(result).toBe(true);
  });

  test('descarta evento com mesma versão (duplicata exata)', () => {
    const dedup = new EventDeduplicator();
    dedup.shouldProcess('nft', '1', 1, 'event-1');
    const result = dedup.shouldProcess('nft', '1', 1, 'event-1');
    expect(result).toBe(false);
  });

  test('descarta evento com versão antiga', () => {
    const dedup = new EventDeduplicator();
    dedup.shouldProcess('nft', '1', 2, 'event-2');
    const result = dedup.shouldProcess('nft', '1', 1, 'event-1');
    expect(result).toBe(false);
  });

  test('processa evento com versão mais recente', () => {
    const dedup = new EventDeduplicator();
    dedup.shouldProcess('nft', '1', 1, 'event-1');
    const result = dedup.shouldProcess('nft', '1', 2, 'event-2');
    expect(result).toBe(true);
  });

  test('descarta evento duplicado pelo eventId', () => {
    const dedup = new EventDeduplicator();
    dedup.shouldProcess('nft', '1', 1, 'event-1');
    const result = dedup.shouldProcess('nft', '1', 2, 'event-1');
    expect(result).toBe(false);
  });

  test('recursos diferentes são isolados', () => {
    const dedup = new EventDeduplicator();
    dedup.shouldProcess('nft', '1', 1, 'event-1');
    const result = dedup.shouldProcess('order', '1', 1, 'event-2');
    expect(result).toBe(true);
  });

  test('IDs diferentes no mesmo recurso são isolados', () => {
    const dedup = new EventDeduplicator();
    dedup.shouldProcess('nft', '1', 1, 'event-1');
    const result = dedup.shouldProcess('nft', '2', 1, 'event-2');
    expect(result).toBe(true);
  });

  test('limita eventIdSet a 200 entradas (FIFO)', () => {
    const dedup = new EventDeduplicator();

    for (let i = 1; i <= 250; i++) {
      dedup.shouldProcess('nft', `${i}`, 1, `event-${i}`);
    }

    const resultOld = dedup.shouldProcess('nft', '1', 2, 'event-1');
    expect(resultOld).toBe(true);

    const resultRecent = dedup.shouldProcess('nft', '200', 2, 'event-200');
    expect(resultRecent).toBe(false);
  });

  test('clear limpa todos os estados', () => {
    const dedup = new EventDeduplicator();
    dedup.shouldProcess('nft', '1', 1, 'event-1');
    dedup.clear();

    const result = dedup.shouldProcess('nft', '1', 1, 'event-1');
    expect(result).toBe(true);
  });
});
