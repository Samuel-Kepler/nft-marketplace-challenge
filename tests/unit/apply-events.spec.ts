import { test, expect } from '@playwright/test';
import { applyNftEvent, applyNftEventToCartLine, applyOrderEvent } from '@/shared/realtime/apply-events';
import type { CartLine } from '@/shared/schemas/cart';
import type { NftUpdatedEvent, OrderUpdatedEvent } from '@/shared/schemas/events';
import type { Nft } from '@/shared/schemas/nft';
import type { Order } from '@/shared/schemas/order';

const nft: Nft = {
  id: 'n1',
  title: 'Um',
  description: '',
  artist: 'A',
  imageUrl: '/a.png',
  gallery: [],
  price: '1',
  availableQuantity: 5,
  isAvailable: true,
  featured: false,
  category: 'art',
  editions: [
    { id: 'std', name: 'Std', price: '1', availableQuantity: 3 },
    { id: 'col', name: 'Col', price: '2', availableQuantity: 2 },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  version: 3,
};

const nftEvent = (over: Partial<NftUpdatedEvent> = {}): NftUpdatedEvent => ({
  eventId: 'e1',
  resource: 'nft',
  id: 'n1',
  version: 4,
  price: '1.5',
  availableQuantity: 0,
  isAvailable: false,
  timestamp: '2026-01-02T00:00:00.000Z',
  ...over,
});

const line: CartLine = {
  key: 'n1:col',
  nftId: 'n1',
  editionId: 'col',
  title: 'Um',
  imageUrl: '/a.png',
  price: '2',
  quantity: 2,
  maxQuantity: 2,
  subtotal: '4',
};

test.describe('applyNftEvent', () => {
  test('versão nova atualiza preço, estoque e versão', () => {
    expect(applyNftEvent(nft, nftEvent())).toMatchObject({ price: '1.5', availableQuantity: 0, isAvailable: false, version: 4 });
  });

  test('evento antigo ou repetido devolve a mesma referência (sem regredir)', () => {
    expect(applyNftEvent(nft, nftEvent({ version: 3 }))).toBe(nft);
    expect(applyNftEvent(nft, nftEvent({ version: 1 }))).toBe(nft);
  });

  test('evento de outro NFT é ignorado', () => {
    expect(applyNftEvent(nft, nftEvent({ id: 'outro' }))).toBe(nft);
  });

  test('atualiza só as edições citadas', () => {
    const next = applyNftEvent(nft, nftEvent({ editions: [{ id: 'col', price: '3', availableQuantity: 0 }] }));
    expect(next.editions).toEqual([
      { id: 'std', name: 'Std', price: '1', availableQuantity: 3 },
      { id: 'col', name: 'Col', price: '3', availableQuantity: 0 },
    ]);
  });
});

test.describe('applyNftEventToCartLine', () => {
  test('usa preço e limite da edição escolhida e recalcula o subtotal da linha', () => {
    const next = applyNftEventToCartLine(line, nftEvent({ editions: [{ id: 'col', price: '2.5', availableQuantity: 1 }] }));
    expect(next).toMatchObject({ price: '2.5', maxQuantity: 1, subtotal: '5' });
  });

  test('sem mudança real devolve a mesma referência', () => {
    const same = nftEvent({ editions: [{ id: 'col', price: '2', availableQuantity: 2 }] });
    expect(applyNftEventToCartLine(line, same)).toBe(line);
  });

  test('linha de outro NFT não muda', () => {
    expect(applyNftEventToCartLine(line, nftEvent({ id: 'x' }))).toBe(line);
  });

  test('sem edição, usa os valores do NFT', () => {
    const plain: CartLine = { ...line, key: 'n1', editionId: undefined, price: '1', subtotal: '2' };
    expect(applyNftEventToCartLine(plain, nftEvent())).toMatchObject({ price: '1.5', maxQuantity: 0, subtotal: '3' });
  });
});

const order: Order = {
  id: 'o1',
  userId: 'u1',
  status: 'PENDING',
  items: [],
  buyer: { name: 'Ana', email: 'ana@example.com' },
  quote: { subtotal: '1', discount: '0', networkFee: '0', total: '1' },
  walletId: 'w1',
  network: 'ethereum',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  version: 1,
};

const orderEvent = (over: Partial<OrderUpdatedEvent> = {}): OrderUpdatedEvent => ({
  eventId: 'oe1',
  resource: 'order',
  id: 'o1',
  userId: 'u1',
  version: 2,
  status: 'CONFIRMED',
  transactionHash: '0xabc',
  timestamp: '2026-01-02T00:00:00.000Z',
  ...over,
});

test.describe('applyOrderEvent', () => {
  test('PENDING → CONFIRMED com hash da transação', () => {
    expect(applyOrderEvent(order, orderEvent())).toMatchObject({ status: 'CONFIRMED', transactionHash: '0xabc', version: 2 });
  });

  test('estado terminal não regride com evento antigo', () => {
    const confirmed = applyOrderEvent(order, orderEvent());
    expect(applyOrderEvent(confirmed, orderEvent({ version: 1, status: 'PENDING' }))).toBe(confirmed);
  });

  test('o recibo (itens e cotação) permanece o snapshot original', () => {
    const next = applyOrderEvent(order, orderEvent());
    expect(next.items).toBe(order.items);
    expect(next.quote).toBe(order.quote);
  });
});
