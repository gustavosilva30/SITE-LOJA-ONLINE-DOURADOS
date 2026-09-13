/**
 * MLStatusBadge — exibe o status do anuncio no Mercado Livre para cada conta vinculada.
 * Recebe o array `mercadolivre_product_links` que ja vem na listagem de produtos.
 */
import React from "react"
import { cn } from "@/lib/utils"
import { MLIcon } from "./MLIcon"
import { mlListingStatusLabel } from "@/lib/mlListingStatus"

interface MLLink {
    ml_account_id?: string
    ml_item_id?: string | null
    ml_status?: string | null
    ml_status_detail?: string | null
    ml_nickname?: string | null
}

interface MLStatusBadgeProps {
    links: MLLink[]
    /** compact: so bolinha colorida; default: bolinha + texto */
    compact?: boolean
    className?: string
}

function statusColors(status: string | null | undefined) {
    const s = (status || "").toLowerCase()
    if (s === "active")
        return {
            dot: "bg-emerald-500",
            pulse: true,
            text: "text-emerald-700 dark:text-emerald-300",
            bg: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800",
        }
    if (s === "paused")
        return {
            dot: "bg-amber-400",
            pulse: false,
            text: "text-amber-700 dark:text-amber-300",
            bg: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800",
        }
    if (s === "closed" || s === "inactive")
        return {
            dot: "bg-slate-400",
            pulse: false,
            text: "text-slate-600 dark:text-slate-400",
            bg: "bg-slate-50 border-slate-200 dark:bg-slate-900/40 dark:border-slate-700",
        }
    if (s === "under_review")
        return {
            dot: "bg-blue-400",
            pulse: false,
            text: "text-blue-700 dark:text-blue-300",
            bg: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",
        }
    return {
        dot: "bg-amber-300",
        pulse: false,
        text: "text-amber-700 dark:text-amber-300",
        bg: "bg-amber-50/60 border-amber-200/60 border-dashed dark:bg-amber-950/20 dark:border-amber-800/60",
    }
}

export function MLStatusBadge({ links, compact = false, className }: MLStatusBadgeProps) {
    const active = (links || []).filter((l) => l?.ml_item_id)
    if (active.length === 0) return null

    return (
        <div className={cn("flex flex-col gap-1", className)}>
            {active.map((link, i) => {
                const colors = statusColors(link.ml_status)
                const label = link.ml_status
                    ? mlListingStatusLabel(link.ml_status)
                    : "Nao sincronizado"
                const nick = link.ml_nickname || `Conta ${i + 1}`
                const tooltipText = [
                    `${nick} - ${label}`,
                    link.ml_status_detail || "",
                    link.ml_item_id ? `Anuncio: ${link.ml_item_id}` : "",
                ]
                    .filter(Boolean)
                    .join("\n")

                const mlItemId = String(link.ml_item_id || '').trim();
                const withDash = mlItemId.startsWith('MLB') ? `MLB-${mlItemId.slice(3)}` : mlItemId;
                const permalink = mlItemId ? `https://produto.mercadolivre.com.br/${withDash}` : '#';

                if (compact) {
                    return (
                        <a
                            href={permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            key={link.ml_account_id || i}
                            title={tooltipText}
                            className="flex items-center gap-1 hover:opacity-80 transition-opacity"
                        >
                            <span className="relative flex h-2 w-2">
                                {colors.pulse && (
                                    <span
                                        className={cn(
                                            "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                                            colors.dot,
                                        )}
                                    />
                                )}
                                <span
                                    className={cn("relative inline-flex rounded-full h-2 w-2", colors.dot)}
                                />
                            </span>
                        </a>
                    )
                }

                return (
                    <a
                        href={permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        key={link.ml_account_id || i}
                        title={tooltipText}
                        className={cn(
                            "flex items-start gap-1.5 px-2 py-1.5 rounded-lg border w-full hover:opacity-80 transition-opacity hover:shadow-sm",
                            colors.bg,
                        )}
                    >
                        <MLIcon size={11} className="shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                            <div className="text-[8px] font-black uppercase tracking-wider text-muted-foreground leading-none mb-0.5">
                                {active.length > 1 ? nick : "Mercado Livre"}
                            </div>
                            <div className={cn("flex items-center gap-1", colors.text)}>
                                <span className="relative flex h-1.5 w-1.5 shrink-0">
                                    {colors.pulse && (
                                        <span
                                            className={cn(
                                                "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                                                colors.dot,
                                            )}
                                        />
                                    )}
                                    <span
                                        className={cn(
                                            "relative inline-flex rounded-full h-1.5 w-1.5",
                                            colors.dot,
                                        )}
                                    />
                                </span>
                                <span className="text-[10px] font-bold leading-snug">{label}</span>
                            </div>
                            {link.ml_status_detail && (
                                <div className="text-[8px] text-muted-foreground line-clamp-1 mt-0.5 font-medium">
                                    {link.ml_status_detail}
                                </div>
                            )}
                        </div>
                    </a>
                )
            })}
        </div>
    )
}
