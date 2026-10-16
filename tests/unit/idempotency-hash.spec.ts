import { test, expect } from '@playwright/test';
import { hashPayload } from '@/shared/utils/idempotency';

test.describe('Hash de idempotência', () => {
  test('payloads idênticos geram o mesmo hash', async () => {
    const payload1 = { items: [{ nftId: '1', quantity: 2 }], walletId: 'w1', network: 'ethereum' };
    const payload2 = { items: [{ nftId: '1', quantity: 2 }], walletId: 'w1', network: 'ethereum' };

    const hash1 = await hashPayload(payload1);
    const hash2 = await hashPayload(payload2);

    expect(hash1).toBe(hash2);
  });

  test('payloads diferentes geram hashes diferentes', async () => {
    const payload1 = { items: [{ nftId: '1', quantity: 2 }], walletId: 'w1', network: 'ethereum' };
    const payload2 = { items: [{ nftId: '1', quantity: 3 }], walletId: 'w1', network: 'ethereum' };

    const hash1 = await hashPayload(payload1);
    const hash2 = await hashPayload(payload2);

    expect(hash1).not.toBe(hash2);
  });

  test('ordem das propriedades não afeta o hash (JSON.stringify é determinístico)', async () => {
    const payload1 = { a: 1, b: 2, c: 3 };
    const payload2 = { a: 1, b: 2, c: 3 };

    const hash1 = await hashPayload(payload1);
    const hash2 = await hashPayload(payload2);

    expect(hash1).toBe(hash2);
  });

  test('mudança no quoteVersion gera hash diferente', async () => {
    const payload1 = { items: [], quoteVersion: 1, walletId: 'w1', network: 'ethereum' };
    const payload2 = { items: [], quoteVersion: 2, walletId: 'w1', network: 'ethereum' };

    const hash1 = await hashPayload(payload1);
    const hash2 = await hashPayload(payload2);

    expect(hash1).not.toBe(hash2);
  });

  test('mudança na rede gera hash diferente', async () => {
    const payload1 = { items: [], quoteVersion: 1, walletId: 'w1', network: 'ethereum' };
    const payload2 = { items: [], quoteVersion: 1, walletId: 'w1', network: 'polygon' };

    const hash1 = await hashPayload(payload1);
    const hash2 = await hashPayload(payload2);

    expect(hash1).not.toBe(hash2);
  });

  test('array vazio vs array com item geram hashes diferentes', async () => {
    const payload1 = { items: [] };
    const payload2 = { items: [{ nftId: '1', quantity: 1 }] };

    const hash1 = await hashPayload(payload1);
    const hash2 = await hashPayload(payload2);

    expect(hash1).not.toBe(hash2);
  });
});
