const UUID_SEGMENT_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Segmento único para `/p/:slug` na loja pública.
 * Codifica o slug para não quebrar rotas (ex.: "/" no slug) nem a URL da API.
 * Sem slug válido, usa o UUID como fallback para não quebrar links.
 */
export function storeProductDetailPathSegment(product: { id: string; slug?: string | null }): string {
  const s = product.slug?.trim();
  if (s) return encodeURIComponent(s);
  return product.id;
}

export function storeProductDetailLink(product: { id: string; slug?: string | null }): string {
  return `/p/${storeProductDetailPathSegment(product)}`;
}

/** Indica se o segmento da URL parece ser UUID (link legado). */
export function isProductDetailUuidSegment(segment: string): boolean {
  const raw = segment.trim();
  if (!raw) return false;
  try {
    return UUID_SEGMENT_RE.test(decodeURIComponent(raw));
  } catch {
    return UUID_SEGMENT_RE.test(raw);
  }
}
