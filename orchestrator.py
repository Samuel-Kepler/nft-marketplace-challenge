import os
import json
import time
import httpx
import subprocess
import datetime
from dotenv import load_dotenv

load_dotenv()

TYPESAFE_API_KEY = os.getenv("TYPESAFE_API_KEY", "")
LIMITE_TOKENS_SESSAO = int(os.getenv("MAX_BUDGET_TOKENS_SESSAO", 60000))
MAX_CICLOS_AUTOCORRECAO = 3

class GovernancaSessao:
    def __init__(self, teto: int):
        self.teto = teto
        self.tokens_usados = 0

    def registrar_gasto(self, entrada: str, saida: str, agente: str):
        estimativa = (len(entrada) + len(saida)) // 4
        self.tokens_usados += estimativa
        percentual = round((self.tokens_usados / self.teto) * 100, 1)
        print(f"📊 [COTA - {agente}] +{estimativa} tokens | Total: {self.tokens_usados}/{self.teto} ({percentual}%)")
        if self.tokens_usados >= self.teto:
            raise SystemExit("🛑 TRAVA DE SEGURANÇA: Limite de tokens da sessão atingido para proteger a cota diária.")

def ler_arquivo(caminho: str) -> str:
    return open(caminho, "r", encoding="utf-8").read() if os.path.exists(caminho) else ""

def salvar_arquivo(caminho: str, conteudo: str):
    dir_name = os.path.dirname(caminho)
    if dir_name:
        os.makedirs(dir_name, exist_ok=True)
    with open(caminho, "w", encoding="utf-8") as f:
        f.write(conteudo)

# =====================================================================
# 1. JEV: DECISÃO TIPADA VIA API (POST /v1/systemone)
# =====================================================================
def consultar_jev(state_payload: dict | str, questions_map: dict) -> dict:
    if not TYPESAFE_API_KEY:
        raise ValueError("TYPESAFE_API_KEY não configurada no arquivo .env!")

    url = "https://api.typesafe.ai/v1/systemone"
    headers = {
        "Authorization": f"Bearer {TYPESAFE_API_KEY}",
        "Content-Type": "application/json",
        "TypeSafe-Danger-Zone-Long-Context": "true"
    }
    
    if isinstance(state_payload, dict):
        state_str = "\n\n".join([f"=== {k.upper()} ===\n{v}" for k, v in state_payload.items()])
    else:
        state_str = str(state_payload)

    payload = {
        "model": "jev-latest",
        "state": state_str,
        "questions": questions_map
    }

    with httpx.Client(timeout=45.0) as client:
        res = client.post(url, headers=headers, json=payload)
        if res.status_code != 200:
            print(f"\n❌ [ERRO API JEV {res.status_code}]:\n{res.text}\n")
            res.raise_for_status()
        return res.json()["answers"]

# =====================================================================
# 2. SELEÇÃO DINÂMICA DE MODELOS (JEV ROUTER)
# =====================================================================
def alocar_modelos_jev(readme: str) -> dict:
    print("\n⚖️ [JEV ROUTER] Avaliando complexidade do projeto para alocar modelos justos...")
    perguntas = {
        "modelo_gemini": {
            "type": "choice",
            "instructions": "Qual modelo do Google AI Pro alocar para pesquisar a arquitetura sem desperdício?",
            "criteria": {
                "gemini-2.5-flash": "Projetos padrão, automações diretas ou CRUDs.",
                "gemini-2.5-pro": "Projetos de média/alta complexidade com múltiplos fluxos."
            }
        },
        "modelo_claude": {
            "type": "choice",
            "instructions": "Qual modelo do Claude Team alocar para desenvolvimento e testes?",
            "criteria": {
                "claude-sonnet-4-5": "Padrão ideal para codificação completa e testes.",
                "claude-opus-5-5": "Uso exclusivo para tarefas de raciocínio lógico extremo."
            }
        }
    }
    respostas = consultar_jev(readme, perguntas)
    frota = {
        "gemini": respostas["modelo_gemini"]["choice"],
        "claude": respostas["modelo_claude"]["choice"],
        "max_turns": 15 if respostas["modelo_claude"]["choice"] == "claude-opus-5-5" else 25
    }
    salvar_arquivo("agent_workspace/specs/0_frota_alocada.json", json.dumps(frota, indent=2, ensure_ascii=False))
    return frota

# =====================================================================
# 3. RELATÓRIO DO ESTUDO DE CASO PARA A TURMA
# =====================================================================
def gerar_log_estudo_caso(frota: dict, veredito: dict, governanca: GovernancaSessao, duracao: float):
    conteudo = f"""# Case de Estudo: Desenvolvimento Autônomo com IA (Spec-Driven Agentic Engineering)
- **Data da Execução:** {datetime.datetime.now().strftime("%d/%m/%Y %H:%M")}
- **Duração Total:** {duracao} minutos
- **Tokens Consumidos:** ~{governanca.tokens_usados} tokens
- **Frota Utilizada:**
  * Pesquisa/Arquitetura: `{frota.get('gemini')}`
  * Crítica e Código: `{frota.get('claude')}`
  * Diretor de Decisão: `Jev (jev-latest)`

## Linha do Tempo e Veredito do Comitê
- **Aderência ao README (Noul):** {veredito.get('aderente_ao_escopo', {}).get('noul', 'N/A')}
- **Nível de Maturidade da Arquitetura (Score):** {veredito.get('maturidade_arquitetural', {}).get('choice', 'N/A')}
- **Decisão Final:** `{veredito.get('caminho_escolhido', {}).get('choice', 'N/A')}`
"""
    salvar_arquivo("CASE_STUDY_LOG.md", conteudo)
    print("📋 'CASE_STUDY_LOG.md' atualizado com sucesso para apresentação.")

# =====================================================================
# 4. CICLO DE EXECUÇÃO MULTI-AGENTE
# =====================================================================
if __name__ == "__main__":
    inicio = time.time()
    governanca = GovernancaSessao(teto=LIMITE_TOKENS_SESSAO)
    
    readme = ler_arquivo("README.md")
    agents = ler_arquivo("AGENTS.md")
    
    if not readme.strip():
        raise SystemExit("⚠️ Preencha os requisitos no README.md antes de iniciar!")

    frota = alocar_modelos_jev(readme)
    feedback_anterior = ""
    veredito_final = {}
    rota_aprovada = None

    for ciclo in range(1, MAX_CICLOS_AUTOCORRECAO + 1):
        print(f"\n🔄 --- CICLO MULTI-AGENTE #{ciclo} ---")
        
        # 1. Gemini PM pesquisa e especifica
        caminho_spec = "agent_workspace/specs/1_proposta_gemini.md"
        spec_existente = ler_arquivo(caminho_spec)

        if ciclo == 1 and len(spec_existente) > 500 and "Linha de comando muito longa" not in spec_existente:
            print("\n🤖 [Gemini PM] Reaproveitando a especificação técnica já gerada anteriormente...")
            spec = spec_existente
        else:
            print("\n🤖 [Gemini PM] Gerando especificação técnica completa...")
            prompt_pm = f"""Atue como Arquiteto de Software e PM Sênior.
Leia atentamente os arquivos 'README.md' e 'AGENTS.md' localizados na raiz do projeto.

REQUISITOS CRÍTICOS OBRIGATÓRIOS (COBRIR NA ÍNTEGRA):
- Stack obrigatória: React, TypeScript, TanStack Router e Query, Axios, Socket.IO, Tailwind, shadcn/ui, MSW, Playwright e Lighthouse.
- Mock de Socket.IO via MSW (@mswjs/socket.io-binding) trafegando via socket.io-client real.
- Eventos obrigatórios: nft.updated e order.updated com id estável, versão, deduplicação e reconciliação REST após reconectar.
- Pedidos idempotentes: mesma chave recuperando o mesmo pedido; chave reutilizada com payload alterado gerando 409.
- Valores em ETH: strings decimais com precisão usando lib decimal ou BigInt.
- Plano de testes: 12 grupos de testes E2E Playwright, regressão visual e metas do Lighthouse.

{feedback_anterior}

Escreva uma especificação técnica em Markdown completa e exaustiva abordando cada um dos requisitos acima.
"""
            salvar_arquivo("agent_workspace/temp_prompt_gemini.md", prompt_pm)
            
            with open("agent_workspace/temp_prompt_gemini.md", "r", encoding="utf-8") as f_in:
                res_gemini = subprocess.run(
                    ["gemini"],
                    stdin=f_in,
                    capture_output=True,
                    text=True,
                    shell=True
                )
            
            spec = res_gemini.stdout.strip()
            if not spec or "Linha de comando muito longa" in spec:
                res_gemini = subprocess.run(
                    'gemini -p "Leia o arquivo agent_workspace/temp_prompt_gemini.md e README.md e gere a spec técnica completa."',
                    capture_output=True,
                    text=True,
                    shell=True
                )
                spec = res_gemini.stdout.strip()

            salvar_arquivo(caminho_spec, spec)
            governanca.registrar_gasto(prompt_pm, spec, "Gemini PM")

        # 2. Claude Dev critica e refina
        print("\n🧐 [Claude Dev] Auditando a proposta do Gemini contra o README.md...")
        prompt_dev = (
            "Audite rigorosamente a especificação técnica em agent_workspace/specs/1_proposta_gemini.md contra o README.md e AGENTS.md. "
            "Aponte melhorias e forneça a versão refinada, enxuta e completa pronta para implementação."
        )
        
        res_claude = subprocess.run(
            ["claude", "-p", prompt_dev, "--max-turns", "10"],
            capture_output=True,
            text=True,
            shell=True
        )
        
        if res_claude.returncode != 0:
            print(f"\n❌ [ERRO NA CLI DO CLAUDE]:\n{res_claude.stderr or res_claude.stdout}")
            raise SystemExit("A execução do Claude Code falhou. Verifique os logs acima.")

        critica = res_claude.stdout.strip()
        salvar_arquivo("agent_workspace/reviews/2_revisao_claude.md", critica)
        governanca.registrar_gasto(prompt_dev, critica, "Claude Dev")

        # 3. Comitê Jev decide
        print("\n⚡ [JEV Director] Julgando o debate através da Árvore de Decisão...")
        estado_debate = {
            "readme": readme,
            "regras": agents,
            "proposta_gemini": spec,
            "revisao_claude": critica
        }
        
        perguntas_decisao = {
            "aderente_ao_escopo": {
                "type": "noul",
                "instructions": "Considerando a proposta do Gemini e os refinamentos do Claude, a solução contempla satisfatoriamente os requisitos técnicos essenciais do README?"
            },
            "maturidade_arquitetural": {
                "type": "choice",
                "instructions": "Qual o nível de maturidade técnica da arquitetura debatida?",
                "criteria": {
                    "excelente": "Arquitetura desacoplada, atende a todos os pontos com padrões de excelência.",
                    "adequada": "Atende aos requisitos essenciais sem excessos desnecessários.",
                    "inadequada": "Apresenta omissões graves impossíveis de implementar."
                }
            },
            "caminho_escolhido": {
                "type": "choice",
                "instructions": "Qual rota o comitê aprova para implementação?",
                "criteria": {
                    "implementar_revisao_claude": "A revisão e refinamentos do Claude constituem a melhor base para codificar.",
                    "implementar_proposta_gemini": "A proposta do Gemini já é suficiente e atende ao projeto.",
                    "refazer_pesquisa": "A spec técnica ainda precisa de correções estruturais antes do código."
                }
            }
        }
        
        veredito_final = consultar_jev(estado_debate, perguntas_decisao)
        salvar_arquivo("agent_workspace/specs/3_veredito_jev.json", json.dumps(veredito_final, indent=2, ensure_ascii=False))

        rota = veredito_final["caminho_escolhido"]["choice"]
        noul_aderencia = veredito_final["aderente_ao_escopo"]["noul"]
        print(f"📋 Decisão Jev: {rota} | Aderência: {noul_aderencia}")

        # Se aderência for razoável ou for a última rodada com revisão válida do Claude, aprova
        if (rota != "refazer_pesquisa" and noul_aderencia >= 0.35) or ciclo == MAX_CICLOS_AUTOCORRECAO:
            rota_aprovada = "implementar_revisao_claude" if "revisao_claude" in rota or len(critica) > 300 else "implementar_proposta_gemini"
            print(f"✅ Rota de implementação validada pelo comitê: {rota_aprovada}")
            break
        else:
            print("⚠️ Jev solicitou ajustes na arquitetura. Reiniciando ciclo de refinamento...")
            feedback_anterior = f"\n[CORREÇÕES APONTADAS PELO AUDITOR CLAUDE NO ÚLTIMO CICLO]:\n{critica}\n"

    # 4. Implementação pelo Claude Builder
    if rota_aprovada:
        arquivo_base = "agent_workspace/reviews/2_revisao_claude.md" if rota_aprovada == "implementar_revisao_claude" else "agent_workspace/specs/1_proposta_gemini.md"
        print(f"\n🚀 [CLAUDE BUILDER] Iniciando implementação autônoma com base em '{arquivo_base}'...")
        prompt_exec = (
            f"O Comitê Jev aprovou a especificação técnica documentada em '{arquivo_base}'. "
            f"Implemente o código-fonte da aplicação, arquivos de configuração, testes automatizados e componentes necessários para cumprir o README.md."
        )
        res_builder = subprocess.run([
            "claude", "-p", prompt_exec,
            "--model", frota["claude"],
            "--max-turns", str(frota["max_turns"]),
            "--dangerously-skip-permissions"
        ], capture_output=True, text=True, check=True, shell=True)
        
        salvar_arquivo("logs/log_implementacao.txt", res_builder.stdout or res_builder.stderr)
        governanca.registrar_gasto(prompt_exec, res_builder.stdout, "Claude Builder")

    tempo_total = round((time.time() - inicio) / 60, 2)
    gerar_log_estudo_caso(frota, veredito_final, governanca, tempo_total)
    print(f"\n🏁 Processo autônomo concluído com sucesso em {tempo_total} minutos!")