/**
 * Pre-warm de chunks + dados após login bem-sucedido.
 *
 * Roda em background (fire-and-forget) — NÃO bloqueia o navigate("/").
 * Quando o usuário chega na primeira tela, o JS do bundle e os dados
 * já estão (ou estão prestes a estar) em cache.
 *
 * Custo: 5-7 requests paralelos extras logo após o login. Vale a pena
 * porque o usuário já paga essa latência ao abrir a 1ª tela; aqui
 * antecipamos durante o "tempo morto" do redirect.
 */
import type { QueryClient } from "@tanstack/react-query"
import {
  estoqueApi,
  configuracoesApi,
  localizacoesApi,
  mercadolivreApi,
  sucatasApi,
  dashboardApi,
} from "@/lib/api"
import { STATIC_KEYS } from "@/hooks/useStaticResources"
import { prefetchRoute } from "@/lib/prefetchRoute"
import { fetchDashboardStatsHelper } from "@/lib/dashboardHelper"

// staleTime padrão pra recursos estáticos (mesmo do useStaticResources)
const STATIC_STALE = 5 * 60_000

// Dashboard usa staleTime 60s no Dashboard.tsx — replicamos aqui.
const DASHBOARD_STALE = 60_000

/** Janela do dashboard pra pre-fetchear (mesmo default da tela). */
function getDashboardDefaultRange() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30) // padrão "mes" no Dashboard
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return { start: fmt(start), end: fmt(end) }
}

export function warmupAfterLogin(queryClient: QueryClient) {
  // 1) Pre-load JS chunks das rotas mais prováveis (idle callback + dynamic import)
  //    Browser pode baixar em paralelo a stuff de auth + render do Layout.
  prefetchRoute("/")              // Dashboard
  prefetchRoute("/produtos")      // Estoque
  prefetchRoute("/atendimento")   // WhatsApp

  // 2) Pre-fetch DADOS via TanStack Query (ficam cacheados)
  //    Tudo Promise.allSettled — falha em um não atrapalha os outros.
  void Promise.allSettled([
    // Static resources (cobertos depois pelo StaticResourcesProvider, mas
    // pre-fetchamos AGORA pra eliminar o gap entre login e Layout mount)
    queryClient.prefetchQuery({
      queryKey: STATIC_KEYS.categorias,
      queryFn: () => configuracoesApi.listarCategorias({ limit: 5000 }),
      staleTime: STATIC_STALE,
    }),
    queryClient.prefetchQuery({
      queryKey: STATIC_KEYS.locais,
      queryFn: () => localizacoesApi.listar({ limit: 2000 }),
      staleTime: STATIC_STALE,
    }),
    queryClient.prefetchQuery({
      queryKey: STATIC_KEYS.marcas,
      queryFn: () => configuracoesApi.listarMarcas(),
      staleTime: STATIC_STALE,
    }),
    queryClient.prefetchQuery({
      queryKey: STATIC_KEYS.modelos,
      queryFn: () => configuracoesApi.listarModelos(),
      staleTime: STATIC_STALE,
    }),
    // veiculos_master saiu do prefetch: o Banco de Veículos deixou de ser fonte
    // de compatibilidade e sobrou um consumidor só (enriquecer 'Importar Lista').
    // Não vale baixar a tabela inteira em todo login por causa dele.
    queryClient.prefetchQuery({
      queryKey: STATIC_KEYS.meliAccounts,
      queryFn: () => mercadolivreApi.listarContas(),
      staleTime: STATIC_STALE,
    }),
    queryClient.prefetchQuery({
      queryKey: STATIC_KEYS.sucatas,
      queryFn: () => sucatasApi.listar({ limit: 4000 }),
      staleTime: STATIC_STALE,
    }),

    // Dashboard pack — período padrão "mes"
    queryClient.prefetchQuery({
      queryKey: ['dashboard', 'mes', null, null],
      queryFn: () => fetchDashboardStatsHelper('mes', '', ''),
      staleTime: DASHBOARD_STALE,
    }),

    // Produtos painel — primeira página com filtros default (estoque positivo)
    // Replica os defaults do useState em Produtos.tsx
    queryClient.prefetchQuery({
      queryKey: [
        'produtos-painel',
        // chave precisa bater com o useMemo de Produtos.tsx; usamos um
        // approximation com filtros padrão. Se não bater 100%, refetch
        // acontece transparente — pre-warm continua valendo via dedup.
        { estoque: 'positivo', ordenar: 'created_at', direcao: 'desc' },
        1,
        12,
      ] as const,
      queryFn: () => estoqueApi.listarProdutos({
        painel: true,
        estoque: 'positivo',
        ordenar: 'created_at',
        direcao: 'desc',
        limit: 12,
        offset: 0,
      }),
      staleTime: 60_000,
    }),
  ]).catch(() => {
    // Silencioso — pre-warm é otimização, não pode quebrar nada
  })
}
