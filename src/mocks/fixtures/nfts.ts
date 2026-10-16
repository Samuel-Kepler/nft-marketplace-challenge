import type { Nft } from '@/shared/schemas/nft';
import { FIXTURE_DATE } from './users';

const ADJECTIVES = ['Aurora', 'Neon', 'Cosmic', 'Velvet', 'Crystal', 'Lunar', 'Solar', 'Mystic'];
const NOUNS = ['Drift', 'Echo', 'Bloom', 'Horizon', 'Pulse', 'Mirage'];
const ARTISTS = ['Lia Torres', 'Marco Reis', 'Yuki Tanaka', 'Noor Haddad', 'Iris Moreau', 'Caio Prado'];
export const CATEGORIES = ['art', 'music', 'photography', 'collectibles'] as const;
export const RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;
const PRICES = ['0.05', '0.12', '0.25', '0.5', '0.75', '1.2', '1.5', '2.25', '3.1'];
const DAY_MS = 86_400_000;

export const NFT_COUNT = 48;
const pad = (n: number) => String(n).padStart(3, '0');

function build(i: number): Nft {
  const id = `nft-${pad(i)}`;
  const price = PRICES[(i * 7) % PRICES.length]!;
  const availableQuantity = i % 7 === 0 ? 0 : 1 + ((i * 3) % 9);
  return {
    id,
    title: `${ADJECTIVES[i % ADJECTIVES.length]} ${NOUNS[Math.floor(i / ADJECTIVES.length) % NOUNS.length]}`,
    description: `Obra digital ${id} da coleção ${CATEGORIES[i % CATEGORIES.length]}.`,
    artist: ARTISTS[i % ARTISTS.length]!,
    imageUrl: `/assets/nfts/${id}.jpg`,
    gallery: [1, 2, 3].map((n) => `/assets/nfts/${id}-${n}.jpg`),
    price,
    availableQuantity,
    isAvailable: availableQuantity > 0,
    featured: i % 8 === 1,
    category: CATEGORIES[i % CATEGORIES.length]!,
    rarity: RARITIES[(i * 5) % RARITIES.length]!,
    createdAt: new Date(Date.parse(FIXTURE_DATE) + i * DAY_MS).toISOString(),
    version: 1,
  };
}

/**
 * Catálogo determinístico de 48 NFTs (3 páginas com limit=20).
 * Âncoras para testes: nft-001 (0.5 ETH, qty 5, destaque), nft-002 (duas edições),
 * nft-003 (esgotado). O restante é gerado por fórmula, sem aleatoriedade.
 */
export function createNfts(): Nft[] {
  const nfts = Array.from({ length: NFT_COUNT }, (_, k) => build(k + 1));

  Object.assign(nfts[0]!, {
    title: 'Aurora Drift',
    price: '0.5',
    availableQuantity: 5,
    isAvailable: true,
    featured: true,
    category: 'art',
    rarity: 'rare',
  });

  const withEditions = nfts[1]!;
  withEditions.editions = [
    { id: 'standard', name: 'Standard', price: '0.8', availableQuantity: 3 },
    { id: 'collector', name: 'Collector', price: '1.5', availableQuantity: 1 },
  ];
  withEditions.price = '0.8';
  withEditions.availableQuantity = 4;
  withEditions.isAvailable = true;

  Object.assign(nfts[2]!, { availableQuantity: 0, isAvailable: false });

  // Edição a cada 6 NFTs a partir do nft-006, para variar o filtro/cálculo.
  for (let i = 6; i <= NFT_COUNT; i += 6) {
    const n = nfts[i - 1]!;
    n.editions = [
      { id: 'standard', name: 'Standard', price: n.price, availableQuantity: n.availableQuantity },
    ];
  }
  return nfts;
}
