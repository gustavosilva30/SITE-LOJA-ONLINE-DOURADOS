type DbLikeError = { code?: string; message?: string } | null | undefined

export function isRlsPermissionError(error: DbLikeError): boolean {
  if (!error) return false
  const msg = String(error.message || "").toLowerCase()
  return (
    error.code === "42501" ||
    error.code === "PGRST301" ||
    msg.includes("permission denied") ||
    msg.includes("row-level security") ||
    msg.includes("new row violates row-level security")
  )
}

export function crmPermissionHint(contextLabel: string): string {
  return `Sem permissão para ${contextLabel}. Verifique no cadastro do atendente: vínculo com login (auth_user_id) e permissões de Produtos/Configuração.`
}

export function humanErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message || "Erro inesperado")
  }
  return "Erro inesperado"
}
