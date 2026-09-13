export type LandingSlideType = 'image' | 'product'

export interface LandingSlide {
  id: string
  ordem: number
  ativo: boolean
  /** image = só banner; product = usa produto_id + API loja para foto/preço */
  slide_type?: LandingSlideType
  produto_id?: string | null
  titulo: string | null
  subtitulo: string | null
  cta_texto: string | null
  cta_link: string | null
  imagem_url: string
  intervalo_segundos: number
  created_at?: string
  updated_at?: string
}

export interface LandingPromoTile {
  id: string
  posicao: 'left' | 'right'
  titulo: string | null
  subtitulo: string | null
  imagem_url: string | null
  cta_texto: string | null
  cta_link: string | null
  ordem: number
  ativo: boolean
  created_at?: string
}

/** 1 = bloco após faixa de confiança; 2 = bloco abaixo do mapa */
export type LandingCategoryGrupo = 1 | 2

export interface LandingCategorySlot {
  id: string
  categoria_id: string
  grupo: LandingCategoryGrupo
  ordem: number
  created_at?: string
}

export interface LandingMarketingConfig {
  id: number
  titulo_categorias_grupo1: string
  titulo_categorias_grupo2: string
  titulo_destaque_loja?: string
  titulo_sucatas_landing?: string
  updated_at?: string
}

/** Linha em landing_destaque_produtos (Marketing → Destaques) */
export interface LandingDestaqueProduto {
  id: string
  produto_id: string
  ordem: number
  created_at?: string
}
