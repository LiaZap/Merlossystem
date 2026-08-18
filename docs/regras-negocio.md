# Regras de Negocio do Cliente

## Como Usar Este Documento

Este arquivo e o registro oficial de TODAS as regras de negocio definidas pelo cliente.
Toda vez que uma regra nova for definida, ela DEVE ser adicionada aqui.
Agentes IA devem consultar este arquivo antes de implementar qualquer logica.

## Formato de Registro

Cada regra segue este formato:

```
### RN-[NUMERO] - [Titulo da Regra]
- **Definida por**: [Nome do cliente/stakeholder]
- **Data**: [YYYY-MM-DD]
- **Modulo**: [Qual parte do sistema]
- **Descricao**: [O que acontece]
- **Comportamento esperado**: [Como o sistema deve reagir]
- **Impacto se descumprida**: [O que da errado se nao seguir]
```

---

## Regras Globais (aplicam a todos os projetos)

### RN-001 - Exclusao Sempre Logica
- **Definida por**: Lucas Dettenborn
- **Data**: 2026-05-15
- **Modulo**: Todos
- **Descricao**: Nenhum registro pode ser excluido fisicamente do banco de dados
- **Comportamento esperado**: Ao excluir, marcar `is_deleted = true` e `deleted_at = now()`. Registro permanece no banco
- **Impacto se descumprida**: Perda de dados, impossibilidade de auditoria, cliente diz que "sumiu coisa"

### RN-002 - Rastreabilidade de Acoes
- **Definida por**: Lucas Dettenborn
- **Data**: 2026-05-15
- **Modulo**: Todos
- **Descricao**: Toda acao de criar, alterar ou excluir deve registrar quem fez e quando
- **Comportamento esperado**: Tabela de auditoria com user_id, acao, timestamp, dados anteriores e novos
- **Impacto se descumprida**: Impossibilidade de identificar origem de problemas

### RN-003 - Validacao Pre-Salvamento com Modal Block
- **Definida por**: Lucas Dettenborn
- **Data**: 2026-05-15
- **Modulo**: Lancamentos, Contratos, qualquer dado financeiro
- **Descricao**: Antes de salvar dados criticos, mostrar modal bloqueante por 3 segundos com resumo da acao
- **Comportamento esperado**: Modal aparece, tela bloqueia 3s, usuario le e confirma ou cancela
- **Impacto se descumprida**: Usuario salva dados errados sem perceber, gerando inconsistencias

### RN-004 - Versionamento de Documentos Gerados
- **Definida por**: Lucas Dettenborn
- **Data**: 2026-05-15
- **Modulo**: Relatorios, PDFs, Demonstrativos
- **Descricao**: Todo documento gerado (PDF, relatorio) deve ter versao incremental
- **Comportamento esperado**: v1, v2, v3... Sempre mostra ultima versao. Historico completo acessivel
- **Impacto se descumprida**: Cliente alega que dados mudaram sem prova do contrario

### RN-005 - Validacao de Categoria por Regex
- **Definida por**: Lucas Dettenborn
- **Data**: 2026-05-15
- **Modulo**: Lancamentos
- **Descricao**: Quando usuario lanca com categoria "Outros", validar por regex se a descricao corresponde a uma categoria existente
- **Comportamento esperado**: Sistema detecta que descricao "IPTU" deveria ser categoria IPTU, nao "Outros". Alerta o usuario
- **Impacto se descumprida**: Lancamentos ficam com categoria errada, relatorios ficam incorretos

---

## Regras Especificas do Projeto: [NOME DO PROJETO]

<!-- Adicionar regras especificas de cada cliente/projeto abaixo -->
<!-- Exemplo: -->

<!--
### RN-100 - [Titulo]
- **Definida por**: [Cliente]
- **Data**: [YYYY-MM-DD]
- **Modulo**: [Modulo]
- **Descricao**: [Descricao]
- **Comportamento esperado**: [Comportamento]
- **Impacto se descumprida**: [Impacto]
-->
