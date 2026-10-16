# Auditoria da `1_proposta_gemini.md` (Claude Tech Lead)

Veredito: **REVISAR** — Critério 1 reprovado (falhas eliminatórias do README), Critério 2 aprovado com ressalvas. Versão corrigida: `specs/2_spec_final_claude.md` (v2.1).

## Falhas vs README (eliminatórias ou de pontuação)
1. Transporte falso: Service Worker não intercepta WebSocket; `@mswjs/socket.io-binding` usa a API `ws` do MSW na página. Porta `localhost:3000` fixa quebra o deploy.
2. Isolamento entre usuários só no cliente (`event.userId`); dados já chegam ao socket errado. Logout não limpava `queryClient`/carrinho/tentativa de checkout.
3. Cenário 8 (retentativa *automática*) contradiz `retry: 0` e README (retry é do usuário, mesma chave).
4. `nft.updated` só invalidava na reconexão; README exige atualizar catálogo/detalhe/carrinho e bloquear cotação defasada.
5. Cliente calculava totais com BigInt; README: cotação da API é a referência. `ethToWei` truncava em silêncio (19+ casas) e aceitava `-`/lixo.
6. `PUT /cart` em lote em vez de incluir/alterar/remover; `GET /cart` "opcional" ambíguo; faltam `connect/disconnect` de carteira (conexão/recusa), `featured`, envelope de erro (403, 503, `fields`).
7. Preço/título/imagem enviados pelo cliente no carrinho (preço obsoleto confiável); `isFavorite` duplicava `/favorites`.
8. Cenários MSW incompletos (sem resultado vazio, 403, conflito de cadastro, validação, latência variável, edição esgotada, pagamento confirmado, recusa de carteira); `x-mock-scenario` no Axios põe lógica de mock no cliente.
9. E2E: grupos 07/08/11/12 sem falha de pagamento+clique repetido, avatar, validação de formulário, recuperação após retry; sem viewport 768.
10. `201`/`200` ambíguo na idempotência; hash incluía `total` calculado.

## Bloatware / erros de tooling
- Removidos: `tailwind.config.js`, `app/router.tsx`, `mocks/server.ts`, `tests/fixtures`, `hooks/` genérico, `zodSearchValidator` (obsoleto). Único extra mantido: `zod` (contratos em runtime exigidos).
- `eslint --ext` quebra no ESLint 9; `test:visual --update-snapshots` sobrescrevia baselines; `sessionStorage` do store não sobrevive a nova aba/contexto (usar `localStorage`).
- Adicionado na v2.1: `tsc -b --noEmit` inválido em projetos composite; `page.request` não atravessa o Service Worker (controle de mocks via `fetch` na página); `testMatch` por projeto; viewport 768.

## Pendência ao implementar
Validar em runtime que `@mswjs/socket.io-binding` suporta a versão instalada de `msw`/`socket.io-client` antes de construir sobre ele (spike na etapa 2).
