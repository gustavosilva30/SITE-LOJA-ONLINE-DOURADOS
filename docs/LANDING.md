# Landing pública (`/site`)

Página vitrine inspirada em loja de auto peças: hero em carrossel, categorias, destaques, newsletter, rodapé, WhatsApp flutuante e banner de cookies.

## Rotas

| Caminho | Descrição |
|--------|-----------|
| `/site` | Landing pública (sem login no CRM) |
| `/admin/marketing` | CRM — edição de slides e banners (gestores / `perm_config`) |

## Variáveis de ambiente (frontend)

| Variável | Uso |
|----------|-----|
| `VITE_API_URL` | URL do backend — necessária para listar produtos em destaque na landing |
| `VITE_WHATSAPP_CONTACT` | Número do WhatsApp (só dígitos, com DDI 55…) para o botão flutuante |
| `VITE_GOOGLE_MAPS_EMBED_URL` | (Opcional) URL do `src` do iframe: no Google Maps → **Partilhar** → **Incorporar mapa** → copiar o link do embed. Melhora o pin com nome da loja. |
| `VITE_GOOGLE_MAPS_PLACE_URL` | (Opcional) Link direto para a ficha do estabelecimento no Google (substitui a pesquisa por endereço). |

Ver também `.env.example`.

### Mapa na landing

A secção **Onde estamos** usa um iframe do Google Maps. Por defeito são usadas as coordenadas em `src/lib/storeLocation.ts`. Para o mapa oficial com a ficha “Dourados Auto Peças”, abre o local no Google Maps → Partilhar → Incorporar mapa → copia só o URL do `src` do iframe para `VITE_GOOGLE_MAPS_EMBED_URL` e faz redeploy.

## Supabase

1. Aplicar a migração `supabase/migrations/20260322120000_landing_marketing.sql` (tabelas `landing_slides`, `landing_promo_tiles`, `landing_newsletter_leads`, RLS e bucket `landing`).
2. Aplicar também `supabase/migrations/20260323120000_landing_slides_product_type.sql` para colunas `slide_type` e `produto_id` (slides como **imagem** ou **produto da loja**).
3. No CRM autenticado, em **Marketing (site)**, enviar imagens para o bucket `landing` (política `authenticated`).

O carrossel do topo aceita **até 6** itens: cada um pode ser só imagem ou um **produto** (UUID ou slug publicado na loja).

### Categorias na landing (dois blocos)

Migração: `supabase/migrations/20260324120000_landing_marketing_categories.sql` (tabelas `landing_marketing_category_slots` e `landing_marketing_config`).

No CRM → **Marketing (site)** → separador **Categorias na landing**:

- **Bloco 1** — grelha após a faixa de confiança (título editável, ex. “Departamentos”). Se não escolheres nenhuma categoria aqui, o site usa **automaticamente** as primeiras 8 categorias (ordem alfabética), como antes.
- **Bloco 2** — grelha **abaixo do mapa** “Onde estamos” (título editável). Só aparece se tiveres pelo menos uma categoria neste bloco.

Até **12** categorias por bloco.

## Domínio `www.autopecasdourados.com.br` (Vercel)

Quando for o momento de ligar o domínio:

1. No projeto Vercel → **Settings → Domains** → adicionar `www.autopecasdourados.com.br` (e opcionalmente `autopecasdourados.com.br` com redirect para `www`).
2. Configurar os registos DNS indicados pela Vercel (geralmente CNAME `www` → `cname.vercel-dns.com` ou equivalente).
3. Garantir no build de produção: `VITE_API_URL` apontando para a API pública correta.
4. **Opcional:** em **Redirects** da Vercel, redirecionar `/` → `/site` só para esse domínio, se quiser que a raiz abra a vitrine em vez do app CRM (o CRM continua em outro host ou subdomínio, ex. `app.`).

O código não depende do nome do domínio; só precisa de HTTPS e variáveis corretas no deploy.
