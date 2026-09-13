# Supabase: chaves e RLS

## Chaves

| Onde | Chave | Comportamento |
|------|--------|----------------|
| Frontend React (`src/lib/supabase.ts`) | `VITE_SUPABASE_ANON_KEY` | Pedidos com JWT do utilizador; **RLS aplica-se**. |
| API Node (`backend/`), workers, n8n | `SUPABASE_SERVICE_ROLE_KEY` | **Ignora RLS**; usar só em servidor com segredos protegidos. |
| Backend Python | Preferir `SUPABASE_SERVICE_ROLE_KEY` em variáveis de ambiente do servidor | Idem. |

**Regra:** nunca embutir a service role no bundle do browser, em repositórios públicos ou em extensões de cliente.

## Auditoria de políticas

Script só de leitura: `supabase/scripts/audit_rls_policies.sql` (executar no SQL Editor antes/depois de migrações de segurança).

## Migrações relevantes

- `20260327100000_rls_crm_eh_staff_hardening.sql` — funções `crm_eh_staff()`, `check_is_store_admin()`, produtos, atendentes (SELECT), loja, landing, devoluções, `store_customers`.
- `20260327100500_rls_policies_crm_eh_staff_batch.sql` — políticas CRM que usavam `crm_eh_atendente()` passam a `crm_eh_staff()` (exceto INSERT/UPDATE/DELETE em `atendentes`).
- `20260327100600` … `20260327101000` — tabelas opcionais homónimas a views (`marketplace_products`, `store_published_products`, `orcamentos_ativos`, `store_critical_stock`, `pecas_master`, `pecas_master_compatibilidades`) se existirem como relação física (`relkind = 'r'`).

Para regenerar o batch a partir das migrações antigas (avaliar diff antes de substituir): `node scripts/gen_crm_staff_policies_sql.js`.
