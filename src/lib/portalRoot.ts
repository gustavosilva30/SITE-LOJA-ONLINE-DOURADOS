/**
 * Garante um container estável para portais React.
 * Evita erros raros do tipo "insertBefore" quando múltiplos portais/animações montam/desmontam.
 */
export function getPortalRoot(id: string): HTMLElement | null {
  if (typeof document === "undefined") return null
  const safeId = id.startsWith("#") ? id.slice(1) : id
  let el = document.getElementById(safeId)
  if (el) {
    // Alguns scripts/extensões podem mover/remover nós do body; re-anexa o root para manter o portal estável.
    try {
      if (!el.isConnected || el.parentElement !== document.body) document.body.appendChild(el)
    } catch {
      /* ignore */
    }
    return el
  }

  el = document.createElement("div")
  el.id = safeId
  el.setAttribute("data-portal-root", "true")
  document.body.appendChild(el)
  return el
}

