/**
 * Preço unitário efetivamente cobrado na linha da venda (subtotal ÷ quantidade),
 * já líquido do desconto do item. Se não houver subtotal/qtd válidos, usa preco_unitario.
 */
export function precoUnitarioEfetivoVendaItem(item: {
    quantidade?: number | null
    subtotal?: number | null
    preco_unitario?: number | null
}): number {
    const q = Number(item.quantidade ?? 0)
    if (q > 0 && item.subtotal != null) {
        const st = Number(item.subtotal)
        if (Number.isFinite(st)) return st / q
    }
    const pu = Number(item.preco_unitario ?? 0)
    return Number.isFinite(pu) ? pu : 0
}
