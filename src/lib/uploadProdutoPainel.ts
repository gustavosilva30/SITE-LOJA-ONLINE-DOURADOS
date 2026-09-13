/**
 * Upload de fotos do painel (Produtos) via FastAPI: JPEG otimizado → MinIO ou Supabase no servidor
 * (conforme PRODUCT_IMAGE_STORAGE no backend).
 */
import { api } from "@/lib/api"

/** Envia ficheiro ao backend; devolve URL pública (MinIO ou Supabase conforme PRODUCT_IMAGE_STORAGE). */
export async function uploadProdutoPainelImage(file: File): Promise<string> {
  const fd = new FormData()
  fd.append("file", file)
  const data = await api.postMultipart("/api/admin/upload-produto-imagem", fd)
  const url = data?.url
  if (typeof url !== "string" || !url.trim()) {
    throw new Error("Resposta inválida do servidor (sem URL).")
  }
  return url.trim()
}

/** Painel: sempre upload pela API (nunca Supabase Storage no browser). */
export async function uploadPanelProdutoImageFile(file: File): Promise<string> {
  return uploadProdutoPainelImage(file)
}

/** Upload de vídeo nativo direto do client para o backend. */
export async function uploadSucataVideoFile(file: File | Blob): Promise<string> {
  const fd = new FormData()
  fd.append("file", file, "video.webm") // "video.webm" como nome genérico para Blob/File
  const data = await api.postMultipart("/api/admin/upload-sucata-video", fd)
  const url = data?.url
  if (typeof url !== "string" || !url.trim()) {
    throw new Error("Resposta inválida do servidor (sem URL para vídeo).")
  }
  return url.trim()
}

/** Remove objetos no MinIO (limpeza); ignora falha silenciosamente no cliente. */
export async function deleteProdutoPainelImagesMinio(paths: string[]): Promise<void> {
  if (!paths.length) return
  try {
    await api.post("/api/admin/delete-produto-imagens-minio", { paths })
  } catch (e) {
    console.warn("[deleteProdutoPainelImagesMinio]", e)
  }
}
