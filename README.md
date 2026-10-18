# NFT Marketplace — um case de desenvolvimento com três IAs

Marketplace de NFTs em **React + TypeScript**, construído como experimento de **desenvolvimento autônomo com três agentes de IA**: Gemini, Claude Code e JEV.

- 🔗 **Demo:** https://nft-marketplace-challenge.vercel.app
- 💻 **Repositório:** https://github.com/Samuel-Kepler/nft-marketplace-challenge
- 📄 **Enunciado original do desafio:** [`DESAFIO.md`](./DESAFIO.md)

> A demo roda inteira com **dados simulados** (MSW + Socket.IO simulado). Não há backend real, carteira real nem pagamento real.

---

## O experimento

A meta era ver até onde três IAs conseguiam entregar um projeto sozinhas, cada uma com um papel:

| Agente | Papel |
| --- | --- |
| **Gemini** | Pesquisa arquitetura, stack e skills e propõe a especificação |
| **Claude Code** | Implementa o código e critica as decisões (inclusive a spec do Gemini) |
| **JEV** | Consolida as análises e emite o veredito sobre o caminho a seguir |

Os papéis e as regras de decisão estão em [`AGENTS.md`](./AGENTS.md). Os artefatos que cada agente produziu ficam em [`agent_workspace/`](./agent_workspace).

### O que aconteceu

| Versão | Resultado |
| --- | --- |
| **v1** (`main` até o commit `664d4d2`, tag `v1-sem-estilos`) | A API do Gemini falhou e ele não cumpriu o papel dele (a proposta ficou com **0 bytes**: [`agent_workspace/specs/1_proposta_gemini.md`](./agent_workspace/specs/1_proposta_gemini.md)). O projeto rodou, mas **sem os estilos do design**. |
| **v2** (branch `feat/gemini-refactor-mcp`, PR #1) | Nova branch com o acesso ao Figma e a integração com a API do Gemini corrigidos. O refactor entregou os requisitos esperados desde o início, com o tema escuro do Figma. |

### O custo real

A ideia era reduzir o esforço humano, mas foi o contrário: na maior parte do tempo, **eu** precisei agir para corrigir erros nos scripts Python e nas integrações com as APIs das IAs. O orquestrador registra ~10 minutos de execução automática ([`CASE_STUDY_LOG.md`](./CASE_STUDY_LOG.md)), e esse número **não inclui o tempo humano de correção**.

### Lições

- Orquestrar IAs acelera a escrita de código, mas a supervisão humana continua sendo a maior parte do trabalho.
- Antes de colocar mais agentes na mesa, vale "afiar a base": integrações testadas e respostas validadas (por exemplo, detectar uma resposta vazia) economizam mais tempo do que um agente a mais.

---

## Stack

React 19 · TypeScript · Vite · TanStack Router · TanStack Query · Axios · Socket.IO · Tailwind CSS v4 · shadcn/ui · MSW · Zod · Playwright · Lighthouse

Destaques técnicos: cálculos financeiros em `BigInt`, checkout idempotente (`X-Idempotency-Key`), invalidação de cache por eventos em tempo real e catálogo determinístico de 48 NFTs. Detalhes em [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Como rodar o front-end

Requisitos: Node.js 18 ou superior (testado com Node 22).

```bash
npm ci
npm run dev        # desenvolvimento, com mocks (porta do Vite)
npm run build      # typecheck + build de produção
npm run preview    # serve o build localmente
```

## Testes

```bash
npm run test:unit          # 129 testes
npm run test:integration   # 71 testes
npm run test:e2e           # 67 cenários × 3 viewports (desktop, mobile, tablet)
npm run test:visual        # 8 snapshots de regressão visual
npm run audit:lighthouse   # auditoria de performance
```

Os testes usam Playwright. Na primeira vez, instale os navegadores com `npx playwright install`.

## Performance (Lighthouse)

Relatórios completos em [`docs/lighthouse`](./docs/lighthouse).

| Perfil | Página | Perf | A11y | BP | SEO |
| --- | --- | ---: | ---: | ---: | ---: |
| mobile | `/` | 92 | 98 | 96 | 100 |
| mobile | `/nft/nft-001` | 91 | 98 | 96 | 100 |
| desktop | `/` | 99 | 98 | 96 | 100 |
| desktop | `/nft/nft-001` | 100 | 98 | 96 | 100 |

## Scripts de orquestração (Python)

Scripts usados para coordenar os três agentes. Eles chamam APIs pagas, então **não precisam ser executados para rodar o front-end**.

```bash
pip install -r requirements.txt
cp .env.example .env     # preencha as chaves; o .env nunca vai para o Git

python orchestrator.py            # v1: fluxo original
python orchestrator_refactor.py   # v2: refactor da branch feat/gemini-refactor-mcp
python final_audit.py             # auditoria final com o JEV
```

| Variável | Para quê |
| --- | --- |
| `GEMINI_API_KEY` | API do Gemini |
| `ANTHROPIC_API_KEY` | API do Claude |
| `TYPESAFE_API_KEY` | API do JEV |
| `MAX_BUDGET_TOKENS_SESSAO` | Trava de segurança de tokens por sessão |

## Estrutura

```
agent_workspace/   specs, revisões e vereditos de cada agente (v1 e v2)
docs/lighthouse/   relatórios de performance
src/               aplicação (features, shared, mocks, routes)
tests/             unit, integration, e2e e visual
orchestrator*.py   orquestração dos agentes
```

## Sobre as imagens

Os NFTs usam imagens geradas apenas como **placeholder**, em `public/assets/nfts/`.

## Autor

**Samuel Kepler** · [GitHub](https://github.com/Samuel-Kepler)
