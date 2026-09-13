# Auditoria de Consultas (Padrão N+1)

Relatório gerado a partir da execução do script `audit_seq_scans.py` e cruzado com as métricas de diagnóstico:

## Top Tabelas com Problemas de Seq Scan
| Tabela | Seq Scans | Ratio (Seq/Idx) | Recomendação/Ação |
|---|---|---|---|
| `localizacoes` | 24.351.090 | Muito Alto | Criar índice textual (`pg_trgm`) nas colunas `nome` e `sigla` (**Resolvido** na Migration). |
| `sucatas_pecas` | 2.686.756 | Alto | Criar índices nas FKs `sucata_id` e `produto_id` (**Resolvido** na Migration). |
| `produtos` | 359.967 | Médio | Volume de tráfego geral alto, já utiliza bastante scan de índice. Avaliar pontualmente queries pesadas no futuro. |
| `orcamentos_itens`| 32.255 | Alto | Adicionar índices nas chaves estrangeiras se a tabela escalar no futuro. |

## Observações Gerais
A causa principal do altíssimo volume de *seq scans* para tabelas pequenas (`localizacoes`) reflete um problema de consulta não-indexada dentro de iterações/loops — padrão conhecido como N+1.
Com os novos índices inseridos, espera-se uma queda drástica nessa proporção. Execute `backend/scripts/audit_seq_scans.py` quinzenalmente para verificar o *ratio* e diagnosticar regressões.
