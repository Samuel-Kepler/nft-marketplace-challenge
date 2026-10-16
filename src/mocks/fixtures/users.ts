import type { User } from '@/shared/schemas/user';
import type { Wallet } from '@/shared/schemas/wallet';

export interface StoredUser extends User {
  salt: string;
  /** sha256(`${salt}:${password}`) em hexadecimal — nunca a senha em claro. */
  passwordHash: string;
}

/** Credenciais fictícias (documentadas no README da solução). */
export const FIXTURE_CREDENTIALS = {
  ana: { email: 'ana@example.com', password: 'Senha@123' },
  bruno: { email: 'bruno@example.com', password: 'Senha@456' },
} as const;

export const FIXTURE_DATE = '2026-01-01T00:00:00.000Z';

export const createUsers = (): StoredUser[] => [
  {
    id: 'user-1',
    email: FIXTURE_CREDENTIALS.ana.email,
    name: 'Ana Souza',
    createdAt: FIXTURE_DATE,
    salt: 'salt-ana',
    passwordHash: 'e5876b8c973f8767dc53b37bd7762cfb40f00ece49fd94d3dafb972068229e9a',
  },
  {
    id: 'user-2',
    email: FIXTURE_CREDENTIALS.bruno.email,
    name: 'Bruno Lima',
    createdAt: FIXTURE_DATE,
    salt: 'salt-bruno',
    passwordHash: 'a45248a588eca5ae6533b4149040b4ef8a6b2a19ea7d2fc882dbd5fa23b2b4b6',
  },
];

export const createWallets = (): Wallet[] => [
  {
    id: 'wallet-1',
    userId: 'user-1',
    address: '0x1111111111111111111111111111111111111111',
    network: 'ethereum',
    isPrimary: true,
    label: 'Principal',
    isConnected: false,
    createdAt: FIXTURE_DATE,
  },
  {
    id: 'wallet-2',
    userId: 'user-1',
    address: '0x2222222222222222222222222222222222222222',
    network: 'polygon',
    isPrimary: false,
    label: 'Secundária',
    isConnected: false,
    createdAt: FIXTURE_DATE,
  },
  {
    id: 'wallet-3',
    userId: 'user-2',
    address: '0x3333333333333333333333333333333333333333',
    network: 'ethereum',
    isPrimary: true,
    label: 'Principal',
    isConnected: false,
    createdAt: FIXTURE_DATE,
  },
];

export const createFavorites = (): Record<string, string[]> => ({
  'user-1': ['nft-004'],
  'user-2': [],
});
