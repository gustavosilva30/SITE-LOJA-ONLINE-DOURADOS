# Segurança — leia antes de editar este projeto

Este documento é obrigatório para qualquer pessoa ou IA que vá alterar o CRM, a
loja online ou o portal. Ele não é teoria: as regras abaixo vêm de padrões que
já existem neste código, e os exemplos "errado" são falhas reais que estavam ou
estão aqui.

O sistema guarda dados de clientes (nome, CPF, endereço, telefone), movimenta
dinheiro e conversa com Mercado Livre e Mercado Pago. Um vazamento aqui não é
incidente técnico: é processo judicial, multa de LGPD e perda do direito de
operar como vendedor nas plataformas.

## Antes de qualquer coisa: o que este documento não promete

Não existe sistema "100% seguro" ou "à prova de hackers". Quem promete isso está
vendendo, não protegendo. O que existe é **redução de superfície** e
**contenção de dano**: dificultar a entrada, limitar o que um invasor alcança se
entrar, e detectar rápido. Todas as regras aqui servem a esses três objetivos.

Quem escrever "sistema 100% seguro" num relatório está errado. Escreva o que foi
protegido, contra o quê, e o que continua exposto.

---

## 1. O frontend é território hostil

**Nada que chega do navegador é confiável.** Nem preço, nem desconto, nem frete,
nem o `id` do usuário, nem a permissão, nem o status do pedido. Qualquer pessoa
abre o DevTools e altera o corpo da requisição — não é preciso ser hacker, é
preciso ser curioso.

O frontend serve para **exibir** e **enviar intenção**. Quem decide valor,
permissão e efeito é sempre o backend.

### Valores monetários

O padrão correto já está em [store_checkout.py](backend/app/api/store_checkout.py):
o preço nunca vem do cliente, é relido do banco:

```python
# CERTO — busca o produto e usa o preço do banco
p = await db.fetchrow("SELECT id, nome, preco, public_price FROM produtos WHERE id = $1", item.product_id)
preco = float(p.get("public_price") or p.get("preco") or 0)
sub = round(preco * item.quantity, 2)
```

```python
# ERRADO — o cliente decide quanto paga
sub = item.preco_unitario * item.quantity
```

O cliente envia **o que quer comprar e quanto** (`product_id`, `quantity`).
Nunca **por quanto**.

Vale para: preço, desconto, frete, taxa, acréscimo, valor de parcela, cashback,
crédito de devolução. Todos calculados no servidor, a partir de dados do banco ou
de uma API externa consultada na hora.

### Permissão e identidade

O usuário vem do token verificado (`get_current_user`), nunca de um campo do
corpo. Se a requisição traz `atendente_id` ou `user_id`, ignore e use o do token,
a menos que a rota seja explicitamente administrativa **e** valide a permissão.

Atenção a uma característica do nosso JWT: ele carrega as permissões
(`perm_vendas`, `perm_financeiro`, `perm_config`…) dentro do próprio token. Isso
significa que **revogar uma permissão não tem efeito imediato** — o token antigo
continua válido até expirar. Para ações sensíveis (excluir, alterar preço,
liberar crédito, mexer em configuração), **releia a permissão do banco**, não
confie na claim.

---

## 2. SQL: parâmetros sempre, concatenação nunca

Usamos `asyncpg`, que tem parâmetros posicionais. É a única forma aceita de
passar valor para uma query.

```python
# CERTO
await db.fetch("SELECT * FROM produtos WHERE nome ILIKE $1 AND ativo = $2", f"%{termo}%", True)
```

```python
# ERRADO — injeção direta
await db.fetch(f"SELECT * FROM produtos WHERE nome ILIKE '%{termo}%'")
```

### Quando a parte variável é o nome da coluna ou tabela

Parâmetro não funciona para identificador. Nesse caso, **whitelist obrigatória** —
é o padrão que [catalogo.py](backend/app/api/catalogo.py) já usa:

```python
# CERTO — só passam colunas de uma lista fechada, definida no código
dados_safe = {k: v for k, v in dados.items() if k in whitelist}
sc = ", ".join([f"{k} = ${i+1}" for i, k in enumerate(dados_safe)])
return f"UPDATE {table} SET {sc} WHERE {id_col} = ${len(values)} RETURNING *", values
```

A tabela e a whitelist são constantes do código, nunca vêm da requisição. Um
`ORDER BY {campo}` com campo vindo do usuário é injeção — mapeie para um
dicionário de valores permitidos.

### Interpolação de configuração é aceitável, de entrada não

`HOJE_LOCAL_SQL` em [app/utils/datas.py](backend/app/utils/datas.py) interpola o
fuso dentro do SQL. É seguro porque vem de `settings`, definido no `.env` do
servidor — nunca de requisição. Se você interpolar algo, o valor precisa ter essa
mesma origem, e o comentário deve dizer isso.

---

## 3. Segredos e credenciais

- `.env` **não é versionado** (o `.gitignore` cobre `.env*`, exceto o `.env.example`). Nunca remova essa regra, nunca faça `git add -f .env`.
- `.env.example` leva apenas nomes de variáveis e valores falsos. Nunca um segredo real.
- Credencial **nunca** aparece em log, mensagem de erro, resposta de API, commit, print de tela, chamado de suporte ou conversa com IA. Token colado em chat é token queimado — trate como vazado e rotacione.
- Segredo no frontend não existe: tudo que vai para o navegador é público. Chave de API de terceiro fica no backend, que faz a chamada por procuração. Só chaves marcadas como *publishable* pelo próprio fornecedor podem ir ao cliente.
- Ao suspeitar de exposição, **rotacione primeiro, investigue depois**. Rotação é barata; vazamento não.

Segredos em uso hoje: `SECRET_KEY` (assina os JWT), `DATABASE_URL`, credenciais
Mercado Livre, Mercado Pago (incluindo o *webhook secret*), MinIO e Evolution API.
Trocar a `SECRET_KEY` desloga todo mundo — é o botão de emergência se houver
suspeita de token comprometido.

---

## 4. Autenticação e sessão

- Toda rota nova é **privada por padrão**. Se ela não tem `Depends(get_current_user)` (ou o equivalente da loja), justifique no código por que é pública.
- Rotas da loja usam escopo separado (`scope: "store_customer"`). Um token de cliente da loja **não pode** acessar rota de CRM. Ao criar rota, confirme qual dependência de autenticação se aplica.
- Endpoint público que recebe identificador precisa de token não adivinhável. `public_token` aleatório é aceitável; `pedido/123` sequencial não é — permite varrer os pedidos dos outros trocando o número.
- Login, recuperação de senha e qualquer rota que confirme existência de conta precisam de **rate limit** e de resposta genérica ("se o e-mail existir, enviaremos instruções"). Mensagem diferente para e-mail inexistente entrega a lista de clientes.
- Senha só com hash forte (bcrypt/argon2), nunca reversível, nunca logada, nem em debug.

---

## 5. Dados pessoais (LGPD)

O que nos torna processáveis não é o invasor genial: é o dado que estava exposto
sem precisar estar.

- **Minimização na resposta.** Uma listagem de produtos não precisa devolver o CPF do cliente que comprou. Selecione colunas explicitamente; evite `SELECT *` em rota que responde ao cliente.
- **Nunca logue dado pessoal.** Nem CPF, nem endereço, nem telefone, nem e-mail, nem conteúdo de mensagem. Log é copiado, exportado e lido por gente que não deveria ver aquilo. Logue o `id`, não a pessoa.
- **Não exponha o que o usuário não pode ver.** Toda consulta por `id` de recurso de cliente precisa filtrar também pelo dono (`WHERE id = $1 AND cliente_id = $2`). Sem isso, trocar o id na URL lê o pedido do vizinho — é a falha mais comum e mais barata de explorar.
- **Exportações (CSV, PDF, relatório)** são vazamento em potencial: exigem permissão explícita e devem registrar quem exportou o quê.
- Ao apagar cliente, apague de verdade ou anonimize; não basta marcar `ativo = false` se o titular pediu exclusão.

---

## 6. Pagamento e cartão

**Nunca receba, trafegue, logue ou armazene número de cartão, CVV ou validade.**
Nem "temporariamente", nem "só para debug", nem em campo de texto livre. O
momento em que o PAN toca nosso servidor, entramos no escopo PCI-DSS — e não
temos estrutura para isso.

O caminho correto é o que a integração Mercado Pago já usa: o cartão é
tokenizado **no navegador do cliente pelo SDK do provedor**, e o backend recebe
apenas um token de uso único. Se algum código passar a receber `card_number`,
está errado, independentemente do motivo.

Além disso:

- **Status de pagamento só muda por webhook validado ou consulta à API do provedor.** Nunca porque o frontend informou que "deu certo". Um POST forjado de `status: approved` não pode liberar mercadoria.
- O webhook do Mercado Pago valida assinatura HMAC em [mp_webhooks.py](backend/app/api/mp_webhooks.py) — mantenha essa validação em qualquer webhook novo, incluindo janela de tempo contra replay.
- Webhook precisa ser **idempotente**: o mesmo evento chega duas vezes, e não pode gerar dois créditos.
- O valor cobrado é sempre o calculado pelo servidor, conferido contra o valor que o provedor confirma. Se divergir, não libere: registre e alerte.

---

## 7. Erros, logs e superfície de informação

- A resposta de erro para o cliente é genérica. O handler global em [main.py](backend/app/main.py) já faz isso (`"Erro interno do servidor"`) — não o contorne devolvendo `str(e)` ao usuário. Stack trace, nome de tabela e query na resposta são mapa para o invasor.
- Detalhe técnico vai para o log do servidor, com identificador para correlacionar.
- Não deixe `/docs` do FastAPI aberto em produção sem autenticação: ele lista todas as rotas e schemas.
- CORS é lista fechada de origens ([main.py](backend/app/main.py)). Nunca use `allow_origins=["*"]` com `allow_credentials=True` — além de o navegador bloquear, é convite a CSRF.

---

## 8. Uploads e arquivos

- Valide **tipo real** (magic bytes), não só a extensão ou o `Content-Type`, que o cliente controla.
- Gere o nome do arquivo no servidor; nunca use o nome enviado para montar caminho (`../../` é travessia de diretório).
- Limite tamanho no servidor.
- Bucket público serve imagem de produto. Documento, nota fiscal e comprovante vão em bucket privado com URL assinada de validade curta.
- Nunca sirva arquivo enviado por usuário a partir do mesmo domínio da aplicação sem `Content-Disposition: attachment` — um SVG ou HTML malicioso executa script no seu domínio.

---

## 9. Checklist antes de finalizar qualquer alteração

Responda honestamente. Um "não sei" conta como "não".

- [ ] A rota nova exige autenticação, ou há justificativa escrita para ser pública?
- [ ] Todo valor monetário foi calculado no servidor a partir do banco?
- [ ] Toda query usa `$1`, e todo identificador dinâmico passa por whitelist?
- [ ] A consulta de recurso por id filtra também pelo dono?
- [ ] A resposta devolve só os campos necessários — sem CPF, telefone ou e-mail sobrando?
- [ ] Nenhum segredo, token ou dado pessoal entrou em log ou em mensagem de erro?
- [ ] Mudança em pagamento: o status continua vindo de webhook validado?
- [ ] `.env` continua fora do commit?

---

## 10. Dívidas conhecidas

Registradas aqui de propósito: quem for mexer nessas áreas deve corrigir, não
replicar.

| Onde | Problema | Risco |
|---|---|---|
| ~~store_checkout.py — frete vindo do cliente~~ | **Corrigido**: o preço agora é lido da cotação registrada em `store_frete_cotacoes`; o cliente informa só qual opção escolheu. Resta remover o modo de transição que ainda aceita `shipping_price` quando o pedido chega sem `shipping_quote_id` (navegadores com a loja antiga em cache) | — |
| JWT | Permissões viajam dentro do token | Permissão revogada continua valendo até o token expirar |
| [store.py](backend/app/api/store.py) — `_is_mobile_store_client` | O bypass do Turnstile depende de User-Agent e do header `x-app-client`, ambos controlados pelo cliente | Qualquer um pula o CAPTCHA mandando um cabeçalho. Mitigado com rate limit no login, mas o bypass em si continua: o app precisa de uma credencial de verdade (chave assinada), não de um header |
| Rotas públicas da loja | Nem toda listagem foi auditada quanto a campos devolvidos | Possível exposição de dado pessoal em resposta pública |

Ao corrigir um item, remova a linha e descreva a correção no commit.

---

## 11. Se houver vazamento

Ordem de execução, sem improviso:

1. **Contenha**: rotacione as credenciais afetadas e invalide as sessões (trocar `SECRET_KEY` desloga todos).
2. **Preserve**: não apague log nem container; é a única evidência do que aconteceu.
3. **Determine o alcance**: quais dados, de quantos titulares, em que período.
4. **Comunique**: a LGPD exige informar a ANPD e os titulares em prazo razoável quando há risco relevante. Ocultar agrava a responsabilidade — a omissão costuma custar mais caro que o incidente.
5. **Corrija a causa** e registre aqui como dívida resolvida.

Quem descobre o problema não é culpado por ele. Esconder, sim.
