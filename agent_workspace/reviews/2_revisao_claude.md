`specs/1_proposta_gemini.md` tem 0 bytes, entÃ£o nÃ£o hÃ¡ proposta do Gemini para auditar. A chamada ao Gemini provavelmente falhou e o orquestrador gravou o arquivo vazio mesmo assim. Auditei no lugar a spec que jÃ¡ existia, `specs/2_spec_final_claude.md` (v2.3), contra o README e o AGENTS.md. NÃ£o a executei nem testei, porque ainda nÃ£o hÃ¡ cÃ³digo.

A v2.3 cobre bem o README: stack mÃ­nima com sÃ³ `zod` de extra, ETH em `BigInt`, contratos REST, cenÃ¡rios do MSW, Socket.IO com deduplicaÃ§Ã£o, 12 grupos de testes, Lighthouse e deploy.

Encontrei lacunas e gravei os ajustes como v2.4, na seÃ§Ã£o 14 do mesmo arquivo:
1. **IdempotÃªncia:** o replay de `POST /orders` precisa ser checado antes de `QUOTE_STALE`. Sem isso, o cenÃ¡rio de timeout com recuperaÃ§Ã£o devolve erro em vez do pedido jÃ¡ criado.
2. **Pedido pendente:** faltava definir quem leva `PENDING` a `CONFIRMED` ou `DECLINED`. Agora o mock agenda a transiÃ§Ã£o, grava no store e sÃ³ depois emite `order.updated`. Retoma o timer apÃ³s refresh.
3. **RegressÃ£o visual:** as baselines levam o nome da plataforma. As geradas no Windows falhariam no Linux ou no CI, entÃ£o o template de caminho passa a ser sem plataforma, com baselines geradas num Ãºnico ambiente.
4. **SessÃ£o:** a expiraÃ§Ã£o do token no mock usa o relÃ³gio da pÃ¡gina, para funcionar com `page.clock`.
5. **Hash de senha:** `crypto.subtle` sÃ³ funciona em `localhost` ou HTTPS. Isso fica documentado.
6. **Testes:** o passo 1 sÃ³ termina com os testes unitÃ¡rios de `eth`, deduplicaÃ§Ã£o e hash de idempotÃªncia passando, como exige o CritÃ©rio 3.

Duas coisas ainda impedem implementar:
- **Veredito do Jev:** o atual Ã© `noul 0.39`, abaixo do mÃ­nimo de 0.70, e vale para uma versÃ£o anterior. A v2.4 precisa ser reavaliada.
- **Figma:** o conector nÃ£o estÃ¡ autorizado nesta sessÃ£o. Sem acesso ao arquivo ou um export de tokens e assets, os 20 pontos de fidelidade visual ficam sem base. Autorize o conector nas configuraÃ§Ãµes do claude.ai.

Quer que eu comece pelo passo 1 (scaffold, schemas, `eth.ts` e testes) assim que o Jev reavaliar a v2.4?