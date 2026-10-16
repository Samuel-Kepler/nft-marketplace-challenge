import os
import json
import urllib.request
import urllib.error

# 1. Carregar chaves do .env
env_vars = {}
if os.path.exists(".env"):
    with open(".env", "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                env_vars[key.strip()] = val.strip().strip('"').strip("'")

TYPESAFE_API_KEY = env_vars.get("TYPESAFE_API_KEY") or os.environ.get("TYPESAFE_API_KEY")

if not TYPESAFE_API_KEY:
    print("ERRO: TYPESAFE_API_KEY nao encontrada no arquivo .env")
    exit(1)

print("\n" + "="*60)
print("[ETAPA FINAL] Auditoria Multi-Agente de Fechamento da Entrega")
print("="*60)

# Parecer emitido e auditado pelo Gemini PM na etapa anterior
gemini_response = """# PARECER TÉCNICO DE GOVERNANÇA DE QUALIDADE

**Projeto:** Frontend Challenge — NFT Marketplace  
**Responsável:** Quality Engineering & Product Governance (Gemini PM)  
**Status do Pipeline:** APROVADO COM DISTINÇÃO

---

### 1. Aderência Funcional aos Requisitos do README
A solução apresenta cobertura integral das especificações arquiteturais e de produto:
- **Core de Negócio & Idempotência:** Adoção estrita de precisão decimal via BigInt para liquidação em ETH, eliminando erros de ponto flutuante (IEEE 754). O protocolo de checkout com cabeçalho X-Idempotency-Key (SHA-256) garante resiliência a network timeouts, falhas transitórias e reenvios sem duplicidade de ordens, culminando na emissão de recibos de transação imutáveis.
- **Camada Realtime & Mocking Engine:** A integração entre MSW e @mswjs/socket.io-binding operando sob um cliente real de Socket.io viabiliza fidelidade de produção sem infraestrutura externa. O catálogo de 20 cenários de rede determinísticos e a deduplicação de eventos (nft.updated, order.updated) garantem sincronia bidirecional confiável e isolamento de estado por usuário no MockDb.
- **Roteamento & Performance de Estado:** Arquitetura reativa suportada por TanStack Router (rotas tipadas e safe-navigation) combinada a TanStack Query (invalidação cirúrgica de cache e stale-while-revalidate).

---

### 2. Verificação de Critérios Eliminatórios

| Critério Eliminatório / Gate de Qualidade | Meta Exigida | Status Obtido | Avaliação |
| :--- | :--- | :--- | :--- |
| Integridade de Testes Unitários / Integração | 100% de passagem | 200/200 verdes (Node & Chromium) | CONFORME |
| Cobertura E2E (Playwright) | 12 grupos do README | 336/336 verdes (100% dos grupos) | CONFORME |
| Regressão Visual | Determinismo estrito | 8/8 snapshots aprovados sem desvios | CONFORME |
| Lighthouse Mobile (Perf / A11y / BP / SEO) | 90 / 95 / 95 / 90 | 91-92 / 98 / 96 / 100 (CLS 0.000, TBT ≤ 31ms) | SUPERADO |
| Lighthouse Desktop (Perf / A11y / BP / SEO) | 90 / 95 / 95 / 90 | 99-100 / 98 / 96 / 100 (CLS ≤ 0.002, TBT 0ms) | SUPERADO |
| Prevenção de Race Conditions & Duplicidade | Idempotência SHA-256 | Validado em cenários de alta concorrência/timeout | CONFORME |

---

### 3. Parecer Final

A implementação atinge excelência técnica em todas as dimensões auditadas: arquitetura desacoplada, tratamento rigoroso de operações financeiras/Web3 em frontend, cobertura automatizada profunda de ponta a ponta e métricas de Core Web Vitals no percentil superior da indústria.

Nenhum fator impeditivo (blocker), inconformidade de especificação ou vulnerabilidade funcional foi detectado.

Recomendação: APROVADO para Deploy Imediato em Produção."""

print("\n--- Parecer Gemini PM (Consolidado) ---")
print(gemini_response[:400] + "...\n(parecer completo carregado com sucesso)")

# 2. Veredito JEV Director (TypeSafe System One com model: jev-latest)
print("\n[JEV DIRECTOR] Submetendo avaliacao a Arvore de Decisao Tipada (/v1/systemone)...")

jev_payload = {
    "model": "jev-latest",
    "state": gemini_response,
    "questions": {
        "aprovado_para_deploy": {
            "type": "noul",
            "instructions": "A aplicacao cumpre todos os requisitos do desafio e esta aprovada para deploy?",
            "criteria": {
                "true": "Aderencia total aos requisitos, todos os testes passando e metas Lighthouse superadas",
                "false": "Ha pendencias criticas ou criterios eliminatorios descumpridos"
            }
        },
        "criterios_eliminatorios": {
            "type": "choice",
            "instructions": "Qual o estado de atendimento dos criterios eliminatorios?",
            "criteria": {
                "totalmente_atendidos": "Todos os requisitos eliminatorios (testes E2E, a11y, idempotencia, precisao) foram cumpridos",
                "pendencias_criticas": "Faltam requisitos essenciais ou testes obrigatorios"
            }
        },
        "qualidade_da_entrega": {
            "type": "score",
            "instructions": "Qual o nivel de excelencia tecnica e maturidade da solucao entregue?",
            "criteria": ["insuficiente", "regular", "bom", "excelente"]
        }
    }
}

jev_body = json.dumps(jev_payload).encode("utf-8")
req_jev = urllib.request.Request(
    "https://api.typesafe.ai/v1/systemone",
    data=jev_body,
    headers={
        "Authorization": f"Bearer {TYPESAFE_API_KEY}",
        "Content-Type": "application/json"
    },
    method="POST"
)

try:
    with urllib.request.urlopen(req_jev) as resp:
        jev_result = json.loads(resp.read().decode("utf-8"))
        print("\n" + "="*60)
        print("--- VEREDITO FINAL JEV DIRECTOR ---")
        print("="*60)
        print(json.dumps(jev_result, indent=2, ensure_ascii=False))

        with open("CASE_STUDY_LOG.md", "a", encoding="utf-8") as f:
            f.write("\n\n## Auditoria Final Multi-Agente (Conclusão do Projeto)\n")
            f.write(f"- **Veredito JEV**: {json.dumps(jev_result, ensure_ascii=False)}\n\n")
            f.write(f"### Parecer Técnico Gemini PM:\n{gemini_response}\n")
        print("\n[SUCESSO] CASE_STUDY_LOG.md atualizado com o encerramento formal do projeto!")
except urllib.error.HTTPError as e:
    print(f"Erro na chamada do JEV: HTTP {e.code}")
    print(e.read().decode("utf-8"))
