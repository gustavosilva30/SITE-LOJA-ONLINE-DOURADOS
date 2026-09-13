import { useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  configuracoesApi,
  localizacoesApi,
  catalogoApi,
  mercadolivreApi,
  sucatasApi,
} from "@/lib/api"
import { useProdutosCache } from "@/store/produtosCache"

/**
 * Recursos "estáticos" do CRM — categorias, marcas, modelos, locais, sucatas, ML accounts.
 * São listas que mudam raramente (categoria nova talvez 1x/semana). Antes:
 *  - Cada `fetchStaticResources()` no mount do Produtos disparava 6 requests
 *  - Sem TTL: ficavam em memória até reload da página
 *
 * Agora (TanStack Query):
 *  - Cache compartilhado entre rotas, com staleTime de 5min
 *  - Stale-while-revalidate: UI responde com dados em cache, refetch silencioso em background
 *  - Dedup automático: se 2 componentes pedirem ao mesmo tempo, só faz 1 request
 *  - Sincroniza no Zustand para manter compat com leituras imperativas (`useProdutosCache.getState()`)
 *
 * Use o `<StaticResourcesProvider/>` montado no Layout pra disparar uma vez por sessão.
 * Use `useStaticResources()` em componentes que precisam dos dados como dependência reativa.
 */

const STALE = 5 * 60_000      // 5 min
const GC = 30 * 60_000        // 30 min na memória

export const STATIC_KEYS = {
  categorias: ["static", "categorias"] as const,
  locais: ["static", "locais"] as const,
  marcas: ["static", "marcas-standard"] as const,
  modelos: ["static", "modelos-standard"] as const,
  veiculosMaster: ["static", "veiculos-master"] as const,
  meliAccounts: ["static", "meli-accounts"] as const,
  sucatas: ["static", "sucatas"] as const,
}

/** Hook que busca + sincroniza com Zustand. Pode ser usado em qualquer componente. */
export function useStaticResources() {
  const setStore = useProdutosCache.setState

  const categoriasQ = useQuery({
    queryKey: STATIC_KEYS.categorias,
    queryFn: () => configuracoesApi.listarCategorias({ limit: 5000 }),
    staleTime: STALE, gcTime: GC,
  })
  const locaisQ = useQuery({
    queryKey: STATIC_KEYS.locais,
    queryFn: () => localizacoesApi.listar({ limit: 2000 }),
    staleTime: STALE, gcTime: GC,
  })
  const marcasQ = useQuery({
    queryKey: STATIC_KEYS.marcas,
    queryFn: () => configuracoesApi.listarMarcas(),
    staleTime: STALE, gcTime: GC,
  })
  const modelosQ = useQuery({
    queryKey: STATIC_KEYS.modelos,
    queryFn: () => configuracoesApi.listarModelos(),
    staleTime: STALE, gcTime: GC,
  })
  const masterQ = useQuery({
    queryKey: STATIC_KEYS.veiculosMaster,
    queryFn: () => catalogoApi.listarVeiculosMaster(),
    staleTime: STALE, gcTime: GC,
  })
  const meliQ = useQuery({
    queryKey: STATIC_KEYS.meliAccounts,
    queryFn: () => mercadolivreApi.listarContas(),
    staleTime: STALE, gcTime: GC,
  })
  const sucatasQ = useQuery({
    queryKey: STATIC_KEYS.sucatas,
    queryFn: () => sucatasApi.listar({ limit: 4000 }),
    staleTime: STALE, gcTime: GC,
  })

  // Sincroniza com Zustand store (mantém compat com leituras imperativas existentes)
  useEffect(() => {
    if (Array.isArray(categoriasQ.data)) {
      const sorted = [...categoriasQ.data].sort((a: any, b: any) =>
        String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR")
      )
      setStore({ categorias: sorted })
    }
  }, [categoriasQ.data, setStore])

  useEffect(() => {
    if (Array.isArray(locaisQ.data)) setStore({ locais: locaisQ.data })
  }, [locaisQ.data, setStore])

  useEffect(() => {
    if (Array.isArray(marcasQ.data)) setStore({ marcasStandard: marcasQ.data })
  }, [marcasQ.data, setStore])

  useEffect(() => {
    if (Array.isArray(modelosQ.data)) setStore({ modelosStandard: modelosQ.data })
  }, [modelosQ.data, setStore])

  useEffect(() => {
    if (Array.isArray(masterQ.data)) setStore({ masterVehicles: masterQ.data })
  }, [masterQ.data, setStore])

  useEffect(() => {
    if (Array.isArray(meliQ.data)) setStore({ meliAccounts: meliQ.data })
  }, [meliQ.data, setStore])

  useEffect(() => {
    const data: any = sucatasQ.data
    const arr = Array.isArray(data) ? data : data?.items
    if (Array.isArray(arr)) setStore({ sucatas: arr })
  }, [sucatasQ.data, setStore])

  return {
    categorias: categoriasQ,
    locais: locaisQ,
    marcas: marcasQ,
    modelos: modelosQ,
    veiculosMaster: masterQ,
    meliAccounts: meliQ,
    sucatas: sucatasQ,
    isLoading:
      categoriasQ.isLoading || locaisQ.isLoading || marcasQ.isLoading ||
      modelosQ.isLoading || masterQ.isLoading || meliQ.isLoading || sucatasQ.isLoading,
  }
}

/** Helpers para invalidar quando o usuário cria/edita um recurso desse tipo. */
export function useInvalidateStaticResource() {
  const queryClient = useQueryClient()
  return {
    invalidateCategorias: () => queryClient.invalidateQueries({ queryKey: STATIC_KEYS.categorias }),
    invalidateLocais: () => queryClient.invalidateQueries({ queryKey: STATIC_KEYS.locais }),
    invalidateMarcas: () => queryClient.invalidateQueries({ queryKey: STATIC_KEYS.marcas }),
    invalidateModelos: () => queryClient.invalidateQueries({ queryKey: STATIC_KEYS.modelos }),
    invalidateVeiculosMaster: () => queryClient.invalidateQueries({ queryKey: STATIC_KEYS.veiculosMaster }),
    invalidateMeliAccounts: () => queryClient.invalidateQueries({ queryKey: STATIC_KEYS.meliAccounts }),
    invalidateSucatas: () => queryClient.invalidateQueries({ queryKey: STATIC_KEYS.sucatas }),
    invalidateAll: () => queryClient.invalidateQueries({ queryKey: ["static"] }),
  }
}

/**
 * Componente "loader" — monta no Layout para garantir que os recursos
 * sejam puxados uma vez no boot da sessão (e refetched automaticamente
 * quando ficarem stale). Não renderiza nada.
 */
export function StaticResourcesProvider() {
  useStaticResources()
  return null
}
