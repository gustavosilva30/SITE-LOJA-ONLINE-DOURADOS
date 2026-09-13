import { useState, useCallback } from 'react'

export interface UseAsyncDataResult {
  /** Executa uma função assíncrona controlando loading e erro. */
  run: <T>(asyncFn: () => Promise<T>) => Promise<T | undefined>
  loading: boolean
  error: Error | null
  /** Limpa o estado de erro. */
  clearError: () => void
}

/**
 * Hook para centralizar o padrão de fetch assíncrono com loading e erro.
 * Uso: const { run, loading, error } = useAsyncData()
 *      run(async () => { const data = await supabase.from('x').select(); setData(data) })
 */
export function useAsyncData(): UseAsyncDataResult {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const run = useCallback(<T,>(asyncFn: () => Promise<T>): Promise<T | undefined> => {
    setLoading(true)
    setError(null)
    return asyncFn()
      .then((result) => {
        setLoading(false)
        return result
      })
      .catch((err) => {
        const e = err instanceof Error ? err : new Error(String(err))
        setError(e)
        setLoading(false)
        return undefined
      })
  }, [])

  const clearError = useCallback(() => setError(null), [])

  return { run, loading, error, clearError }
}
