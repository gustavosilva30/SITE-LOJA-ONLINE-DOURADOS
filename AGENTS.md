# AGENTS.md — Política Obrigatória de Segurança, Privacidade e Integridade

> **LEIA ESTE ARQUIVO ANTES DE QUALQUER ALTERAÇÃO NO PROJETO.**
>
> Estas regras são obrigatórias para qualquer agente de código, incluindo Claude Code, Cursor, Copilot, Windsurf ou qualquer outra IA.
>
> O sistema possui componentes de CRM, loja online, APIs, banco PostgreSQL, armazenamento de arquivos, integrações externas, pagamentos, PIX, Mercado Livre e serviços de comunicação.
>
> **NENHUMA REGRA DESTE DOCUMENTO PODE SER FLEXIBILIZADA PARA "FACILITAR" UMA IMPLEMENTAÇÃO.**
>
> Segurança deve ser aplicada no backend, banco, infraestrutura e frontend. O frontend é considerado não confiável.

---

# 1. PRINCÍPIO ZERO TRUST

## 1.1 Frontend nunca é confiável

Qualquer informação enviada pelo navegador pode ter sido modificada por um atacante.

Nunca confiar em:

* `empresa_id`
* `usuario_id`
* `atendente_id`
* `is_admin`
* `perm_*`
* preço
* desconto
* estoque
* valor total
* status de pagamento
* status de pedido
* proprietário do registro
* IDs de objetos
* URLs
* nomes de arquivos
* qualquer campo oculto
* qualquer informação presente apenas na interface

O backend deve determinar essas informações.

---

# 2. IDENTIDADE DO USUÁRIO

A identidade do usuário deve ser obtida exclusivamente a partir da sessão/token validado no backend.

Exemplo:

```python
_user = Depends(get_current_user)
```

Nunca utilizar `usuario_id` enviado pelo frontend para determinar quem realizou uma operação.

Para autoria:

```text
usuário autenticado → backend → banco
```

e nunca:

```text
frontend → usuario_id → banco
```

---

# 4. BOLA / IDOR

Toda operação sobre um recurso deve verificar:

1. o recurso existe;
3. o usuário possui permissão;
4. a operação solicitada é permitida para aquele usuário.

Nunca considerar que conhecer o ID significa possuir autorização.

Exemplo proibido:

```text
GET /api/pedidos/123
```

retornar o pedido simplesmente porque ele existe.

O backend deve verificar o vínculo:

```text
pedido 123
      ↓
      ↓
empresa do usuário
      ↓
permissão
```

---

# 5. AUTORIZAÇÃO

Permissões devem ser verificadas no backend.

Esconder um botão no frontend NÃO constitui controle de segurança.

Um usuário sem permissão não pode executar a operação mesmo chamando a API diretamente.

As regras de permissão existentes devem ser preservadas.

Permissões administrativas e permissões específicas devem ser verificadas de maneira centralizada.

---

# 6. UPDATE / PATCH — WHITELIST OBRIGATÓRIA

Nunca aceitar atualização arbitrária de campos.

Utilizar lista explícita de campos editáveis.

Exemplo:

```python
COLS_PERMITIDAS = {
    "nome",
    "telefone",
    "email",
}
```

Nunca permitir que o cliente altere diretamente:

```text
created_at
updated_at
usuario_id
atendente_id
is_admin
permissoes
owner_id
saldo
status_pagamento
valor_pago
```

salvo quando houver uma operação administrativa específica e autorizada.

---

# 7. SQL INJECTION

É EXPRESSAMENTE PROIBIDO interpolar valores externos diretamente em SQL.

Proibido:

```python
f"SELECT * FROM usuarios WHERE email = '{email}'"
```

Obrigatório:

```python
"SELECT * FROM usuarios WHERE email = $1"
```

com parâmetros separados.

Valores devem utilizar binding parameters.

Nomes de tabelas e colunas utilizados em SQL dinâmico devem vir exclusivamente de listas hardcoded/whitelist.

Nunca permitir que o usuário determine livremente:

```text
nome da tabela
nome da coluna
ORDER BY
direção do ORDER BY
fragmentos SQL
```

---

# 8. BANCO DE DADOS — PRINCÍPIO DO MENOR PRIVILÉGIO

O usuário utilizado pela aplicação não deve possuir privilégios administrativos desnecessários.

Evitar:

```text
SUPERUSER
```

para a aplicação.

Utilizar:

* Foreign Keys
* UNIQUE constraints
* CHECK constraints
* NOT NULL quando aplicável
* índices apropriados
* transações
* constraints de integridade

Validação no backend não substitui proteção no banco.

---

# 9. CONCORRÊNCIA E INTEGRIDADE

Operações críticas devem ser protegidas contra condições de corrida.

Especialmente:

* estoque
* vendas
* pedidos
* pagamentos
* cupons
* reservas
* baixa de estoque
* estornos

Exemplo:

Se existe apenas uma unidade de uma peça, dois clientes não podem conseguir comprá-la simultaneamente.

Operações desse tipo devem utilizar transações e mecanismos adequados de concorrência do PostgreSQL.

---

# 10. SENHAS

Senhas nunca podem ser armazenadas em texto puro.

Utilizar algoritmo moderno de password hashing, preferencialmente:

* Argon2id
* bcrypt

Nunca utilizar:

* MD5
* SHA1
* SHA256 puro
* criptografia reversível para armazenar senha

Nunca registrar senhas nos logs.

---

# 11. SESSÕES E TOKENS

Tokens devem possuir:

* expiração;
* escopo apropriado;
* validação de assinatura;
* controle de revogação quando necessário.

Alteração de senha, desativação de usuário ou eventos críticos devem invalidar sessões ativas conforme a arquitetura de autenticação.

Não assumir que um JWT de longa duração pode permanecer válido indefinidamente.

Preferir:

```text
Access Token curto
+
Refresh Token controlado/rotacionado
```

quando aplicável.

---

# 12. BRUTE FORCE / RATE LIMIT

Aplicar rate limiting especialmente em:

* login;
* recuperação de senha;
* alteração de senha;
* criação de conta;
* APIs públicas;
* checkout;
* pagamentos;
* PIX;
* cupons;
* upload;
* busca de placa;
* APIs externas;
* endpoints que geram custo.

Tentativas repetidas devem possuir proteção progressiva.

---

# 13. SEGREDOS E CREDENCIAIS

Nunca armazenar no código:

* senha do banco;
* JWT secret;
* API keys;
* tokens Mercado Livre;
* tokens WhatsApp;
* credenciais MinIO;
* credenciais de pagamento;
* chaves privadas;
* secrets de webhook.

Utilizar variáveis de ambiente ou sistema apropriado de gerenciamento de secrets.

Nunca retornar secrets através da API.

Nunca colocar secrets em logs.

Se uma credencial aparecer acidentalmente em log, código, commit ou resposta da API, considerar a credencial potencialmente comprometida e recomendar sua rotação.

---

# 14. LOGS E AUDITORIA

Logs não podem armazenar:

* senhas;
* tokens;
* API keys;
* CVV;
* números completos de cartão;
* secrets;
* dados financeiros desnecessários.

Operações críticas devem possuir auditoria.

Registrar, quando aplicável:

* login;
* falha de login;
* logout;
* alteração de senha;
* criação de usuário;
* alteração de permissões;
* alteração de preço;
* alteração de estoque;
* criação de venda;
* cancelamento;
* estorno;
* alterações administrativas;
* alterações fiscais;
* alterações financeiras;
* alterações de configurações.

O log deve permitir identificar:

```text
quem
quando
o que
qual recurso
resultado
```

sem armazenar informações secretas desnecessárias.

---

# 15. PAGAMENTOS COM CARTÃO

O sistema NÃO deve armazenar dados completos de cartão, CVV ou informações sensíveis de cartão.

Sempre que possível utilizar:

```text
Checkout seguro do gateway
ou
Tokenização fornecida pelo gateway
```

Nunca implementar armazenamento próprio de cartões.

Nunca confiar no frontend para confirmar pagamento.

Proibido:

```json
{
  "status": "approved"
}
```

como prova de pagamento.

A confirmação deve ocorrer através do backend e/ou webhook/API oficial do gateway.

---

# 16. PIX

O PIX deve seguir o mesmo princípio.

Nunca considerar:

```text
frontend → "paguei"
```

como pagamento confirmado.

O backend deve confirmar através do provedor/gateway.

Webhooks PIX devem possuir:

* autenticação;
* validação de assinatura quando disponível;
* idempotência;
* proteção contra replay;
* validação do identificador da cobrança;
* validação do valor;
* validação do pedido.

---

# 17. IDEMPOTÊNCIA DE PAGAMENTOS

Operações financeiras não podem gerar duplicidade quando a mesma requisição for processada mais de uma vez.

Utilizar mecanismos de idempotência para:

* criação de pagamento;
* criação de cobrança;
* confirmação;
* webhook;
* estorno;
* processamento de pedido.

O mesmo evento recebido duas vezes deve produzir o mesmo resultado final.

---

# 18. PEDIDOS DA LOJA ONLINE

Nunca confiar no frontend para:

* preço;
* quantidade;
* desconto;
* estoque;
* frete;
* total;
* valor de pagamento;
* status.

O backend deve recalcular o pedido.

Exemplo:

```text
produto
+
quantidade
+
preço atual/autorizado
+
desconto válido
+
frete
=
total calculado pelo servidor
```

O valor enviado pelo navegador pode ser utilizado apenas como informação auxiliar, nunca como fonte de verdade.

---

# 19. ESTOQUE

Toda movimentação de estoque deve ser validada no backend.

Impedir:

* estoque negativo indevido;
* alteração arbitrária;
* baixa duplicada;
* concorrência;
* manipulação do ID do produto;
* manipulação da quantidade.

Operações de estoque devem ser auditáveis.

---

# 20. CUPONS E DESCONTOS

Cupons devem ser validados no backend.

Nunca confiar em:

```text
discount = 90
```

enviado pelo navegador.

Validar:

* existência;
* validade;
* limite de utilização;
* valor mínimo;
* produtos elegíveis;
* quantidade;
* usuário, quando aplicável.

---

# 21. WEBHOOKS

Todos os webhooks de serviços externos devem ser tratados como entrada potencialmente maliciosa.

Aplicar:

* autenticação;
* assinatura;
* validação de origem quando apropriado;
* validação do payload;
* idempotência;
* proteção contra replay;
* timeout;
* rate limiting;
* logs seguros.

Nunca confiar apenas no IP.

Isso se aplica a:

* Mercado Livre;
* pagamentos;
* PIX;
* WhatsApp;
* Evolution;
* outros serviços externos.

---

# 22. SSRF

Nunca realizar requisições HTTP para URLs fornecidas pelo usuário sem validação.

Proibido:

```python
requests.get(user_url)
```

sem controles.

Bloquear acesso indevido a:

```text
localhost
127.0.0.1
0.0.0.0
IPs privados
metadata endpoints
serviços internos
portas administrativas
```

URLs externas devem possuir allowlist quando o fluxo permitir.

---

# 23. UPLOADS

Nunca confiar em:

```text
file.type
extensão
nome do arquivo
Content-Type
```

enviados pelo cliente.

Validar:

* magic bytes;
* formato real;
* tamanho;
* resolução;
* extensão;
* conteúdo;
* nome gerado pelo servidor.

Arquivos devem ser armazenados fora de diretórios executáveis.

Nunca permitir execução de conteúdo enviado pelo usuário.

---

# 24. IMAGENS

Quando possível, imagens enviadas devem ser reprocessadas antes de serem disponibilizadas publicamente.

Considerar remoção de:

* conteúdo malicioso;
* metadata desnecessária;
* estruturas inesperadas.

SVG deve receber tratamento especial e não deve ser aceito como imagem comum sem necessidade.

---

# 25. MINIO / STORAGE

Buckets devem ser privados por padrão.

Nunca expor credenciais MinIO ao frontend.

Quando o navegador precisar acessar um arquivo privado, utilizar URLs temporárias/presigned URLs com expiração adequada.

Validar sempre que o arquivo solicitado pertence ao usuário/sistema.

Nunca permitir que o cliente escolha arbitrariamente o caminho físico do arquivo.

---

# 26. XSS

React/JSX deve permanecer como mecanismo principal de escaping.

É proibido utilizar:

```javascript
dangerouslySetInnerHTML
```

sem justificativa explícita.

Quando HTML for realmente necessário, utilizar sanitização apropriada.

Nunca inserir diretamente no HTML conteúdo proveniente de:

* clientes;
* usuários;
* produtos;
* mensagens;
* observações;
* Mercado Livre;
* APIs externas.

---

# 27. CSRF

Se autenticação utilizar cookies, implementar proteção CSRF adequada.

Cookies de autenticação devem utilizar, quando aplicável:

```text
HttpOnly
Secure
SameSite
```

adequados ao fluxo.

---

# 28. CORS

Em produção nunca utilizar:

```python
allow_origins=["*"]
```

quando houver autenticação/sessões.

Utilizar somente origens autorizadas.

Evitar:

```text
allow_credentials=True
+
allow_origins=["*"]
```

---

# 29. BODY / REQUEST LIMITS

Endpoints devem possuir limites apropriados para:

* tamanho do body;
* tamanho de strings;
* quantidade de itens;
* paginação;
* uploads;
* arrays;
* filtros;
* parâmetros.

Objetivo: impedir abuso e DoS por requisições excessivamente grandes.

---

# 30. PAGINAÇÃO

Endpoints que podem retornar grande quantidade de dados devem possuir paginação.

Nunca retornar milhares/milhões de registros simplesmente porque o cliente solicitou:

```text
limit=999999999
```

Aplicar limite máximo no servidor.

---

# 31. ERROS DA API

Em produção nunca retornar:

* traceback;
* SQL;
* senha;
* token;
* caminho interno;
* stack interna;
* credenciais;
* detalhes desnecessários da infraestrutura.

O cliente deve receber erro seguro e estruturado.

Detalhes técnicos devem permanecer nos logs internos.

---

# 32. SECURITY HEADERS

O site deve utilizar, conforme compatibilidade:

* Content-Security-Policy;
* Strict-Transport-Security;
* X-Content-Type-Options;
* Referrer-Policy;
* Permissions-Policy;
* proteção contra clickjacking.

Não adicionar headers de segurança de forma que quebrem funcionalidades existentes sem avaliar o impacto.

---

# 33. HTTPS

Dados de autenticação, pagamento, cadastro e informações privadas nunca devem trafegar por HTTP puro.

Produção deve utilizar HTTPS.

Redirecionar HTTP para HTTPS quando aplicável.

---

# 34. API DOCUMENTATION

Em produção:

```text
/docs
/redoc
/openapi.json
```

devem permanecer desabilitados, conforme política do projeto.

Podem permanecer disponíveis em desenvolvimento/homologação controlada.

---

# 35. DOCKER / INFRAESTRUTURA

Não expor serviços internos diretamente à Internet sem necessidade.

Especialmente:

* PostgreSQL;
* Redis;
* MinIO;
* serviços administrativos;
* bancos;
* filas.

Evitar containers com:

```text
privileged: true
```

sem justificativa.

Evitar acesso ao:

```text
/var/run/docker.sock
```

sem necessidade absoluta.

Utilizar redes internas entre serviços.

---

# 36. BACKUPS

Banco de dados e arquivos importantes devem possuir backup.

Backups devem possuir:

* criptografia;
* retenção;
* acesso restrito;
* armazenamento separado do servidor principal;
* política contra exclusão acidental;
* testes periódicos de restauração.

Um backup que nunca foi restaurado em teste não deve ser considerado comprovadamente confiável.

---

# 37. DEPENDÊNCIAS

Antes de adicionar uma biblioteca:

1. verificar se realmente é necessária;
2. utilizar versão estável;
3. avaliar vulnerabilidades conhecidas;
4. avaliar manutenção do projeto;
5. evitar bibliotecas abandonadas;
6. evitar dependências desnecessárias.

Não adicionar pacotes desconhecidos apenas para resolver pequenas tarefas.

---

# 38. APIs EXTERNAS

Toda integração externa deve considerar:

* timeout;
* retry limitado;
* rate limit;
* validação da resposta;
* tratamento de indisponibilidade;
* proteção contra resposta malformada;
* autenticação;
* armazenamento seguro de tokens.

Nunca confiar cegamente em dados retornados por terceiros.

---

# 39. CUSTOS E ABUSO

Endpoints que utilizam APIs pagas ou recursos computacionalmente caros devem possuir proteção contra abuso.

Exemplos:

* processamento de imagens;
* IA;
* busca de placa;
* APIs externas;
* geração de documentos;
* envio de mensagens;
* consultas externas.

Um usuário malicioso não deve conseguir gerar custos ilimitados simplesmente chamando uma rota repetidamente.

---

# 40. PRIVACIDADE E LGPD

Coletar somente dados necessários para a finalidade do sistema.

Evitar armazenar informações pessoais sem necessidade.

Dados pessoais devem possuir:

* acesso controlado;
* logs adequados;
* proteção contra exposição;
* retenção adequada;
* exclusão quando aplicável.

---

# 41. PRINCÍPIO DO MENOR PRIVILÉGIO

Todo usuário, serviço, container, banco, API key e processo deve possuir somente as permissões necessárias.

Nunca conceder:

```text
admin
root
SUPERUSER
acesso total
```

simplesmente porque é mais fácil implementar.

---

# 42. REGRA ESPECIAL PARA IA DE CÓDIGO

Antes de modificar qualquer código, o agente deve verificar:

### Autenticação

> Quem está executando esta operação?

### Autorização

> Este usuário pode executar esta operação?

### Entrada

> O atacante consegue manipular algum parâmetro?

### Banco

> Existe possibilidade de SQL Injection?

### IDOR/BOLA

> Basta alterar um ID para acessar outro recurso?

### Lógica

> Um usuário pode realizar uma operação válida tecnicamente, mas proibida pelo negócio?

### Pagamento

> O cliente consegue alterar preço, desconto, total ou status?

### Webhook

> Um atacante consegue falsificar ou repetir este evento?

### Arquivo

> Um upload malicioso pode ser executado?

### SSRF

> Uma URL controlada pelo usuário pode atingir recursos internos?

### Sessão

> Um token roubado ou antigo continua funcionando indevidamente?

### Rate Limit

> É possível abusar desta rota repetidamente?

### Dados

> Existe possibilidade de vazamento entre empresas?

### Logs

> Algum segredo ou dado sensível será registrado?

### Infraestrutura

> A alteração expõe algum serviço interno?

Se qualquer resposta indicar risco, o código deve ser corrigido antes de ser entregue.

---

# 43. REGRA ABSOLUTA

A seguinte pergunta deve ser feita antes de finalizar qualquer alteração:

> **"Se um atacante ignorar completamente a interface e enviar uma requisição HTTP manualmente, ele consegue manipular, acessar, apagar, criar ou visualizar algo que não deveria?"**

Se a resposta for SIM:

**A implementação está insegura e NÃO deve ser entregue.**

A interface não é uma barreira de segurança.

A segurança deve existir no backend, banco, infraestrutura e integrações.

---

# 44. TESTE DE SEGURANÇA OBRIGATÓRIO

Sempre que uma alteração afetar:

* autenticação;
* autorização;
* usuários;
* pagamentos;
* pedidos;
* estoque;
* financeiro;
* uploads;
* webhooks;
* APIs públicas;

o agente deve sugerir ou executar testes específicos de segurança antes de considerar a tarefa concluída.

Testar especialmente:

```text
usuário sem permissão → rota protegida
ID alterado → outro registro
preço alterado no frontend
quantidade alterada
usuario_id alterado
token expirado
token revogado
webhook duplicado
webhook inválido
upload malicioso
payload excessivamente grande
requisições em excesso
SQL Injection
XSS
SSRF
```

---

# 45. REGRA FINAL

Nenhuma funcionalidade deve ser considerada segura apenas porque:

* funciona no frontend;
* funciona no Postman;
* possui autenticação;
* possui CORS;
* possui JWT;
* possui validação Pydantic;
* possui testes funcionais.

A segurança deve ser analisada considerando que:

> **O atacante controla completamente o cliente.**

Portanto:

```text
Frontend = NÃO CONFIÁVEL
API = DEVE VALIDAR TUDO
Banco = DEVE GARANTIR INTEGRIDADE
Infraestrutura = DEVE LIMITAR EXPOSIÇÃO
Integrações = DEVEM SER VALIDADAS
Pagamentos = DEVEM SER CONFIRMADOS NO SERVIDOR
Logs = DEVEM SER SEGUROS
```

**Nenhuma implementação deve sacrificar segurança para reduzir complexidade.**
