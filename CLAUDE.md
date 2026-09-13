# Instruções do projeto

## Leitura obrigatória antes de editar

**[SECURITY.md](SECURITY.md)** — regras de segurança do projeto. Leia antes de
alterar qualquer coisa que envolva: rota de API, query SQL, valor monetário,
autenticação, pagamento, dado de cliente, upload ou variável de ambiente.

O resumo que não substitui a leitura:

- Nada vindo do navegador é confiável — preço, frete, desconto e permissão são decididos no servidor.
- SQL sempre com parâmetros `$1`; identificador dinâmico só com whitelist.
- Segredo nunca em log, resposta de API, commit ou conversa.
- Status de pagamento só muda por webhook validado, nunca porque o frontend avisou.
- Consulta de recurso por id filtra também pelo dono.
- Nunca receber, trafegar ou armazenar número de cartão.

Ao encontrar uma violação dessas regras enquanto trabalha em outra coisa:
registre em "Dívidas conhecidas" no SECURITY.md ou corrija, mas não replique o
padrão errado por consistência com o código existente.

## Contexto técnico

- **Backend**: FastAPI + asyncpg (PostgreSQL via pgbouncer). Entrada em `backend/app/main.py`, rotas em `backend/app/api/`.
- **Frontend**: React + Vite. O cliente HTTP em `src/lib/api.ts` devolve **JSON já parseado** — não use `res.data` como se fosse axios.
- **Fuso**: o servidor roda em UTC e a loja opera em `America/Campo_Grande` (UTC-4). Para data civil use `hoje_local()` / `HOJE_LOCAL_SQL` de `backend/app/utils/datas.py`, nunca `date.today()`, `CURRENT_DATE` ou `toISOString()`.
- **Deploy**: Easypanel/Docker Swarm na VPS. Migrations em `backend/migrations/` são aplicadas manualmente — não há runner automático no startup.
