/** Só considera “abaixo do mínimo” se houver mínimo > 0 configurado no produto. */
export function produtoEstoqueAbaixoDoMinimo(estoqueAtual: number, estoqueMinimo: number): boolean {
    const min = Math.max(0, Number(estoqueMinimo) || 0)
    const atual = Number(estoqueAtual) || 0
    return min > 0 && atual <= min
}
