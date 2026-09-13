import { create } from "zustand"
import {
  estoqueApi,
  configuracoesApi,
  localizacoesApi,
  catalogoApi,
  mercadolivreApi,
  sucatasApi,
} from "@/lib/api"

interface ProdutosCacheStore {
  items: any[]
  total: number
  loading: boolean
  lastFetched: number | null
  
  // Recursos Estáticos
  categorias: any[]
  locais: any[]
  marcasStandard: any[]
  modelosStandard: any[]
  masterVehicles: any[]
  meliAccounts: any[]
  sucatas: any[]

  prefetch: () => Promise<void>
  invalidate: () => void
  fetchStaticResources: (force?: boolean) => Promise<void>
}

export const useProdutosCache = create<ProdutosCacheStore>((set, get) => ({
  items: [],
  total: 0,
  loading: false,
  lastFetched: null,

  categorias: [],
  locais: [],
  marcasStandard: [],
  modelosStandard: [],
  masterVehicles: [],
  meliAccounts: [],
  sucatas: [],

  prefetch: async () => {
    const { lastFetched, loading } = get()
    if (loading) return
    if (lastFetched && Date.now() - lastFetched < 30_000) return

    set({ loading: true })
    try {
      const res = await estoqueApi.listarProdutos({
        painel: true,
        limit: 12,
        offset: 0,
        ordenar: "created_at",
        direcao: "desc",
      })
      const items = Array.isArray(res) ? res : res?.items ?? []
      const total = (res as any)?.total ?? items.length
      set({ items, total, lastFetched: Date.now() })
    } catch {
      // silencioso — só um prefetch
    } finally {
      set({ loading: false })
    }
  },

  fetchStaticResources: async (force = false) => {
    const { categorias, locais, meliAccounts, sucatas } = get()
    if (!force && categorias.length > 0 && locais.length > 0 && meliAccounts.length > 0 && sucatas.length > 0) return

    const [cats, locs, brands, models, master, meli, sucs] = await Promise.allSettled([
      configuracoesApi.listarCategorias({ limit: 5000 }),
      localizacoesApi.listar({ limit: 2000 }),
      configuracoesApi.listarMarcas(),
      configuracoesApi.listarModelos(),
      catalogoApi.listarVeiculosMaster(),
      mercadolivreApi.listarContas(),
      sucatasApi.listar({ limit: 4000 }),
    ])

    const v = <T>(r: PromiseSettledResult<T>): T | undefined => r.status === 'fulfilled' ? r.value : undefined
    const catsVal = v(cats), locsVal = v(locs), brandsVal = v(brands), modelsVal = v(models)
    const masterVal = v(master), meliVal = v(meli), sucsVal = v(sucs)

    set({
      categorias: Array.isArray(catsVal)
        ? [...catsVal].sort((a: any, b: any) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"))
        : get().categorias,
      locais: Array.isArray(locsVal) ? locsVal : get().locais,
      marcasStandard: Array.isArray(brandsVal) ? brandsVal : get().marcasStandard,
      modelosStandard: Array.isArray(modelsVal) ? modelsVal : get().modelosStandard,
      masterVehicles: Array.isArray(masterVal) ? masterVal : get().masterVehicles,
      meliAccounts: Array.isArray(meliVal) ? meliVal : get().meliAccounts,
      sucatas: Array.isArray(sucsVal) ? sucsVal : ((sucsVal as any)?.items || get().sucatas),
    })
  },

  invalidate: () => set({ lastFetched: null, items: [], total: 0 }),
}))

