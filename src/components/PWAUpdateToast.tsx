import { useEffect } from "react"
import { toast } from "sonner"
import { useRegisterSW } from "virtual:pwa-register/react"

/**
 * Mostra toast quando uma nova versão do app estiver disponível.
 * O usuário decide quando recarregar — nunca refresh forçado durante uso.
 *
 * Funciona junto com `registerType: 'autoUpdate'` no vite.config:
 *   - SW baixa o novo bundle em background
 *   - Quando pronto, dispara `needRefresh` → mostramos toast
 *   - User clica "Atualizar" → reload limpo
 */
export function PWAUpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl) {
      // eslint-disable-next-line no-console
      console.log("[PWA] Service Worker registrado:", swUrl)
    },
    onRegisterError(err) {
      console.warn("[PWA] Falha ao registrar SW:", err)
    },
  })

  useEffect(() => {
    if (!needRefresh) return
    toast.info("Nova versão disponível", {
      description: "Recarregue para usar a versão mais recente do CRM.",
      duration: Infinity,
      action: {
        label: "Atualizar",
        onClick: () => {
          setNeedRefresh(false)
          updateServiceWorker(true)
        },
      },
      onDismiss: () => setNeedRefresh(false),
    })
  }, [needRefresh, setNeedRefresh, updateServiceWorker])

  return null
}
