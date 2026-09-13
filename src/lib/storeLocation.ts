/**
 * Localização física da loja (mapa na landing /site).
 * Podes personalizar via variáveis de ambiente (ver docs/LANDING.md).
 */
export const STORE_LOCATION = {
  name: 'Dourados Auto Peças',
  // Bairro conforme o Perfil da Empresa no Google. O Google cruza endereço do
  // site com o do perfil para decidir confiança no resultado local, então os
  // dois têm de bater — aqui dizia 'Vila Industrial'.
  fullAddress: 'Av. Marcelino Pires, 5235 - Vila São Francisco, Dourados - MS, 79833-000',
  phoneDisplay: '(67) 3424-3068',
  whatsappNumber: '5567999100220',
  lat: -22.2241506,
  lng: -54.7788616,

  /**
   * Reputação exibida no bloco "loja física" da home, espelhando o Perfil da
   * Empresa no Google. É atualizado à mão: o número de avaliações muda e não
   * há API pública que devolva isso sem chave paga.
   * NÃO marcar como aggregateRating em JSON-LD — as diretrizes do Google
   * proíbem marcar como suas as avaliações coletadas por eles.
   * Conferido em 2026-08-30.
   */
  googleNota: 4.1,
  googleAvaliacoes: 28,
  horarioSemana: 'Seg a Sex: 07:30 às 11:00 e 13:00 às 17:30',
  horarioSabado: 'Sáb: 08:00 às 12:00',
} as const

/** Abre a ficha / pesquisa do local no Google Maps (nova aba). */
export function getStoreGoogleMapsUrl(): string {
  const fromEnv = import.meta.env.VITE_GOOGLE_MAPS_PLACE_URL as string | undefined
  if (fromEnv?.trim()) return fromEnv.trim()
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${STORE_LOCATION.name} ${STORE_LOCATION.fullAddress}`
  )}`
}

/**
 * URL do iframe incorporado.
 * Ideal: no Google Maps → Partilhar → Incorporar mapa → copiar o `src` do iframe para
 * `VITE_GOOGLE_MAPS_EMBED_URL` (mapa interativo com pin e painel dentro do site).
 * Sem isso, usa coordenadas com embed genérico.
 */
export function getStoreMapEmbedUrl(): string {
  const embed = import.meta.env.VITE_GOOGLE_MAPS_EMBED_URL as string | undefined
  if (embed?.trim()) return embed.trim()
  const { lat, lng } = STORE_LOCATION
  return `https://www.google.com/maps?q=${lat},${lng}&z=16&hl=pt-BR&output=embed`
}
