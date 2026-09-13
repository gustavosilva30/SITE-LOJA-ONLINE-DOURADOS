import React, { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Image as ImageIcon, Star, Trash2 } from 'lucide-react'

/** Storage Supabase às vezes responde melhor sem Referer (políticas / CDN). */
function imgReferrerPolicy(url: string): React.HTMLAttributeReferrerPolicy {
    return url.includes('supabase.co') ? 'no-referrer' : 'strict-origin-when-cross-origin'
}

/** Miniatura em faixa: placeholder se a URL quebrar (403/404/bucket privado). */
function StripThumbImg({ url, className }: { url: string; className?: string }) {
    const [ok, setOk] = useState(true)
    useEffect(() => {
        setOk(true)
    }, [url])
    if (!ok) {
        return (
            <div className={cn('flex h-full w-full items-center justify-center bg-muted', className)}>
                <ImageIcon className="h-3 w-3 text-muted-foreground/50" aria-hidden />
            </div>
        )
    }
    return (
        <img
            src={url}
            alt=""
            className={className}
            referrerPolicy={imgReferrerPolicy(url)}
            loading="lazy"
            decoding="async"
            onError={() => setOk(false)}
        />
    )
}

/** Pré-visualização principal com fallback se URL falhar (CDN / bloqueio). */
function MainPreview({
    candidates,
    className,
    onClick,
}: {
    candidates: string[]
    className?: string
    onClick?: () => void
}) {
    const [idx, setIdx] = useState(0)
    useEffect(() => {
        setIdx(0)
    }, [candidates.join('|')])
    if (candidates.length === 0) return null
    if (idx >= candidates.length) {
        return (
            <div className="flex flex-col items-center justify-center gap-1 px-2 text-center text-[10px] text-muted-foreground">
                <ImageIcon className="w-10 h-10 opacity-40" aria-hidden />
                <span>Não foi possível carregar pré-visualização (URL inválida ou bloqueada).</span>
            </div>
        )
    }
    return (
        <img
            src={candidates[idx]}
            alt=""
            className={cn(className, onClick && 'cursor-pointer hover:opacity-90 transition-opacity')}
            referrerPolicy={imgReferrerPolicy(candidates[idx])}
            loading="lazy"
            decoding="async"
            onError={() => setIdx((i) => i + 1)}
            onClick={onClick}
        />
    )
}

type Layout = 'hero' | 'strip'

/**
 * `hero`: imagem grande + faixa de miniaturas (clique troca a principal).
 * `strip`: só miniaturas em linha (ex.: tabela).
 */
export function PecaMasterImageGallery({
    urls,
    layout = 'hero',
    className,
    mainImgClassName,
    thumbClassName = 'h-10 w-10',
    maxThumbs = 12,
    /** Catálogo master: miniaturas reordenam qual foto é a 1ª (capa) no BD. */
    capaSelectable = false,
    onCapaChange,
    /** Permite excluir uma foto da galeria (ex.: edição no catálogo master). */
    removable = false,
    onRemoveAt,
    onImageClick,
}: {
    urls: string[]
    layout?: Layout
    className?: string
    mainImgClassName?: string
    thumbClassName?: string
    maxThumbs?: number
    capaSelectable?: boolean
    onCapaChange?: (indexInCurrentList: number) => void
    removable?: boolean
    onRemoveAt?: (indexInCurrentList: number) => void
    onImageClick?: (indexInOriginalList: number) => void
}) {
    const list = layout === 'strip' ? urls : urls.slice(0, maxThumbs)
    const [active, setActive] = useState(0)
    useEffect(() => {
        setActive(0)
    }, [urls.join('|')])

    if (list.length === 0) return null

    if (layout === 'strip') {
        return (
            <div
                className={cn('flex flex-row gap-0.5 overflow-x-auto max-w-[min(220px,100%)] py-0.5', className)}
                title={`${list.length} foto(s)`}
            >
                {list.map((url, i) => (
                    <div
                        key={`${url}-${i}`}
                        className={cn(
                            'shrink-0 rounded border bg-muted overflow-hidden flex items-center justify-center relative',
                            thumbClassName,
                            i === 0 && capaSelectable && 'ring-2 ring-amber-500/80'
                        )}
                    >
                        {i === 0 && capaSelectable && (
                            <span className="absolute top-0 left-0 z-[1] rounded-br bg-amber-500 text-[8px] font-black text-white px-0.5 leading-tight">
                                1ª
                            </span>
                        )}
                        {removable && onRemoveAt && (
                            <button
                                type="button"
                                className="absolute top-0 right-0 z-[2] rounded-bl bg-destructive p-0.5 text-white hover:bg-destructive/90"
                                title="Remover foto"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onRemoveAt(i)
                                }}
                            >
                                <Trash2 className="h-2.5 w-2.5" aria-hidden />
                            </button>
                        )}
                        <StripThumbImg url={url} className="max-w-full max-h-full object-contain" />
                    </div>
                ))}
            </div>
        )
    }

    const safe = active < list.length ? active : 0
    const mainCandidates = capaSelectable ? list.slice(0, 1) : list.slice(safe).length ? list.slice(safe) : list

    return (
        <div className={cn('space-y-2', className)}>
            <div className="flex items-center justify-center min-h-[8rem] max-h-[min(50vh,320px)] rounded-lg border bg-muted/30 overflow-hidden relative group/preview">
                <MainPreview
                    candidates={
                        mainCandidates.length
                            ? mainCandidates
                            : capaSelectable
                              ? list.slice(0, 1)
                              : list
                    }
                    className={cn('max-w-full max-h-[min(50vh,320px)] object-contain', mainImgClassName)}
                    onClick={() => onImageClick?.(safe)}
                />
                {removable && onRemoveAt && list.length === 1 && (
                    <button
                        type="button"
                        className="absolute bottom-1 right-1 z-[2] flex items-center gap-1 rounded-md bg-destructive px-2 py-1 text-[10px] font-bold text-white shadow hover:bg-destructive/90"
                        onClick={() => onRemoveAt(0)}
                    >
                        <Trash2 className="h-3 w-3" aria-hidden />
                        Remover foto
                    </button>
                )}
            </div>
            {list.length > 1 && (
                <div className="flex flex-wrap gap-1 justify-center items-start">
                    {list.map((url, i) => {
                        const isCapa = capaSelectable && i === 0
                        const thumbTitle =
                            capaSelectable
                                ? i === 0
                                    ? 'Primeira imagem no catálogo'
                                    : 'Definir como 1ª no catálogo'
                                : `Foto ${i + 1}`
                        return (
                            <div
                                key={`${url}-${i}`}
                                role="button"
                                tabIndex={0}
                                className={cn(
                                    'shrink-0 rounded border overflow-hidden h-12 w-12 bg-background relative cursor-pointer',
                                    capaSelectable
                                        ? isCapa
                                            ? 'ring-2 ring-amber-500 ring-offset-1'
                                            : 'opacity-90 hover:opacity-100 hover:ring-1 hover:ring-primary/50'
                                        : i === safe
                                          ? 'ring-2 ring-primary ring-offset-1'
                                          : 'opacity-90 hover:opacity-100'
                                )}
                                title={thumbTitle}
                                onClick={() => {
                                    if (capaSelectable && onCapaChange) {
                                        if (i !== 0) onCapaChange(i)
                                        return
                                    }
                                    setActive(i)
                                }}
                                onKeyDown={(e) => {
                                    if (e.key !== 'Enter' && e.key !== ' ') return
                                    e.preventDefault()
                                    if (capaSelectable && onCapaChange) {
                                        if (i !== 0) onCapaChange(i)
                                        return
                                    }
                                    setActive(i)
                                }}
                            >
                                {capaSelectable && i === 0 && (
                                    <span className="absolute top-0.5 right-0.5 z-[1] flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-white shadow pointer-events-none">
                                        <Star className="h-2.5 w-2.5 fill-current" aria-hidden />
                                    </span>
                                )}
                                {removable && onRemoveAt && (
                                    <button
                                        type="button"
                                        className="absolute bottom-0.5 right-0.5 z-[2] flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white shadow hover:bg-destructive/90"
                                        title="Remover esta foto"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            onRemoveAt(i)
                                        }}
                                    >
                                        <Trash2 className="h-2.5 w-2.5" aria-hidden />
                                    </button>
                                )}
                                <StripThumbImg url={url} className="h-full w-full object-cover" />
                            </div>
                        )
                    })}
                </div>
            )}
            {capaSelectable && list.length > 1 && (
                <p className="text-[10px] text-center text-muted-foreground px-1">
                    Clique numa miniatura para torná-la a <strong className="text-foreground">1ª foto</strong> do catálogo (lista e tabela).
                    {removable && (
                        <>
                            {' '}
                            <span className="text-destructive/90">Lixeira</span> remove a foto (grave para persistir).
                        </>
                    )}
                </p>
            )}
            {removable && (!capaSelectable || list.length <= 1) && list.length > 0 && (
                <p className="text-[10px] text-center text-muted-foreground px-1">
                    <span className="text-destructive/90">Remover</span> atualiza a pré-visualização; use <strong className="text-foreground">Salvar</strong> para gravar.
                </p>
            )}
        </div>
    )
}
