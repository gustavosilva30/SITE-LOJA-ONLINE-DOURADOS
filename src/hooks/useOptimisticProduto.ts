import { useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"
import { toast } from "sonner"

type ProdutoPatch = Record<string, any>
type SetProdutosFn = (updater: (prev: any[]) => any[]) => void

/**
 * Aplica uma atualização parcial em todas as queries em cache que possam ter
 * o produto, e no estado local `produtos`. Retorna uma fn de rollback.
 *
 * Uso típico:
 *   const apply = applyOptimisticProdutoUpdate(queryClient, setProdutos)
 *   const rollback = apply(produtoId, { preco: 99 })
 *   try { await api.put(...) } catch { rollback(); toast.error(...) }
 */
export function applyOptimisticProdutoUpdate(
  queryClient: ReturnType<typeof useQueryClient>,
  setProdutos: SetProdutosFn,
  produtoId: string,
  patch: ProdutoPatch,
): () => void {
  // 1) Snapshot e atualização do queryCache (todas as queries de produtos-painel)
  const cachedSnapshots: Array<[readonly unknown[], any]> = []

  const matchingQueries = queryClient.getQueryCache().findAll({
    queryKey: ['produtos-painel'],
  })

  matchingQueries.forEach((query) => {
    const data: any = query.state.data
    if (!data?.items) return
    cachedSnapshots.push([query.queryKey, data])
    queryClient.setQueryData(query.queryKey, {
      ...data,
      items: data.items.map((p: any) =>
        String(p.id) === String(produtoId) ? { ...p, ...patch } : p
      ),
    })
  })

  // 2) Snapshot e atualização do estado local
  let localSnapshot: any[] | null = null
  setProdutos((prev) => {
    localSnapshot = prev
    return prev.map((p) =>
      String(p.id) === String(produtoId) ? { ...p, ...patch } : p
    )
  })

  // 3) Função de rollback — restaura tudo
  return () => {
    cachedSnapshots.forEach(([key, data]) => queryClient.setQueryData(key, data))
    if (localSnapshot) setProdutos(() => localSnapshot!)
  }
}

/**
 * Versão "bulk": aplica o mesmo patch em múltiplos produtos de uma vez.
 * Útil pra ações em massa (marcar etiquetas, ativar/inativar, etc.).
 */
export function applyOptimisticProdutosBulkUpdate(
  queryClient: ReturnType<typeof useQueryClient>,
  setProdutos: SetProdutosFn,
  produtoIds: string[],
  patch: ProdutoPatch,
): () => void {
  const idSet = new Set(produtoIds.map(String))
  const cachedSnapshots: Array<[readonly unknown[], any]> = []

  const matchingQueries = queryClient.getQueryCache().findAll({
    queryKey: ['produtos-painel'],
  })

  matchingQueries.forEach((query) => {
    const data: any = query.state.data
    if (!data?.items) return
    cachedSnapshots.push([query.queryKey, data])
    queryClient.setQueryData(query.queryKey, {
      ...data,
      items: data.items.map((p: any) =>
        idSet.has(String(p.id)) ? { ...p, ...patch } : p
      ),
    })
  })

  let localSnapshot: any[] | null = null
  setProdutos((prev) => {
    localSnapshot = prev
    return prev.map((p) => (idSet.has(String(p.id)) ? { ...p, ...patch } : p))
  })

  return () => {
    cachedSnapshots.forEach(([key, data]) => queryClient.setQueryData(key, data))
    if (localSnapshot) setProdutos(() => localSnapshot!)
  }
}

/**
 * Hook conveniente: retorna fn que envolve uma mutation com optimistic update.
 *
 *   const optimisticUpdate = useOptimisticProdutoUpdate(setProdutos)
 *   await optimisticUpdate(id, { preco: 99 }, () => estoqueApi.atualizarProduto(id, { preco: 99 }))
 */
export function useOptimisticProdutoUpdate(setProdutos: SetProdutosFn) {
  const queryClient = useQueryClient()

  return useCallback(
    async (
      produtoId: string,
      patch: ProdutoPatch,
      mutationFn: () => Promise<any>,
      options?: { errorMessage?: string },
    ): Promise<{ ok: boolean; error?: any; data?: any }> => {
      const rollback = applyOptimisticProdutoUpdate(queryClient, setProdutos, produtoId, patch)
      try {
        const data = await mutationFn()
        return { ok: true, data }
      } catch (error: any) {
        rollback()
        toast.error(options?.errorMessage || `Erro ao atualizar: ${error?.message || 'tente novamente'}`)
        return { ok: false, error }
      }
    },
    [queryClient, setProdutos],
  )
}

export function useOptimisticProdutosBulkUpdate(setProdutos: SetProdutosFn) {
  const queryClient = useQueryClient()

  return useCallback(
    async (
      produtoIds: string[],
      patch: ProdutoPatch,
      mutationFn: () => Promise<any>,
      options?: { errorMessage?: string },
    ): Promise<{ ok: boolean; error?: any; data?: any }> => {
      const rollback = applyOptimisticProdutosBulkUpdate(queryClient, setProdutos, produtoIds, patch)
      try {
        const data = await mutationFn()
        return { ok: true, data }
      } catch (error: any) {
        rollback()
        toast.error(options?.errorMessage || `Erro ao atualizar ${produtoIds.length} produto(s)`)
        return { ok: false, error }
      }
    },
    [queryClient, setProdutos],
  )
}
