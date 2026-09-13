/**
 * Moldura de exibição das fotos (não gira pixels — só aspect-ratio / área).
 */

export type ImagemOrientacao = 'quadrado' | 'retrato' | 'paisagem'

export function normalizeImagemOrientacao(v: string | null | undefined): ImagemOrientacao {
  if (v === 'retrato' || v === 'paisagem') return v
  return 'quadrado'
}

/** Grade de cards no ERP (Produtos) */
export function erpGridImageAreaClass(orient: string | null | undefined): string {
  const o = normalizeImagemOrientacao(orient)
  const base =
    'bg-muted/30 flex items-center justify-center border-b border-border/10 relative overflow-hidden cursor-zoom-in group/img w-full'
  if (o === 'retrato') return `${base} aspect-[3/4] max-h-44 sm:max-h-72`
  if (o === 'paisagem') return `${base} aspect-[4/3] max-h-36 sm:max-h-56`
  return `${base} h-36 sm:h-52`
}

/** Miniatura na tabela (lista) */
export function erpListThumbClass(orient: string | null | undefined): string {
  const o = normalizeImagemOrientacao(orient)
  const base =
    'rounded-lg border border-border bg-card overflow-hidden flex items-center justify-center shrink-0 cursor-zoom-in group/img relative shadow-sm'
  if (o === 'retrato') return `w-10 h-[3.25rem] ${base}`
  if (o === 'paisagem') return `w-[3.25rem] h-10 ${base}`
  return `w-12 h-12 ${base}`
}

/** Thumbs no modal de edição (grade de fotos) */
export function erpModalFotoThumbClass(orient: string | null | undefined): string {
  const o = normalizeImagemOrientacao(orient)
  const base = 'relative rounded-lg border bg-background overflow-hidden group shadow-sm'
  if (o === 'retrato') return `${base} aspect-[3/4]`
  if (o === 'paisagem') return `${base} aspect-[4/3]`
  return `${base} aspect-square`
}

/** Card da loja online */
export function lojaCardImageClass(orient: string | null | undefined): string {
  const o = normalizeImagemOrientacao(orient)
  const base = 'relative bg-slate-100 rounded-xl mb-4 overflow-hidden'
  if (o === 'retrato') return `${base} aspect-[3/4]`
  if (o === 'paisagem') return `${base} aspect-[4/3]`
  return `${base} aspect-[4/3]`
}

/** Área principal da foto na página de detalhe da loja */
export function lojaDetailMainImageClass(orient: string | null | undefined): string {
  const o = normalizeImagemOrientacao(orient)
  const base = 'bg-gray-100 rounded-lg overflow-hidden'
  if (o === 'retrato') return `${base} aspect-[3/4] max-w-md mx-auto`
  if (o === 'paisagem') return `${base} aspect-[4/3]`
  return `${base} aspect-square`
}
