# Observabilidade do Banco de Dados

Para monitorar queries lentas ou custosas no PostgreSQL do Easypanel:

1. Habilite a extensão `pg_stat_statements` no servidor:
   - Adicione `shared_preload_libraries = 'pg_stat_statements'` nas configurações do PostgreSQL (`postgresql.conf` ou variáveis de ambiente de inicialização no Easypanel).
   - Reinicie o serviço do PostgreSQL. (Isto requer reinicialização do banco de dados).

2. Habilite limites de segurança (timeouts) executando diretamente no banco via console/PgAdmin/DBeaver:
   ```sql
   ALTER SYSTEM SET statement_timeout = '30s';
   ALTER SYSTEM SET idle_in_transaction_session_timeout = '60s';
   SELECT pg_reload_conf();
   ```

3. Utilize o script `backend/scripts/top_queries.sql` periodicamente para analisar as consultas com maior impacto no banco.
