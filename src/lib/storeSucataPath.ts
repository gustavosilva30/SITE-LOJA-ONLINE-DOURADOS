import { isProductDetailUuidSegment } from '@/lib/storeProductPath';

/**
 * Segmento único para `/sucatas/:slug` na loja pública.
 * Sem slug válido, usa o UUID como fallback.
 */
export function storeSucataDetailPathSegment(sucata: { id: string; slug?: string | null }): string {
  const s = sucata.slug?.trim();
  if (s) return encodeURIComponent(s);
  return sucata.id;
}

export function storeSucataDetailLink(sucata: { id: string; slug?: string | null }): string {
  return `/sucatas/${storeSucataDetailPathSegment(sucata)}`;
}

/** Indica se o segmento da URL parece ser UUID (link legado). */
export const isSucataDetailUuidSegment = isProductDetailUuidSegment;
