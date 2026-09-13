import { isUrlAlreadyOnOurStorage } from "./mirrorImportImages"
import { objectPathFromProdutosStoragePublicUrl } from "@/lib/storageProdutosUrl"
import { deleteProdutoPainelImagesMinio } from "@/lib/uploadProdutoPainel"

const CATALOG_PREFIX = "catalog-templates/"

export function produtosBucketRelativePathFromPublicUrl(url: string): string | null {
  return objectPathFromProdutosStoragePublicUrl(url)
}

/** Apaga arquivos MinIO em `catalog-templates/` criados para o catálogo master ao excluir a peça. */
export async function removeMirroredCatalogTemplateImages(urls: string[]): Promise<void> {
  const paths = new Set<string>()
  for (const url of urls) {
    if (!url || !isUrlAlreadyOnOurStorage(url)) continue
    const p = produtosBucketRelativePathFromPublicUrl(url)
    if (p && p.startsWith(CATALOG_PREFIX)) paths.add(p)
  }
  if (paths.size === 0) return
  await deleteProdutoPainelImagesMinio([...paths])
}
