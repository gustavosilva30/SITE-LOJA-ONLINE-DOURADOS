/** Rótulos PT para status principal do anúncio no ML. */
export function mlListingStatusLabel(status: string | null | undefined): string {
    const s = (status || '').toLowerCase()
    if (s === 'active') return 'Ativo'
    if (s === 'paused') return 'Pausado'
    if (s === 'closed') return 'Encerrado'
    if (s === 'inactive') return 'Inativo'
    if (s === 'under_review') return 'Em análise'
    return status ? String(status) : '—'
}

/** Texto para tooltip / card: status + motivo quando houver. */
export function mlListingStatusDescription(
    status: string | null | undefined,
    detail: string | null | undefined,
    meliId?: string | null
): string {
    const base = meliId ? `Anúncio ${meliId}` : 'Mercado Livre'
    const label = mlListingStatusLabel(status)
    if (!status || status === 'active') {
        return detail ? `${base}: ${label} — ${detail}` : `${base}: ${label}`
    }
    return detail ? `${base}: ${label} — ${detail}` : `${base}: ${label}`
}
