import { sucatasApi } from "@/lib/api"

/**
 * @deprecated Use `sucatasApi.ensureLocalizacao(sucataId)` — o backend cria `Sucata (CODIGO)` em `localizacoes`.
 * Mantido como atalho com a mesma assinatura antiga (sucata com codigo) não é mais necessário: passe o id da sucata.
 */
export async function ensureLocalizacaoPecaNoVeiculo(sucataId: string): Promise<string> {
  const r = await sucatasApi.ensureLocalizacao(sucataId)
  const id = r?.id
  if (typeof id !== "string" || !id) throw new Error("Resposta inválida ao garantir localização da sucata.")
  return id
}
