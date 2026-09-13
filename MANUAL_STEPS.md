# ✋ Passos Manuais — Auditoria de Segurança & Performance

> Este arquivo lista **tudo que o agente não pode fazer automaticamente** e que você
> precisa executar manualmente, em ordem de urgência.
> Marque cada item com `[x]` conforme for concluindo.

---

## 🔴 URGENTE — Credenciais expostas (Tarefa 1)

### 1. Rotacionar a senha do PostgreSQL

A senha `Dourados1000` ficou no histórico Git. Mesmo após a limpeza do histórico,
ela deve ser considerada comprometida e trocada imediatamente.

**O que fazer:**

```bash
# No servidor PostgreSQL (via psql ou painel do Easypanel):
ALTER USER postgres WITH PASSWORD 'nova-senha-forte-aqui';
```

Depois de trocar, atualize a variável de ambiente em **todos os ambientes**:
- [x] Produção (Easypanel / painel de deploy): alterar `DATABASE_URL`
- [ ] Staging (se existir): alterar `DATABASE_URL`
- [x] `.env` local de cada desenvolvedor (avisar o time)

---

### 2. Rotacionar a senha do Redis

A senha `Dourados1000` também aparece no `REDIS_URL`. Troque no painel do Redis
e atualize a variável de ambiente:

- [x] Produção: alterar `REDIS_URL` (redis://default:**nova-senha**@...)
- [ ] Staging: idem
- [x] `.env` local de cada dev

---

### 3. Rotacionar a SECRET_KEY e MINIO_SECRET_KEY

Ambas também eram `Dourados1000` no `.env`:

- [x] Gerar nova `SECRET_KEY` (token aleatório, mínimo 32 chars):
  ```bash
  python -c "import secrets; print(secrets.token_hex(32))"
  ```
  Atualizar em produção, staging e `.env` local.
  > ⚠️ Trocar a SECRET_KEY invalida **todos os JWTs ativos** — os usuários serão deslogados.

- [x] Gerar nova `MINIO_SECRET_KEY` e atualizar no painel MinIO + variáveis de ambiente.

---

### 6. Configurar REDIS_URL em produção (necessário para Tarefa 7)

A Tarefa 7 implementa rate limiting baseado em Redis. Para funcionar com múltiplos
workers, a variável `REDIS_URL` precisa estar configurada no ambiente de produção.

- [ ] Confirmar que `REDIS_URL` está definida no painel do Easypanel / variáveis de env do container
- [ ] Verificar conectividade: `redis-cli -u $REDIS_URL ping` deve retornar `PONG`

Se `REDIS_URL` não estiver configurado, o rate limiting cai para modo em memória
(um dict por processo — não funciona corretamente com múltiplos workers do Gunicorn),
e aparecerá um aviso no log:
```
[rate-limit] REDIS_URL não configurado — usando fallback em memória (não confiável com WORKERS > 1)
```

---

### 7. Validar Content-Security-Policy em produção (Tarefa 9)

Após o deploy da Tarefa 9, testar **manualmente** no navegador:

- [ ] **Checkout completo** na loja: adicionar produto, ir até pagamento com SDK do Mercado Pago
- [ ] **Upload de imagem de produto** no CRM (admin)
- [ ] **Google Maps embed** na página "Onde Estamos" (se `VITE_GOOGLE_MAPS_EMBED_URL` estiver ativo)
- [ ] Abrir o console do navegador (F12) e verificar se há erros de CSP bloqueando scripts/imagens
- [ ] Testar no Chrome E Firefox (comportamento de CSP pode diferir)

**Como verificar erros de CSP:**
Abrir DevTools → aba Console → procurar mensagens como:
```
Refused to load script from 'https://...' because it violates the following Content Security Policy directive
```

Se houver erros, adicionar o domínio bloqueado à allowlist no `nginx.conf` e fazer novo deploy.

---

## 🟡 MÉDIO — Configuração da Tarefa 5 (índice trigram)

### 8. Rodar EXPLAIN ANALYZE para validar índice de busca

Após o deploy da Tarefa 5 (remoção de `p.descricao ILIKE` da query pública):

```sql
-- Conectar no banco de produção e rodar:
EXPLAIN ANALYZE
SELECT p.id, p.nome
FROM produtos p
LEFT JOIN categorias c ON c.id = p.categoria_id
WHERE p.is_published = true
  AND p.estoque_atual > 0
  AND p.imagem_url IS NOT NULL
  AND TRIM(p.imagem_url) <> ''
  AND (p.ativo IS TRUE OR p.ativo IS NULL)
  AND COALESCE(p.preco_loja_online, p.public_price, p.preco, 0) > 0
  AND (
    COALESCE(p.busca_total_normalizada, '') ILIKE '%suporte%'
    OR p.nome ILIKE '%suporte%'
    OR p.sku ILIKE '%suporte%'
  )
LIMIT 20 OFFSET 0;
```

- [ ] Verificar no output que aparece `Bitmap Index Scan` ou `Index Scan` em vez de `Seq Scan`
- [ ] Se ainda aparecer `Seq Scan` na coluna `descricao`, aplicar a migration de índice trigram
  que está em `backend/migrations/` (gerada pela Tarefa 5)

---

## 📋 Checklist de Deploy — Ordem das tarefas

Confirme que cada tarefa foi deployada e validada:

| Tarefa | Descrição | Deploy | Validado |
|--------|-----------|--------|----------|
| T1 | Credenciais removidas do código | `[x]` | `[ ]` |
| T2 | Helper de erros (sem info disclosure) | `[x]` | `[ ]` |
| T3 | Autorização por role nas rotas admin | `[x]` | `[ ]` |
| T4 | Debounce na busca da loja | `[x]` | `[ ]` |
| T5 | Índice trigram / remoção de descricao ILIKE | `[x]` | `[ ]` |
| T6 | Paginação sem COUNT(*) | `[x]` | `[ ]` |
| T7 | Rate limiting Redis | `[x]` | `[ ]` |
| T8 | Remoção de deps pesadas | `[x]` | `[ ]` |
| T9 | CSP nginx restrito | `[x]` | `[ ]` |
| T10 | Scripts debug movidos | `[x]` | `[ ]` |

---

## 🔑 Resumo de variáveis de ambiente a atualizar após rotação

| Variável | Onde | Motivo |
|----------|------|--------|
| `DATABASE_URL` | Produção, Staging, `.env` local | Senha do Postgres trocada |
| `REDIS_URL` | Produção, Staging, `.env` local | Senha do Redis trocada |
| `SECRET_KEY` | Produção, Staging, `.env` local | JWT key comprometida |
| `MINIO_SECRET_KEY` | Produção, Staging, MinIO console | Chave MinIO comprometida |

---

*Arquivo gerado automaticamente pelo agente em 2026-08-09. Atualize conforme for concluindo os itens.*
