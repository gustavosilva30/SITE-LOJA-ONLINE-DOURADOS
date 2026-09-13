/** Tipos partilhados entre PainelPollingContext e useDashboardPolling (evita import circular). */

export type RecadoPainelRow = {
    id: string
    mensagem: string
    remetente_id: string
    remetente_nome?: string | null
    created_at: string
    urgente: boolean
}

export type NotificationsPreviewPainel = {
    low_stock_count: number
    recent_sales: { id: string; total: number; origem_ml: boolean; data_venda: string | null }[]
    recent_store_orders: { id: string; total: number; order_number: string; created_at: string | null }[]
}

export type SidebarCountsPainel = {
    lembretes: number
    entregas: number
    carrinho: number
    recados: number
    uso_interno: number
}
