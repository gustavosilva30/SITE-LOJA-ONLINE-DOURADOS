/**
 * Paleta da loja online: azul-marinho + verde-limão (referência visual de grandes autopeças,
 * sem reproduzir identidade de marca de terceiros).
 */
export const STORE_NAVY = '#001A54'
export const STORE_NAVY_LIGHT = '#002677'
export const STORE_NAVY_DARK = '#000D2B'
export const STORE_ACCENT = '#B6D433'
export const STORE_ACCENT_HOVER = '#A5C12E'
export const STORE_ACCENT_FG = '#001A54'

/**
 * Use em botões com fundo escuro (marinho/preto/azul forte). Garante texto e ícones brancos
 * mesmo com tema dark ou variant default do shadcn.
 */
export const STORE_ON_DARK = '!text-white hover:!text-white active:!text-white [&_svg]:!text-white'

/** Envolve páginas da vitrine para repor tokens claros quando o ERP está em tema escuro */
export const STORE_PUBLIC_SCOPE_CLASS = 'store-public-scope'
