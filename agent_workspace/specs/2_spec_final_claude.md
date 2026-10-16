# Especificação Técnica Final — NFT Marketplace (v2.4, Claude Tech Lead)

Substitui `1_proposta_gemini.md`. Fonte de verdade de escopo: `README.md`. Governança: `AGENTS.md`.

> **Nota v2.3:** `1_proposta_gemini.md` continua **vazio (0 bytes)**; nada foi auditado dela. Correções sobre a v2.2: (1) socket.io-client forçado a `transports: ['websocket']` (o binding do MSW não intercepta long-polling); (2) visitante também recebe `nft.updated` (sala pública), `order.updated` só com token; (3) `mock/reset` deve recarregar a página/zerar o dedup de versões, senão eventos pós-reset (versão menor) são descartados; (4) adicionado projeto Playwright `visual` e `tablet` entra no `test:e2e` (antes `test:visual` não casava nenhum projeto e o tablet nunca rodava); (5) layout/tokens do Figma ainda não foram verificados: exige acesso ao arquivo (conector Figma não autorizado nesta sessão).

> **Nota de auditoria v2.2:** `1_proposta_gemini.md` está **vazio (0 bytes)**; a auditoria foi feita sobre esta spec v2.1 contra README/AGENTS. Ajustes v2.2: (a) estados de pedido alinhados ao README (`PENDING | CONFIRMED | DECLINED`, terminais: os dois últimos; `FAILED` removido por ser ambíguo com falha transitória HTTP); (b) avatar reduzido no cliente via `canvas` (≤ 256×256, JPEG/WebP, ≤ 150 KB) por causa da quota de ~5 MB do `localStorage` onde o store do mock persiste; (c) `eventId` agora é usado na deduplicação (§6); (d) o veredito Jev v2.1 (`noul 0.39`) deve ser reavaliado sobre esta versão — pelo Critério 1 do AGENTS.md, `< 0.70` exige revisão, e o veredito anterior escolheu "implementar" apesar disso.

## 1. Stack e dependências (anti-bloatware)

**Runtime (obrigatórias pelo README):** `react@19`, `react-dom`, `@tanstack/react-router`, `@tanstack/react-query`, `axios`, `socket.io-client`, `tailwindcss@4` (+ `@tailwindcss/vite`, sem `tailwind.config.js`/PostCSS; tokens do Figma em `@theme` no CSS), shadcn/ui (copiado para o repo; traz Radix, `class-variance-authority`, `clsx`, `tailwind-merge`).

**Runtime (complementar justificada):** `zod` — único item extra. Justificativa: README exige "contratos tipados entre transporte, estado e interface"; Zod valida em runtime a resposta da API e os search params, e deriva os tipos. Router e Zod 3.24+/4 integram via Standard Schema, sem adaptador.

**Dev:** `vite`, `@vitejs/plugin-react`, `typescript`, `@tanstack/router-plugin` (rotas por arquivo), `msw`, `@mswjs/socket.io-binding` (citado no README), `@playwright/test`, `@lhci/cli`, `eslint` + `typescript-eslint` + `eslint-plugin-react-hooks` (flat config).

**Rejeitadas (Critério 2):**

| Item | Substituto nativo |
|---|---|
| `big.js`/`decimal.js`/`ethers`/`viem` | `BigInt` (§3) |
| `uuid` | `crypto.randomUUID()` |
| `react-hook-form` | `FormData` + `schema.safeParse` + estado local |
| `zustand`/`redux` | TanStack Query (servidor) + `localStorage` (carrinho visitante) |
| `framer-motion` | `@keyframes` CSS do shimmer + `prefers-reduced-motion` |
| `lucide-react` | SVGs dos assets do Figma |
| `vitest`/`jest` | Projeto `unit` do próprio Playwright (sem browser) |
| `cross-env`, `dotenv` | `vite --mode mocks` + `.env.*` |
| `@faker-js/faker` | Fixtures escritas à mão (determinísticas) |
| `date-fns`, `lodash` | `Intl`, `Date` |
| `useDebounce`/`useMediaQuery` genéricos | Criar só se houver uso real |

## 2. Estrutura (enxuta)

```text
src/
  main.tsx                 # ativa MSW se VITE_ENABLE_MOCKS === 'true' e monta providers
  routes/                  # file-based: __root, index, nft/$nftId, cart, checkout/{index,success},
                           #   auth/{login,register}, profile/{index,wallets}; notFoundComponent global
  features/{auth,nfts,cart,checkout,profile,wallets}/   # api (axios+query hooks), componentes, testes
  shared/{api,components/ui,realtime,schemas,utils}/
  mocks/{browser.ts,db,fixtures,handlers,socket,scenarios}
tests/{unit,e2e,visual}/   # fixtures NÃO duplicadas: reutiliza src/mocks/fixtures
public/{mockServiceWorker.js,assets/}   # fontes e imagens locais
vercel.json                # rewrite SPA → /index.html (obrigatório: refresh de rotas no deploy)
```
Removidos vs. proposta: `app/router.tsx` (gerado pelo plugin), `mocks/server.ts` (não há runner Node: Playwright usa o MSW no navegador), `tests/fixtures`, `hooks/` vazio, `tailwind.config.js`.

## 3. Aritmética ETH (corrigida)

Valores trafegam como string decimal. O cliente **não calcula** subtotal/desconto/taxa/total: exibe o `Quote` da API ("a cotação da API é a referência"). `BigInt` só é usado por `compareEth`/formatação e pelos handlers MSW.

```ts
// src/shared/utils/eth.ts
const WEI = 10n ** 18n;
const ETH_RE = /^\d+(\.\d{1,18})?$/;
export function ethToWei(s: string): bigint {
  if (!ETH_RE.test(s)) throw new RangeError(`ETH inválido: ${s}`); // sem truncar em silêncio
  const [i, d = ''] = s.split('.');
  return BigInt(i) * WEI + BigInt(d.padEnd(18, '0'));
}
export function weiToEth(w: bigint): string {
  if (w < 0n) throw new RangeError('ETH negativo');
  const d = (w % WEI).toString().padStart(18, '0').replace(/0+$/, '');
  return d ? `${w / WEI}.${d}` : `${w / WEI}`;
}
export const addEth = (a: string, b: string) => weiToEth(ethToWei(a) + ethToWei(b));
export function mulEth(a: string, qty: number) {
  if (!Number.isInteger(qty) || qty < 0) throw new RangeError('quantidade inteira');
  return weiToEth(ethToWei(a) * BigInt(qty));
}
export const compareEth = (a: string, b: string) => (ethToWei(a) < ethToWei(b) ? -1 : ethToWei(a) > ethToWei(b) ? 1 : 0);
```
Testes unitários obrigatórios (`tests/unit/eth.spec.ts`): `0.1+0.2="0.3"`, 18 casas, 19 casas lança, `"abc"`/`""`/`"-1"`/`".5"` lançam, `mulEth("0.15",3)="0.45"`, `weiToEth(0n)="0"`, round-trip.

## 4. Schemas (Zod) — alterações sobre a proposta

Manter `EthStringSchema`, `UserSchema`, `WalletSchema`, `OrderStatusSchema`, `CatalogFilterSchema`. Mudanças:
- **`ApiErrorSchema`** `{ code: string, message: string, fields?: Record<string,string> }` — envelope único de erro (400 validação com `fields`, 401, 403, 404, 409, 422, 503). README exige exibir erros de validação vindos da API.
- **`NftSchema`:** remover `isFavorite` (é dado por usuário e duplicaria `/favorites`; derivar de `Set(favorites.nftIds)`); adicionar `gallery: string[]` (galeria) e `featured: boolean` (Destaques); `editions[].availableQuantity` é a fonte de limite por edição.
- **`CartItem` na requisição:** só `{ nftId, editionId?, quantity }`. Preço, título e imagem vêm da resposta (`CartLine`), evitando preço obsoleto confiado ao cliente.
- **`QuoteSchema`:** `lines[]` com disponibilidade/preço por item; `couponCode`, `isCouponApplied`, `expiresAt`, `version`.
- **`OrderSchema`:** `items` é snapshot (título, preço, edição, qtd); acrescentar `buyer {name,email}` (README: "dados do colecionador"), `quote` snapshot e `network` como enum igual ao da carteira. Recibo lê **somente** o snapshot.
- Senhas: o mock armazena hash SHA-256 (`crypto.subtle`) + salt, nunca texto claro; token opaco com expiração.

## 5. Contratos REST (`/api/v1`, via Axios)

Mantêm-se auth (`register|login|session|logout`), `nfts`, `nfts/:id`, `favorites` (GET/POST/DELETE), `profile` (GET/PATCH), `profile/password`, `wallets` (GET/POST/PATCH), `orders/:id`. Alterações:

| Endpoint | Mudança |
|---|---|
| `GET /nfts` | + `featured=true`. Filtro alterado reinicia `page=1` (regra de UI no `navigate`). |
| `GET /cart` | **Só autenticado.** Visitante usa `localStorage` (`nft:guest_cart`); sem "header opcional". |
| `POST /cart/items`, `PATCH /cart/items/:key`, `DELETE /cart/items/:key` | **Substituem** `PUT /cart` em lote (README: inclusão, alteração, remoção). `key = nftId[:editionId]`. 409 `AVAILABILITY_CONFLICT` com `max`. |
| Merge no login | Cliente soma quantidades do visitante ao carrinho remoto, limitado pela disponibilidade, via `POST /cart/items`; depois limpa o `localStorage`. |
| `POST /checkout/quote` | **Público** (visitante vê resumo/cupom). Erros 422 `COUPON_INVALID` / `COUPON_EXPIRED`; 409 `PRICE_CHANGED` / `EDITION_UNAVAILABLE`. |
| `POST /orders` | Header `Idempotency-Key`. Body `{ items, quoteVersion, walletId, network }`. Retorna **`201` + status `PENDING`** na 1ª chamada, **`200`** no replay (ambíguo na proposta). Hash do payload = `items+walletId+network+quoteVersion`; chave escopada por usuário. 409 `IDEMPOTENCY_KEY_REUSE_PAYLOAD_MISMATCH`; 409/422 `QUOTE_STALE` se `quoteVersion` ≠ atual. |
| `POST /wallets/:id/connect`, `/disconnect` | Simula conexão/recusa/desconexão (README §Pagamento). Recusa via cenário `WALLET_REFUSED` → 403 `WALLET_CONNECTION_REFUSED`. |
| `DELETE /wallets/:id` | **Não** incluir (fora do README). |
| `PATCH /profile` (avatar) | Sem upload multipart: o cliente aceita `image/*` (≤ 2 MB de entrada), redimensiona via `<canvas>` (≤ 256×256, saída ≤ 150 KB), converte em data URL e envia em `avatarUrl`; o schema limita tamanho/prefixo `data:image/`. Erros 400 com `fields`. |

**Idempotência no cliente:** ao abrir a revisão, gerar a chave e persistir `{userId, key, payloadHash, orderId?}` em `localStorage` (`nft:checkout_attempt`). Reenvio manual após timeout/refresh reutiliza a chave; o botão fica desabilitado enquanto a mutation roda (clique repetido). Chave nova somente após `DECLINED`, erro HTTP que não criou pedido (4xx/5xx sem `orderId`), mudança confirmada da cotação ou pedido terminal. Mutation com `retry: 0`; **não há retentativa automática** — a proposta contradizia isso no cenário 8. A retentativa é do usuário ("Tentar novamente"), com a mesma chave.

**Recuperação:** `pendingOrderId` fica no mesmo registro; no boot de `/checkout` e `/checkout/success`, `GET /orders/:id` restaura o estado. A página de confirmação só renderiza com `status === 'CONFIRMED'`; `PENDING` mostra estado de espera; `DECLINED` volta ao checkout com itens preservados. Após `CONFIRMED`, remover do carrinho apenas itens/quantidades comprados.

## 6. Tempo real

- **Transporte (corrige erro factual):** `@mswjs/socket.io-binding` usa a API `ws` do MSW, que intercepta a classe `WebSocket` **na página**. Service Worker não intercepta WebSocket. Documentar em `ARCHITECTURE.md` (README exige documentar transporte e limitações): o socket real só existe no navegador com mocks ativos; `socket.io-client` real conecta em URL falsa configurável (`VITE_SOCKET_URL`, padrão `ws://mock.socket.local`), nunca `localhost:3000` fixo (quebraria o deploy). O client usa `transports: ['websocket']` (sem polling/upgrade, que o binding não intercepta); documentar como limitação.
- **Eventos** (acrescentar `eventId` e `resource`): `nft.updated { eventId, resource:'nft', id, version, price, availableQuantity, isAvailable, editions?: [{id,availableQuantity,price}], timestamp }`; `order.updated { eventId, resource:'order', id, userId, version, status, transactionHash?, errorMessage?, timestamp }`.
- **Origem dos eventos no mock:** emitidos pelo mesmo `memoryStore` que atende o REST (README: dados e eventos coerentes). Endpoints de controle do mock: `POST /api/v1/mock/nfts/:id` (altera preço/estoque → incrementa `version` → emite), `POST /mock/socket/{drop,restore,replay}` (desconexão, reconexão, duplicata/versão antiga). Playwright os chama **de dentro da página** (`page.evaluate(() => fetch('/api/v1/mock/...'))`), nunca via fixture `request`/`page.request`, que não passa pelo Service Worker e não alcançaria os handlers MSW (store e socket vivem na página). Nunca setters da UI.
- **Dedup:** `Map<"resource:id", version>` descarta `version <=` registrado (eventos antigos); `Set<eventId>` limitado a 200 entradas descarta reentregas exatas sem reaplicar efeitos colaterais (toast/aviso). Ambos zerados no logout. Teste unitário cobre duplicata, versão antiga e versão nova.
- **Propagação do `nft.updated`:** `setQueryData` em lista, detalhe e linhas do carrinho; invalida `quote`; cart/checkout mostram aviso (`role="status"`) e o checkout **bloqueia** confirmação enquanto `quote.version` estiver defasada, exigindo nova confirmação (cenário obrigatório do README). A proposta citava só invalidação na reconexão.
- **Visitante:** `nft.updated` é público (carrinho/catálogo de visitante também precisam atualizar); o socket conecta sem token e entra só na sala `public`. Com token, entra também em `user:<id>`.
- **Reset:** `POST /mock/reset` e troca de cenário devem ser seguidos de `location.reload()` (ou limpar o `Map` de versões), pois o reset reduz `version`.
- **Isolamento:** handshake `auth: { token }`; o mock envia `order.updated` apenas ao socket do dono (a checagem `event.userId` no cliente fica como defesa em profundidade — filtrar só no cliente já expõe dados a outro usuário).
- **Reconexão:** `connect` após queda → `invalidateQueries` de `['nfts']`, `['cart', userId]`, `['orders', pendingId]`.
- **Logout/expiração:** `socket.removeAllListeners(); socket.disconnect(); queryClient.clear()`; apagar `nft:checkout_attempt`, favoritos e carrinho remoto em cache. **Omitido na proposta** e eliminatório (exposição entre usuários). Query keys privadas incluem `userId`.

## 7. Estado, roteamento, cache (documentar em `ARCHITECTURE.md`)

- Search params do catálogo: `validateSearch: CatalogFilterSchema` (sem `zodSearchValidator`, API antiga). `keepPreviousData` + `signal` do Query repassado ao Axios para descartar respostas fora de ordem.
- Cache: catálogo `staleTime 30s / gcTime 5min`; carrinho, quote, pedidos `staleTime 0`; queries `retry: 1` só para GET com 5xx/rede; mutations `retry: 0`.
- Auth guard em `beforeLoad` (`/checkout`, `/profile*`); interceptor Axios apenas despacha evento `session-expired` (sem respostas fictícias nem caminhos alternativos). Expiração no checkout: preservar `redirect` **e** o registro de tentativa (§5), retomando a revisão após novo login.
- Otimista: favoritos (`onMutate` snapshot → `onError` rollback + toast → `onSettled` invalidate).
- Rota inexistente e NFT 404: `notFoundComponent` com CTA.

## 8. Mocks (MSW v2)

- `memoryStore` (users≥2, nfts com variedade para filtros e ≥3 páginas, orders, wallets, carts, favorites, idempotency) persistido em `localStorage` (sobrevive a refresh, sessões do Playwright já isolam por contexto).
- `POST /mock/reset` restaura o fixture inicial; `POST /mock/scenario { name }` seleciona o cenário. **Sem header `x-mock-scenario` no Axios** (cliente não pode conter lógica de mock); a seleção também aceita `?scenario=` lido apenas por `src/mocks`.
- Cenários completos (a proposta omitia vários exigidos): `DEFAULT`, `EMPTY_RESULTS`, `SLOW_NETWORK` (2000 ms), `VARIABLE_LATENCY` (respostas fora de ordem), `NETWORK_ERROR` (`HttpResponse.error()`), `HTTP_4XX`, `HTTP_5XX`, `SESSION_EXPIRED`, `UNAUTHORIZED`/403, `REGISTER_CONFLICT`, `FORM_VALIDATION_ERROR`, `COUPON_INVALID`, `COUPON_EXPIRED`, `PRICE_CHANGED_MID_CHECKOUT`, `EDITION_SOLD_OUT`, `ORDER_TIMEOUT_AFTER_CREATE` (**persiste o pedido e depois derruba a resposta**; o replay devolve o mesmo pedido), `PAYMENT_CONFIRMED`, `PAYMENT_DECLINED`, `WALLET_REFUSED`.
- MSW ativo em dev (`vite --mode mocks`), preview e **build de demonstração/produção** (`.env.production: VITE_ENABLE_MOCKS=true`). `mockServiceWorker.js` versionado em `public/`.

## 9. UI, a11y, performance

- Shimmer com dimensões do conteúdo final (catálogo, detalhe, resumo do carrinho), desativado em `prefers-reduced-motion`. Verificar 390/768/1440 px.
- Focus-visible, focus trap (Radix) com retorno de foco, `aria-describedby`/`aria-invalid`, `aria-live` para mutations e eventos, `alt` textual, estados não só por cor, sem overflow horizontal.
- Lighthouse (`lighthouserc.cjs`): rotas `/` e `/nft/<id-fixo-do-fixture>`, mobile e desktop, **`numberOfRuns: 3`, agregação por mediana**, saída HTML+JSON (`upload.target: filesystem`), com mocks e assets reais. Registrar LCP/CLS/TBT, versões e ambiente em `docs/lighthouse.md`. `index.html` com `title`, `meta description`, `lang`, `robots` (SEO ≥ 90 em SPA).
- **Riscos de score com MSW (README proíbe simplificar a auditoria):** `main.tsx` aguarda `worker.start()` antes de renderizar, o que atrasa o LCP — usar `onUnhandledRequest: 'bypass'`, `quiet: true`, precarregar fontes/imagem LCP (`<link rel=preload>`) e medir; o socket só conecta após o primeiro render (lazy, fora do caminho crítico) e não pode gerar erro no console (Best Practices); imagens com `width/height`, `loading="lazy"` abaixo da dobra e `fetchpriority="high"` na LCP. Se ficar abaixo da meta, justificar em `docs/lighthouse.md`.

## 10. Testes

- **Unit** (`tests/unit/*.spec.ts`, projeto Playwright sem browser — Critério 3): `eth`, dedup de versão do realtime, hash de idempotência, serialização de filtros, merge de carrinho visitante.
- **E2E**: 12 grupos conforme README §9, Chromium desktop (1440×900) e mobile (390×844), contra `vite build && vite preview` com MSW. Corrigir a proposta: grupo 08 inclui **avatar**; grupo 11 inclui **validação de formulários**; grupo 12 inclui **recuperação após nova tentativa**; grupo 07 inclui falha de pagamento e clique repetido. Eventos só via endpoints `/mock/*` chamados com `fetch` dentro da página (passam pelo `socket.io-client`). Projeto adicional `tablet` (768×1024) roda smoke de layout: sem overflow horizontal em cada rota, menu/filtros/carrinho operáveis (README §8 exige 390/768/1440). Relógio controlado com `page.clock`; `beforeEach` chama `/mock/reset`.
- **Visual:** início, detalhe, carrinho e pagamento, desktop+mobile, `maxDiffPixelRatio: 0.02`, animações desativadas.
- `playwright.config.ts`: `reporter: [['html'],['list']]`, `trace: 'retain-on-failure'`, `webServer: vite preview`.

## 11. Scripts (`package.json`)

```json
{
  "dev": "vite --mode mocks",
  "build": "tsc --noEmit && vite build",
  "preview": "vite preview",
  "typecheck": "tsc --noEmit",
  "lint": "eslint .",
  "test:unit": "playwright test --project=unit",
  "test:e2e": "playwright test --project=desktop --project=mobile --project=tablet",
  "test:visual": "playwright test --project=visual",
  "test:visual:update": "playwright test --project=visual --update-snapshots",
  "audit:lighthouse": "lhci autorun"
}
```
Correções: `tsc -b --noEmit` falha em projetos `composite` (usar um `tsconfig.json` único com `noEmit`); cada projeto Playwright define `testMatch` próprio (`unit`→`tests/unit`, `desktop|mobile|tablet`→`tests/e2e`, `visual`→`tests/visual` com viewports desktop e mobile via `projects` próprios ou `test.use`), senão `test:e2e` reexecuta os unitários; `eslint --ext` foi removido no ESLint 9 (flat config) e quebraria; `test:visual` com `--update-snapshots` sobrescrevia as baselines a cada execução, anulando a regressão visual.

## 12. Entregáveis documentais

`README.md` da solução (setup, env vars `VITE_ENABLE_MOCKS`/`VITE_SOCKET_URL`, credenciais fictícias de 2 usuários, seleção/reset de cenários, comandos, reprodução de falhas) e `ARCHITECTURE.md` (contratos REST/eventos, sessão, carrinho, cache, reconciliação REST×Socket.IO, transporte MSW e limitações, desvios do Figma). Lockfile commitado. Deploy Vercel com `vercel.json` de rewrite.

## 13. Ordem de implementação

> **v2.4 (adendos desta auditoria, §14 abaixo).** Ordem: 1. Scaffold + schemas + `eth.ts` + testes unitários. 2. Mocks (store, handlers, cenários, socket). 3. Auth/sessão/limpeza de cache. 4. Catálogo/detalhe/favoritos. 5. Carrinho + quote. 6. Checkout/idempotência/pedidos. 7. Realtime. 8. Perfil/carteiras. 9. a11y/skeletons. 10. E2E, visual, Lighthouse, docs, deploy.

## 14. Adendos v2.4 (lacunas encontradas na auditoria da v2.3)

1. **Ordem de validação em `POST /orders` (idempotência primeiro):** (a) buscar `(userId, Idempotency-Key)`; se existir com mesmo hash → replay `200` com o mesmo pedido, **antes** de qualquer outra checagem; hash diferente → `409 IDEMPOTENCY_KEY_REUSE_PAYLOAD_MISMATCH`; (b) só então validar `quoteVersion` (`QUOTE_STALE`), disponibilidade e preço; (c) criar pedido `PENDING` e persistir a chave. Sem isso, um replay após `nft.updated` retornaria `QUOTE_STALE` em vez do pedido já criado, quebrando o cenário "timeout com recuperação por idempotência".
2. **Quem resolve `PENDING`:** o `memoryStore` agenda a transição com `setTimeout` (padrão 1500 ms; cenário `PAYMENT_CONFIRMED` → `CONFIRMED` + `transactionHash` simulado; `PAYMENT_DECLINED` → `DECLINED` + `errorMessage`), grava no store e **só então** emite `order.updated` com `version+1`. A transição é idempotente (terminais não mudam). Se o socket estiver derrubado, o estado é recuperado por `GET /orders/:id` na reconexão/refresh. O timer deve ser retomado no boot do mock para pedidos `PENDING` persistidos (refresh durante pendência). Testes controlam o tempo com `page.clock`.
3. **Baselines visuais portáveis:** `snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}'` (sem `{platform}`) e gerar/atualizar baselines em um único ambiente (container Playwright ou CI Linux, documentado); fontes locais embutidas para evitar variação de render. Sem isso as baselines versionadas no Windows falham no Linux/CI.
4. **Expiração de sessão no mock:** token com `expiresAt` verificado contra o relógio da página (compatível com `page.clock`); cenário `SESSION_EXPIRED` responde `401 SESSION_EXPIRED` na próxima chamada autenticada; o interceptor Axios só dispara `session-expired` (§7).
5. **`crypto.subtle`** exige contexto seguro: funciona em `localhost` e HTTPS (Vercel); documentar no README e não usar via IP de rede local em HTTP.
6. **Pré-requisitos bloqueantes antes de codar (AGENTS.md, Critério 1):** (i) Jev reavaliar **esta v2.4** (veredito atual `noul 0.39 < 0.70`, `refazer_pesquisa`, é de versão anterior); (ii) acesso ao Figma (conector não autorizado) ou export de tokens/assets — sem isso os 20 pts de fidelidade visual ficam sem base; (iii) regenerar `1_proposta_gemini.md` só se o Gemini for realmente necessário, e fazer o orquestrador falhar em saída vazia.
7. **Critério 3 (testes):** nenhum código existe ainda; a entrega do passo 1 da §13 deve incluir `eth.spec.ts`, `realtime-dedup.spec.ts`, `idempotency-hash.spec.ts` rodando verde antes de seguir.
