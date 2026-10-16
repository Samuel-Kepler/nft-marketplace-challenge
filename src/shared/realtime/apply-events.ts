import type { CartLine } from '@/shared/schemas/cart';
import type { NftUpdatedEvent, OrderUpdatedEvent } from '@/shared/schemas/events';
import type { Nft } from '@/shared/schemas/nft';
import type { Order } from '@/shared/schemas/order';
import { mulEth } from '@/shared/utils/eth';

/**
 * Funções puras: aplicam um evento a um recurso em cache. Quando o recurso já está na versão do
 * evento (ou além), devolvem a MESMA referência, o que torna a aplicação idempotente e permite ao
 * chamador saber se algo mudou (`next !== prev`) antes de disparar efeitos como avisos.
 */

export function applyNftEvent(nft: Nft, event: NftUpdatedEvent): Nft {
  if (nft.id !== event.id || event.version <= nft.version) return nft;
  const byEdition = new Map(event.editions?.map((e) => [e.id, e]));
  return {
    ...nft,
    price: event.price,
    availableQuantity: event.availableQuantity,
    isAvailable: event.isAvailable,
    version: event.version,
    editions: nft.editions?.map((edition) => {
      const update = byEdition.get(edition.id);
      return update ? { ...edition, price: update.price, availableQuantity: update.availableQuantity } : edition;
    }),
  };
}

/** Linha do carrinho: preço e limite vêm da edição escolhida (se houver) ou do NFT. */
export function applyNftEventToCartLine(line: CartLine, event: NftUpdatedEvent): CartLine {
  if (line.nftId !== event.id) return line;
  const edition = line.editionId ? event.editions?.find((e) => e.id === line.editionId) : undefined;
  const price = edition?.price ?? event.price;
  const maxQuantity = edition?.availableQuantity ?? event.availableQuantity;
  if (price === line.price && maxQuantity === line.maxQuantity) return line;
  return { ...line, price, maxQuantity, subtotal: mulEth(price, line.quantity) };
}

export function applyOrderEvent(order: Order, event: OrderUpdatedEvent): Order {
  if (order.id !== event.id || event.version <= order.version) return order;
  return {
    ...order,
    status: event.status,
    version: event.version,
    updatedAt: event.timestamp,
    ...(event.transactionHash !== undefined && { transactionHash: event.transactionHash }),
    ...(event.errorMessage !== undefined && { errorMessage: event.errorMessage }),
  };
}
