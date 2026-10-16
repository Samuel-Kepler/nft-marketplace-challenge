# Arquitetura

> Documento vivo. Esta versão cobre a **camada de mocks (MSW) e o transporte Socket.IO simulado** (Passo 2).
> Cache, sessão, carrinho e desvios do Figma serão acrescentados nos passos seguintes.

## 1. Mocks (MSW v2)

```text
src/mocks/
  db/db.ts          MockDb: única fonte de verdade (REST + eventos), persistida em localStorage
  db/errors.ts      ApiFailure → envelope { code, message, fields?, details? }
  fixtures/         48 NFTs determinísticos, 2 usuários, carteiras, cupons
  scenarios.ts      nomes e constantes dos cenários
  handlers/         route.ts (latência + cenários + erros) e index.ts (REST + /mock/*)
  socket/hub.ts     servidor Socket.IO simulado (ws.link + @mswjs/socket.io-binding)
  environment.ts    createMockEnvironment(): MockDb + handlers + hub
  browser.ts        setupWorker + startMocks() (usado por dev, preview e build de demonstração)
```

- Componentes, hooks e o cliente Axios **não** contêm respostas fictícias: tudo passa pela rede simulada.
- `createMockEnvironment()` é reutilizado por dev/demo/Playwright. Os testes unitários montam o mesmo
  `createHandlers(db)` em `msw/node`, cada teste com seu próprio `MockDb` em memória.
- Persistência: `localStorage` (`nft:mock_db`, versionado). `POST /api/v1/mock/reset` restaura o fixture
  e o cenário `DEFAULT`; storage corrompido volta ao fixture.
- Ids gerados começam em 1000 (não colidem com `user-1`, `wallet-1`…). Senhas: SHA-256 com salt, nunca em claro.
- Ordem de validação de `POST /orders` (spec §14.1): **idempotência primeiro** (replay → 200 com o mesmo
  pedido; mesma chave com conteúdo diferente → 409), só depois carteira, estoque, versão da cotação e cupom.
- Resolução do pedido: `PENDING` → `CONFIRMED|DECLINED` após 1,5 s (timer do `MockDb`), baixa o estoque só ao
  confirmar, emite `nft.updated` e depois `order.updated`. `resumePendingOrders()` retoma pendências após refresh.

### Credenciais fictícias

| Usuário | E-mail | Senha |
| --- | --- | --- |
| Ana | `ana@example.com` | `Senha@123` |
| Bruno | `bruno@example.com` | `Senha@456` |

Cupons: `NFT10` (10 %), `EXPIRED20` (expirado). Taxa de rede fixa: `0.002` ETH. Âncoras de teste: `nft-001`
(0,5 ETH, qty 5), `nft-002` (edições `standard` 0,8 e `collector` 1,5), `nft-003` (esgotado).

### Seleção e reset de cenários

- `POST /api/v1/mock/scenario` `{ "name": "HTTP_5XX", "failures": 2 }` (`failures` opcional: após N falhas a
  rota volta a responder normalmente — útil para "tentar novamente"). `GET` lista os cenários.
- `?scenario=NOME` na URL (lido só por `src/mocks/browser.ts`). `POST /api/v1/mock/reset` volta ao padrão.

| Cenário | Efeito |
| --- | --- |
| `DEFAULT`, `PAYMENT_CONFIRMED` | sucesso; pedido confirma |
| `EMPTY_RESULTS` | `GET /nfts` devolve página vazia |
| `SLOW_NETWORK` | 2000 ms em toda resposta |
| `VARIABLE_LATENCY` | 900/60/400/20 ms em sequência (respostas fora de ordem, reproduzível) |
| `NETWORK_ERROR`, `HTTP_4XX` (400), `HTTP_5XX` (503) | falhas no catálogo (`/nfts`, `/nfts/:id`) |
| `SESSION_EXPIRED` | 1ª chamada autenticada → 401 `SESSION_EXPIRED` e derruba as sessões (uma vez) |
| `UNAUTHORIZED` | rotas privadas → 403 `FORBIDDEN` |
| `REGISTER_CONFLICT` / `FORM_VALIDATION_ERROR` | 409 `EMAIL_TAKEN` / 400 com `fields` (cadastro, perfil, senha, carteiras) |
| `COUPON_INVALID` / `COUPON_EXPIRED` | 422 para qualquer cupom |
| `PRICE_CHANGED_MID_CHECKOUT` | no 1º `POST /orders`: +10 % no 1º item, emite `nft.updated`, 409 `PRICE_CHANGED` |
| `EDITION_SOLD_OUT` | no 1º `POST /orders`: zera o estoque do 1º item, 409 `EDITION_UNAVAILABLE` |
| `ORDER_TIMEOUT_AFTER_CREATE` | persiste o pedido e **derruba a resposta**; o replay com a mesma chave o devolve |
| `PAYMENT_DECLINED` | pedido termina `DECLINED` |
| `WALLET_REFUSED` | `POST /wallets/:id/connect` → 403 `WALLET_CONNECTION_REFUSED` |
| `FAVORITES_MUTATION_FAILS` | `POST/DELETE /favorites` → 503 (extra, para o E2E de rollback) |

### Endpoints de controle (`/api/v1/mock/*`, sem latência nem cenários)

`POST reset` · `GET|POST scenario` · `POST nfts/:id` `{price?, availableQuantity?, editions?}` (incrementa `version` e
emite `nft.updated`) · `POST orders/:id/resolve` `{status}` · `POST socket/drop|restore` ·
`POST socket/replay` `{kind: "duplicate"|"stale", type?}`.
Nos testes E2E, chame-os **de dentro da página** (`page.evaluate(() => fetch(...))`): `page.request` não passa
pelo Service Worker e não alcança o estado do mock.

## 2. Socket.IO simulado

**Transporte.** REST é interceptado pelo Service Worker; o socket é interceptado na própria página pela API `ws`
do MSW (o Service Worker não vê WebSocket). `@mswjs/socket.io-binding` codifica/decodifica o protocolo, e o
`socket.io-client` **real** conecta em `VITE_SOCKET_URL` (padrão `ws://mock.socket.local`, host que não existe).

**Eventos** (`src/shared/schemas/events.ts`; todos com `eventId`, `resource`, `id`, `version`, `timestamp`):
`nft.updated` (preço, estoque, `isAvailable`, `editions?`) e `order.updated` (`status`, `transactionHash?`,
`errorMessage?`, `userId`). São emitidos pelo mesmo `MockDb` que atende o REST, então REST e eventos nunca divergem.

**Roteamento/isolamento.** `nft.updated` é público (visitantes incluídos). `order.updated` só vai ao socket cujo
`auth.token` pertence ao dono do pedido; o dono é re-resolvido a cada evento, então um logout/expiração interrompe a
entrega mesmo com o socket aberto. A defesa em profundidade no cliente (`userId`) continua obrigatória.

### Limitações e armadilhas

1. **Só `transports: ['websocket']`.** Long-polling e upgrade usam HTTP e não são interceptados pelo binding.
2. **Importe o `socket.io-client` depois de `startMocks()`.** O engine.io captura `globalThis.WebSocket` quando o
   módulo é avaliado; o MSW só o substitui em `worker.start()`. Use `import()` dinâmico nos módulos do socket
   (ver comentário em `src/main.tsx`). Sem isso o cliente tenta a rede real e falha com `ERR_NAME_NOT_RESOLVED`.
3. **O handler `ws.link` usa a origem sem path.** O MSW remove o prefixo `/socket.io/` antes de casar; com path no
   handler (ou com a querystring `?EIO=4…`) nada casa.
4. O binding não implementa salas, namespaces, acks nem broadcast: `public`/`user:<id>` são emuladas no hub. O
   `auth` do handshake chega depois do ack `40` automático do binding (lido do frame bruto).
5. O binding anuncia `pingInterval` de 25 s; o hub envia o ping do engine.io a cada 20 s para o cliente não cair.
6. `drop` dispara um evento `error` no WebSocket antes de fechar; só `close()` deixaria o cliente pendurado até o
   timeout de 20 s. Eventos emitidos com o socket caído **não** são reenviados: o app deve reconciliar via REST.
7. Após `mock/reset` o contador de `version` volta a 1; recarregue a página (ou limpe o dedup) antes de continuar.

## 3. Testes da camada de mocks

| Projeto | Onde roda | Cobre |
| --- | --- | --- |
| `unit` (`npm run test:unit`) | Node, `msw/node` + Axios | catálogo, auth, perfil, carteiras, favoritos, carrinho, cotação, pedidos/idempotência, cenários, persistência |
| `integration` (`npm run test:integration`) | Chromium + Vite (modo mocks) | `socket.io-client` real: conexão, `nft.updated`/`order.updated`, isolamento, dedup, queda e reconexão, refresh de pedido pendente |

## 4. Roteamento, camada HTTP e estado remoto

**Roteamento (TanStack Router, rotas por arquivo em `src/routes`, árvore gerada em `src/routeTree.gen.ts`).**
O estado do catálogo vive na URL (`validateSearch: parseCatalogSearch`): valores inválidos são descartados, `page=1` e o limite padrão não aparecem, e qualquer mudança de filtro/busca/ordenação remove `page` (reinicia a paginação). `/checkout*` e `/profile*` usam `beforeLoad: requireAuth`, que redireciona a `/auth/login?redirect=<destino>`; o redirect só aceita caminhos internos (`safeRedirect`). Rotas e NFTs inexistentes têm `notFoundComponent`/estado próprio. Os loaders usam `prefetchQuery`, que não lança: a falha aparece no estado de erro da tela, com "Tentar novamente".

**HTTP (`src/shared/api`).** Todas as chamadas passam pelo Axios (`client.ts`, `baseURL /api/v1`, timeout 15 s) e são validadas com os schemas Zod do contrato (`request`/`requestData`); resposta fora do contrato vira `INVALID_RESPONSE`. Todo erro chega à UI como `ApiRequestError` (`kind`: `api | network | timeout | invalid-response | canceled`, com `status`, `code`, `fields`). O interceptor só anexa o `Bearer` e, em 401 de uma requisição autenticada, emite o evento `session-expired`; não há respostas fictícias no cliente.

**Política de cache e retry (`query-client.ts`).**

| Dado | `staleTime` | `gcTime` | Observações |
|---|---|---|---|
| Catálogo e detalhe | 30 s | 5 min | `keepPreviousData` na lista; `signal` repassado ao Axios descarta respostas obsoletas |
| Carrinho, cotação, pedidos, perfil, carteiras | 0 | 5 min | pedido terminal (`CONFIRMED`/`DECLINED`) nunca é rebuscado |
| Queries | — | — | 1 retry, só para falha transitória (rede, timeout, 5xx); 4xx não é retentado |
| Mutations | — | — | `retry: 0`; reenvio é ação do usuário, com a mesma `Idempotency-Key` |

Chaves privadas incluem o `userId` (`queryKeys`), e a cotação inclui itens e cupom. Mutations do carrinho gravam a resposta no cache e invalidam `['quote']`. Favoritos usam atualização otimista (`onMutate` → rollback + aviso em `onError` → `invalidate` em `onSettled`).

**Sessão.** O token fica em `localStorage` (`nft:session`) e expira pelo relógio da página. `beginSession` e `endSession` chamam `queryClient.clear()`; o logout apaga também `nft:checkout_attempt`, e a expiração o preserva para retomar o checkout. Ao expirar numa rota privada, a aplicação leva ao login com `redirect`.

**Tempo real (`src/shared/realtime`).** `startRealtime` abre um `socket.io-client` (`transports: ['websocket']`, `auth.token`) por sessão e é iniciado após o primeiro render. Ao mudar a sessão, o socket anterior recebe `removeAllListeners` + `disconnect` e o deduplicador é zerado. Todo evento é validado com Zod, passa pelo `EventDeduplicator` e é aplicado por funções puras (`apply-events.ts`) que devolvem a mesma referência quando não há mudança: só uma mudança real gera aviso. `nft.updated` atualiza lista, detalhe e linhas do carrinho e invalida `['quote']`; `order.updated` só é aceito se `userId` for o da sessão. Após reconectar, o cliente invalida catálogo, cotações, carrinho e pedidos (REST é a fonte da verdade). Avisos vão para a região `aria-live` (`NoticesRegion`).

**Limitação.** Com mocks, `VITE_ENABLE_MOCKS=true` vem de `.env.mocks` (modo `dev`), `.env.development` e `.env.production`.

## 5. Descoberta: catálogo e detalhe (Passo 5)

- **Catálogo (`/`)**: busca, categoria, raridade, faixa de preço, "somente destaques", ordenação e paginação são search params validados (`parseCatalogSearch`). Cada alteração é uma navegação (entra no histórico) e reinicia `page`; a paginação usa `<Link>` reais. Faixa de preço é validada no cliente (`parsePriceRange`, comparação em wei) antes de ir à URL. Seção "Destaques" só aparece sem filtros e na página 1.
- **Loaders sem `await`**: `prefetchQuery` é disparado, mas a rota renderiza já, para o skeleton (shimmer, dimensões do conteúdo) aparecer em rede lenta; a query do componente reaproveita a mesma requisição. Respostas obsoletas são descartadas pela chave da query + `signal`.
- **URL**: strings numéricas (`maxPrice=1`) são serializadas sem aspas (`stringifySearch` em `router.ts`); `parseCatalogSearch` converte de volta para texto, preservando ETH como string decimal.
- **Detalhe (`/nft/$nftId`)**: edição, oferta e quantidade são **derivadas** (`resolveOffer`, `clampQuantity`): se um `nft.updated` reduzir o estoque, a quantidade se ajusta sozinha. 404 → "NFT não encontrado"; falha → erro com nova tentativa. "Adicionar ao carrinho" exige sessão (visitante vai ao login com `redirect`); o carrinho de visitante fica para o passo do carrinho.
- **Favoritos**: otimistas com rollback (`useToggleFavorite`); visitante é enviado ao login.
- **Desvio**: o Figma não foi acessado (conector não autorizado); layout usa Tailwind neutro e as imagens `/assets/nfts/*` não existem no repositório, então `NftImage` exibe um substituto textual acessível.

## 6. Conta: autenticação, perfil e carteiras (Passo 6)

- **Login/cadastro** (`features/auth/auth-form.tsx`): validação Zod no cliente + erros da API por campo (`aria-invalid`/`aria-describedby`); `?redirect=` só aceita caminhos internos (`safeRedirect`) e devolve o usuário ao fluxo original. `redirectIfAuthenticated` (`beforeLoad` das telas de auth) manda quem já tem sessão direto ao destino. Um `AccountNav` global dá acesso a Entrar/Cadastro ou Perfil/Carteiras/Sair.
- **Logout** encerra a sessão local **antes** da resposta do servidor (cache, storage, tentativa de checkout, socket), enviando o token explicitamente no `POST /auth/logout`; um refresh imediato não ressuscita a sessão. O interceptor Axios não sobrescreve um `Authorization` já definido.
- **Perfil** (`features/profile`): dados (nome/e-mail), avatar e senha em formulários independentes. Avatar: `image/*` ≤ 2 MB, redimensionado via `<canvas>` (≤ 256 px, JPEG, ≤ 150 mil caracteres) antes do `PATCH /profile`. Senha: exige confirmação (cliente) e senha atual correta (API); o mock grava só hash+salt. O aviso de sucesso é emitido no hook (a mutation de dados remonta o formulário, o que descartaria callbacks da chamada). Alterações confirmadas atualizam o cache e a sessão persistida, então sobrevivem a refresh.
- **Carteiras** (`features/wallets`): máximo de duas (principal e secundária; a primeira é sempre principal, trocar a principal rebaixa a outra), cadastro/edição com endereço `0x…40 hex`, rede (`NETWORK_LABELS` compartilhado com o pagamento) e apelido; estado de conexão com conectar/desconectar e erro explícito na recusa (`WALLET_REFUSED`). Trocar o endereço desconecta a carteira.
- **Privacidade**: chaves de cache `['profile'|'wallets', userId]`; `beginSession`/`endSession` limpam o cache; o mock responde 403 para carteira de outro usuário. Coberto em `tests/integration/account.spec.ts` (troca de usuário não vaza endereços/perfil).
- **Testes**: `tests/unit/avatar.spec.ts` e `tests/integration/account.spec.ts` (login com retorno, conflito de cadastro, perfil, avatar, senha, erros de validação da API, carteiras, privacidade).
- **Desvio**: telas sem estilo do Figma (não acessado); a fidelidade visual fica para o passo de UI.

## Interface, responsividade e acessibilidade (Passo 7)

- **Tokens** (`src/index.css`, `@theme` do Tailwind v4): cores, raios e animação `shimmer`. Contraste AA (texto ≥ 4,5:1,
  bordas de campo ≥ 3:1). Controles nativos (`input`, `select`, `button`, `label`, `fieldset`) recebem estilo na
  `@layer base`, com alvos ≥ 44 px. Sem Figma disponível, a paleta/tipografia são uma adaptação própria (fonte do
  sistema; sem fonte web) — desvio a ser reconciliado com o layout.
- **shadcn/ui**: `src/shared/ui/` (`cn`, `Button` com `cva` + Radix `Slot`, `Skeleton`). Só entra o que é usado.
- **Responsividade**: grid do catálogo 1/2/4 colunas, filtros empilháveis, `max-w-*` + `p-4 sm:p-8`; sem overflow
  horizontal em 390/768/1440 (teste em `tests/integration/visual-a11y.spec.ts`).
- **Skeletons**: `Skeleton` com shimmer; sob `prefers-reduced-motion` ficam estáticos (e animações/transições globais
  são neutralizadas). Mesmas dimensões do conteúdo real (cartão, detalhe, resumo, carrinho, checkout, perfil, carteiras).
- **A11y**: link "Pular para o conteúdo"; foco movido ao `<main>` a cada troca de rota; anel de foco global de 3 px;
  alertas inline com prefixo textual "Erro:"; avisos em tempo real (`NoticesRegion`, `aria-live="polite"`) com ícone +
  rótulo (leitor de tela) além da cor. Diálogos/drawers: nenhum é usado; a edição de carteira é inline (`aria-expanded`).
- Ajuste de a11y em relação ao layout: o rótulo "Esgotado" e os estados de erro usam texto/ícone, não apenas cor.
