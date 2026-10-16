# SPEC-001: Refatoração de Arquitetura & Alinhamento de Design Tokens (MCP)
**Branch:** `feat/gemini-refactor-mcp`  
**Papel:** Lead Research Agent & Spec Architect  
**Destinatário:** Claude Code (Tech Lead & Senior Dev) & Jev (Decisor Técnico)  
**Status:** PRONTO PARA EXECUÇÃO  

---

## 1. Sumário Executivo & Diagnóstico

A branch `feat/gemini-refactor-mcp` visa desacoplar valores arbitrários de CSS, sanar discrepâncias de arredondamento em operações financeiras com ETH e padronizar o consumo de schemas de validação Zod sem quebrar os 336 testes E2E do Playwright ou violar os contratos mockados do MSW.

### Objetivos Principais
1. **Design Tokens Nativo (Tailwind v4 `@theme`):** Eliminar declarações manuais redundantes (`tailwind.config.js`) e migrar 100% dos tokens mapeados no Figma via MCP diretamente para o bloco `@theme` no `src/index.css`.
2. **Integração Arquitetural Figma MCP:** Definir workflow determinístico de extração de nós Figma via MCP server para mapeamento direto em CSS vars e classes Tailwind.
3. **Aritmética ETH de Alta Precisão (`BigInt` / Wei base):** Proibir ponto flutuante (`Number`) em qualquer soma, subtração ou cálculo de taxas no carrinho/checkout (`src/shared/utils/eth.ts`).
4. **Governança Estrita & Zero Regressão:** Garantir que nenhum contrato de seletor (`data-testid`), URL param (`TanStack Router`) ou payload de mock (`MSW`) seja quebrado.

---

## 2. Sincronização de Design Tokens (Tailwind CSS v4 `@theme`)

### 2.1 Análise da Arquitetura Tailwind v4
No Tailwind v4, a configuração via arquivo JS/TS é substituída pelo motor CSS-first. Todas as variáveis de tema devem residir em `src/index.css` via diretiva `@theme`.

### 2.2 Especificação do `src/index.css`
A refatoração deve consolidar cores, fontes, bordas e sombras do layout Figma (`node-id=0-1`) nos tokens canônicos:

```css
@import "tailwindcss";

@theme {
  /* Cores Primitivas e Semânticas extraídas do Figma */
  --color-background: #0B0E14;
  --color-surface: #151921;
  --color-surface-hover: #1E232E;
  --color-surface-subtle: #11141B;
  --color-border: #232936;
  --color-border-focus: #4F46E5;

  /* Cores de Destaque / Brand */
  --color-primary: #6366F1;
  --color-primary-hover: #4F46E5;
  --color-primary-foreground: #FFFFFF;

  /* Feedback */
  --color-danger: #EF4444;
  --color-danger-surface: rgba(239, 68, 68, 0.1);
  --color-success: #10B981;
  --color-success-surface: rgba(16, 185, 129, 0.1);

  /* Tipografia */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* Raios de Borda */
  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;
  --radius-full: 9999px;

  /* Sombras */
  --shadow-card: 0 4px 20px -2px rgba(0, 0, 0, 0.5);
  --shadow-popover: 0 10px 30px -4px rgba(0, 0, 0, 0.7);
}

@layer base {
  body {
    background-color: var(--color-background);
    color: #F3F4F6;
    font-family: var(--font-sans);
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }
}
```

### 2.3 Regras de Conformidade
- **Navalha de Occam:** Proibido o uso de pacotes de pré-processamento de design tokens (como `style-dictionary` ou scripts pesados de terceiros). A extração via MCP gera tokens direto para variáveis CSS consumidas no `@theme`.
- Classes arbitrárias como `bg-[#151921]` encontradas nos componentes (`src/features/**/*.tsx`, `src/shared/ui/**/*.tsx`) devem ser refatoradas para classes de token geradas: `bg-surface`, `border-border`, `text-primary`.

---

## 3. Integração com Conector Figma MCP (Model Context Protocol)

### 3.1 Padrão Operacional do Conector
O MCP Server do Figma deve ser consultado em modo de leitura (Read-Only) para extrair o grafo de nós (nodes), estilos e propriedades autolayout do frame raiz `0:1`:

1. **Leitura via MCP Tool:** `figma_get_file_nodes` com `fileKey: "Ff0SksUi7UFtPWUO8kyNtw"`, `ids: ["0:1"]`.
2. **Normalização de Tokens:** O Claude Code usará o output JSON dos nós para validar paddings, gaps de flexbox, border-radii e tipografia exata.
3. **Mapeamento de Componentes Shadcn/UI:**
   - Componentes em `src/shared/ui/` devem espelhar as variantes encontradas no design:
     - `Button`: Variantes `default`, `secondary`, `destructive`, `outline`, `ghost`, `link`.
     - Layout: Estruturas de grid `grid-cols-1 md:grid-cols-2 lg:grid-cols-4` para o catálogo (`src/features/nfts/components/catalog-filters.tsx`).

---

## 4. Tipagem Segura com Zod & Aritmética ETH com BigInt

### 4.1 O Problema do Ponto Flutuante
`0.1 + 0.2 === 0.30000000000000004`. Em aplicações de marketplace Web3/Crypto, o uso de `Number` para somar parcelas de ETH, descontos percentuais e taxas de rede gera inconsistência nos asserts de tela do Playwright (ex: `0.0030000000000000004 ETH` ao invés de `0.003 ETH`).

### 4.2 Módulo de Utilidade: `src/shared/utils/eth.ts`
Implementação puramente nativa baseada em ponto fixo com escala de 18 casas decimais (Wei) usando `BigInt`.

```typescript
const WEI_DECIMALS = 18n;
const WEI_FACTOR = 10n ** WEI_DECIMALS;

/**
 * Converte string ETH (ex: "0.0045") em BigInt Wei
 */
export function parseEthToWei(value: string | number): bigint {
  const [integers, decimals = ''] = String(value).split('.');
  const paddedDecimals = decimals.padEnd(Number(WEI_DECIMALS), '0').slice(0, Number(WEI_DECIMALS));
  const fullWeiString = `${integers}${paddedDecimals}`.replace(/^0+/, '') || '0';
  return BigInt(fullWeiString);
}

/**
 * Converte BigInt Wei em string ETH legível com truncamento/arredondamento controlado
 */
export function formatWeiToEth(wei: bigint, maxDecimals: number = 4): string {
  const isNegative = wei < 0n;
  const absWei = isNegative ? -wei : wei;

  const integers = absWei / WEI_FACTOR;
  const remainder = absWei % WEI_FACTOR;

  let decimals = remainder.toString().padStart(Number(WEI_DECIMALS), '0');
  decimals = decimals.slice(0, maxDecimals).replace(/0+$/, '');

  const result = decimals.length > 0 ? `${integers}.${decimals}` : `${integers}`;
  return `${isNegative ? '-' : ''}${result}`;
}

/**
 * Cálculos determinísticos para o Carrinho e Checkout
 */
export function calculateOrderTotals(
  items: Array<{ priceEth: string; quantity: number }>,
  discountPercent: number = 0,
  networkFeeEth: string = "0.001"
) {
  const subtotalWei = items.reduce((acc, item) => {
    const itemWei = parseEthToWei(item.priceEth);
    return acc + (itemWei * BigInt(item.quantity));
  }, 0n);

  const discountWei = (subtotalWei * BigInt(discountPercent)) / 100n;
  const networkFeeWei = parseEthToWei(networkFeeEth);
  const totalWei = subtotalWei - discountWei + networkFeeWei;

  return {
    subtotalEth: formatWeiToEth(subtotalWei),
    discountEth: formatWeiToEth(discountWei),
    networkFeeEth: formatWeiToEth(networkFeeWei),
    totalEth: formatWeiToEth(totalWei > 0n ? totalWei : 0n),
    raw: { subtotalWei, discountWei, networkFeeWei, totalWei }
  };
}
```

### 4.3 Schemas Zod Estritos (`src/shared/schemas/`)
- **Validação de Preço de NFT (`nft.ts`):**
  ```typescript
  import { z } from 'zod';

  export const EthPriceSchema = z.string().regex(/^\d+(\.\d{1,18})?$/, {
    message: "Preço em ETH inválido"
  });

  export const NftSchema = z.object({
    id: z.string().uuid(),
    title: z.string().min(1),
    collection: z.string().min(1),
    price: EthPriceSchema,
    availableQuantity: z.number().int().nonnegative(),
    imageUrl: z.string().url(),
    isFavorite: z.boolean().default(false)
  });
  ```
- **Validação de Checkout (`order.ts`):**
  Evitar campos numéricos ambíguos. A validação de entrada de cupons aceita apenas strings sanitizadas (trim e uppercase).

---

## 5. Garantia de Compatibilidade com MSW e Testes E2E (Playwright)

Para manter os 336 testes E2E íntegros e verdes, a refatoração deve respeitar estritamente os seguintes contratos:

### 5.1 Preservação de Atributos `data-testid`
Nenhum atributo existente deve ser renomeado ou removido.
- **Catálogo:** `data-testid="search-input"`, `data-testid="filter-collection"`, `data-testid="sort-select"`, `data-testid="nft-card-${id}"`
- **Carrinho & Checkout:** `data-testid="cart-item-${id}"`, `data-testid="coupon-input"`, `data-testid="btn-apply-coupon"`, `data-testid="subtotal-value"`, `data-testid="total-value"`, `data-testid="btn-submit-order"`
- **Detalhes:** `data-testid="nft-buy-button"`, `data-testid="nft-favorite-button"`

### 5.2 Roteamento TanStack Router & Sincronização de Estado na URL
- O catálogo (`src/routes/index.tsx`) deve continuar sincronizando a busca, filtros e paginação diretamente na URL search string:
  ```typescript
  // src/features/nfts/search.ts
  export const NftCatalogSearchSchema = z.object({
    page: z.number().int().catch(1),
    q: z.string().catch(''),
    category: z.string().catch(''),
    sort: z.enum(['price_asc', 'price_desc', 'recent']).catch('recent')
  });
  ```
- A mudança em qualquer filtro de catálogo deve reiniciar a propriedade `page` para `1`.

### 5.3 Contratos de Resposta MSW (`src/mocks/handlers/`)
- Respostas mockadas em `src/mocks/handlers/route.ts` retornam os totais calculados no backend simulado.
- Os cálculos do frontend via `calculateOrderTotals` devem bater precisamente com as respostas das fixtures `src/mocks/fixtures/` e handlers do MSW.

---

## 6. Tarefas de Implementação para o Claude Code

```markdown
- [ ] **Fase 1: Sincronização de Estilos & Tailwind v4**
  - [ ] Consolidar variáveis do design system do Figma em `src/index.css` via `@theme`.
  - [ ] Substituir classes arbitrárias de cores e raios de borda em `src/features/` pelas classes semânticas.
  - [ ] Validar renderização responsiva desktop e mobile em `src/features/nfts/components/nft-card.tsx` e `src/features/checkout/checkout-page.tsx`.

- [ ] **Fase 2: Motor de Aritmética ETH & Validação Zod**
  - [ ] Refatorar `src/shared/utils/eth.ts` para utilizar `BigInt` (Wei) e cálculos de arredondamento determinísticos.
  - [ ] Atualizar schemas em `src/shared/schemas/` (`cart.ts`, `order.ts`, `nft.ts`) para tipagem canônica de valores ETH.
  - [ ] Integrar `calculateOrderTotals` em `src/features/cart/quote-summary.tsx` e `src/features/checkout/checkout-page.tsx`.

- [ ] **Fase 3: Validação de Estado e Testes E2E**
  - [ ] Executar suíte de testes E2E do Playwright (`pnpm test:e2e` ou `npx playwright test`).
  - [ ] Corrigir qualquer divergência visual ou seletor de componente que afete os 336 testes.
  - [ ] Verificar integridade dos handlers de Socket.IO (`src/mocks/socket/hub.ts`) e MSW (`src/mocks/browser.ts`).
```

---

## 7. Diretiva de Execução (Veredito Jev)
- **Aderência ao Escopo:** 100% de foco nos fluxos de Descoberta, Compra e Perfil do Colecionador definidos no README.md.
- **Dependências Externas:** 0 bibliotecas novas. Usar o que já está configurado no ecossistema (Tailwind CSS v4, Zod, React, TanStack Query/Router).
- **Aprovação:** Aprovado para implementação técnica direta pelo Claude Code.