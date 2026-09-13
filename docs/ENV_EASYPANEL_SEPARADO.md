# Variáveis de ambiente (Easypanel) — Dourados

**Não commite arquivos `.env` com chaves reais.** Use o painel do Easypanel ou um gestor de secrets.

Há **dois** contextos:

1. **Serviço do backend Node** — variáveis **sem** prefixo `VITE_` (exceto se o seu deploy injetar tudo no mesmo container; o normal é só backend aqui).
2. **Build do frontend** (Vite) — só variáveis **`VITE_*`**. Elas são **fixadas no `npm run build`**; mudar no backend **não** atualiza o site.

---

## 1) Backend (Node / Express)

Cole no serviço que roda `PORT=5000` e expõe `https://api.douradosap.com.br`.

```env
PORT=5000
NODE_ENV=production

SUPABASE_URL="https://yxiozmjnjivkuzrsnfvo.supabase.co"
SUPABASE_ANON_KEY="COLE_AQUI_SUA_ANON_KEY_DO_SUPABASE"
SUPABASE_SERVICE_ROLE_KEY="COLE_AQUI_SUA_SERVICE_ROLE_KEY_DO_SUPABASE"

# WhatsApp Cloud API (Meta) — preencher quando a integração oficial estiver no código
# WHATSAPP_PHONE_NUMBER_ID=""
# WHATSAPP_ACCESS_TOKEN=""
# META_APP_SECRET=""
# WHATSAPP_VERIFY_TOKEN=""

WEBHOOK_URL="https://api.douradosap.com.br/webhook"

MERCADOPAGO_ACCESS_TOKEN="COLE_AQUI"
MERCADOPAGO_WEBHOOK_SECRET="COLE_AQUI"

ML_APP_ID="COLE_AQUI"
ML_CLIENT_SECRET="COLE_AQUI"
ML_REDIRECT_URI="https://api.douradosap.com.br/ml/callback"

IA_FUNDO_BASE_URL="http://api-ia-fundo:5000"
```

---

## 2) Build do frontend (Vite)

No serviço que executa `npm run build` para o site `douradosap.com.br`:

```env
VITE_SUPABASE_URL="https://yxiozmjnjivkuzrsnfvo.supabase.co"
VITE_SUPABASE_ANON_KEY="COLE_AQUI_MESMA_ANON_KEY_DO_SUPABASE"

VITE_APP_URL="https://douradosap.com.br"
VITE_API_URL="https://api.douradosap.com.br"

VITE_MERCADOPAGO_PUBLIC_KEY="COLE_AQUI_SUA_CHAVE_PUBLICA_MP"
```

---

## 3) API Python (`api-ia-fundo`)

Normalmente **só** precisa subir o container; o backend chama por rede Docker (`IA_FUNDO_BASE_URL`).

**CPU alta / picos:** o modelo BiRefNet é pesado; o custo vem sobretudo do **tamanho de inferência**, não do JPEG. Por padrão o código usa **512px em CPU** e **1024px em GPU**. Opcional:

```env
# 512, 768 ou 1024 (menor = menos CPU e pico mais baixo)
IA_INFERENCE_SIZE=512

# 1 = desliga filtro de nitidez (economiza um pouco)
IA_DISABLE_UNSHARP=1

# Qualidade do arquivo final (75–98); impacto no CPU é pequeno
JPEG_QUALITY=90

HF_TOKEN=
```

---

## Checklist

- [ ] `VITE_API_URL` definida **no build do front** (evita `Failed to fetch` para `localhost`).
- [ ] Backend com `IA_FUNDO_BASE_URL=http://api-ia-fundo:5000` (nome do serviço igual ao do Easypanel).
- [ ] CORS no API já está aberto no projeto (`cors()` no Express).

---

## 4) Recomendações de Performance e Limites de Recursos

Para estabilidade em produção (evitar travamentos à tarde), aplique as seguintes configurações na infraestrutura:

### Limites de Container (Easypanel)
- **`vision-worker` e `api-ia-fundo`**: Limitar CPU a no máximo 1-2 vCPUs e RAM a 1GB-2GB cada. Isso impede que a remoção de fundo e inferência CLIP "roubem" todo o processamento da máquina durante o horário de pico de uploads.
- **Backend Node / Python**: Não restringir excessivamente (ou reservar CPU) para estes serviços não serem sufocados pelos serviços de IA.

### Configuração de Execução do `vision-worker`
Para que o `vision-worker` processe e grave corretamente os embeddings e dados extraídos no banco de dados real:
1. **Comando de Início**: No painel do Easypanel, na aba **Advanced / Avançado** do serviço `vision-worker`, o campo **Comando** (Command) deve ficar **vazio** (usando o padrão do Dockerfile) ou ser definido explicitamente como `./start.sh`. **NÃO** deve conter `python -m app.autovision.worker` (que é apenas para testes standalone).
2. **Variáveis de Ambiente**: Certifique-se de que a variável de ambiente `APP_ROLE=worker` está configurada no serviço `vision-worker`. Isso direciona o entrypoint a inicializar apenas o Fundo-IA e o AutoVision com um pool de banco real.

### PostgreSQL
- **`shared_buffers`**: Recomendado definir para cerca de 25% da RAM total da VPS (se dedicada ao DB, ou a RAM reservada ao container Postgres).
- **`effective_cache_size`**: Recomendado entre 50% e 75% da RAM da VPS.
- **`work_mem`**: Sugerido pelo menos 16MB para operações complexas.
- Habilitar `pg_stat_statements` no servidor para observabilidade (ver [OBSERVABILIDADE.md](./OBSERVABILIDADE.md)).
