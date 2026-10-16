\# Governança da Equipa Multi-Agente (Gemini + Claude + Jev)



\## Papéis

1\. \*\*Gemini (Product Manager \& Arquiteto):\*\* Pesquisa referências e skills no GitHub/web, divide o escopo do README.md em tarefas e gera as especificações técnicas (`specs/`).

2\. \*\*Claude Code (Tech Lead \& Senior Dev):\*\* Analisa criticamente a proposta do Gemini, elimina dependências desnecessárias (anti-bloatware), propõe a versão enxuta da spec e implementa o código com testes.

3\. \*\*Jev (Diretor Técnico \& Motor de Decisão - Sistema 1):\*\* Avalia o alinhamento das propostas em milissegundos via lógica estrita e emite o veredito determinístico.



\## Árvore de Decisão do Comitê Jev

\- \*\*Critério 1 (Aderência ao Escopo):\*\* As decisões e dependências respeitam estritamente o `README.md`? (Se Noul < 0.70 -> Rejeitar/Revisar).

\- \*\*Critério 2 (Navalha de Occam):\*\* Se uma funcionalidade puder ser feita com código nativo simples, rejeitar bibliotecas pesadas externas.

\- \*\*Critério 3 (Qualidade do Código):\*\* O código final gerado pelo Claude deve conter testes unitários válidos.

