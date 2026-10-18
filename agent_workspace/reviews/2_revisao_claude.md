`specs/1_proposta_gemini.md` tem 0 bytes, então não há proposta do Gemini para auditar. A chamada ao Gemini provavelmente falhou e o orquestrador gravou o arquivo vazio mesmo assim. Auditei no lugar a spec que já existia, `specs/2_spec_final_claude.md` (v2.3), contra o README e o AGENTS.md. Não a executei nem testei, porque ainda não há código.

A v2.3 cobre bem o README: stack mínima com só `zod` de extra, ETH em `BigInt`, contratos REST, cenários do MSW, Socket.IO com deduplicação, 12 grupos de testes, Lighthouse e deploy.

Encontrei lacunas e gravei os ajustes como v2.4, na seção 14 do mesmo arquivo:
1. **Idempotência:** o replay de `POST /orders` precisa ser checado antes de `QUOTE_STALE`. Sem isso, o cenário de timeout com recuperação devolve erro em vez do pedido já criado.
2. **Pedido pendente:** faltava definir quem leva `PENDING` a `CONFIRMED` ou `DECLINED`. Agora o mock agenda a transição, grava no store e só depois emite `order.updated`. Retoma o timer após refresh.
3. **Regressão visual:** as baselines levam o nome da plataforma. As geradas no Windows falhariam no Linux ou no CI, então o template de caminho passa a ser sem plataforma, com baselines geradas num único ambiente.
4. **Sessão:** a expiração do token no mock usa o relógio da página, para funcionar com `page.clock`.
5. **Hash de senha:** `crypto.subtle` só funciona em `localhost` ou HTTPS. Isso fica documentado.
6. **Testes:** o passo 1 só termina com os testes unitários de `eth`, deduplicação e hash de idempotência passando, como exige o Critério 3.

Duas coisas ainda impedem implementar:
- **Veredito do Jev:** o atual é `noul 0.39`, abaixo do mínimo de 0.70, e vale para uma versão anterior. A v2.4 precisa ser reavaliada.
- **Figma:** o conector não está autorizado nesta sessão. Sem acesso ao arquivo ou um export de tokens e assets, os 20 pontos de fidelidade visual ficam sem base. Autorize o conector nas configurações do claude.ai.

Quer que eu comece pelo passo 1 (scaffold, schemas, `eth.ts` e testes) assim que o Jev reavaliar a v2.4?