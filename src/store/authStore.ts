import { create } from 'zustand'
import type { PermMenu } from '@/config/crmRoutePermissions'
import { getApiBaseUrl } from '@/lib/apiBase'
import { getAuthToken, getRefreshToken, clearAuthToken } from '@/lib/auth'
import { startPrefetch } from './pagePrefetchCache'

// Evita condição de corrida entre múltiplas chamadas de signIn()/refresh de token.
let authLoadSeq = 0

/** Registo em `atendentes` (campos usados no front). */
export type AtendenteAuth = {
    id: string
    nome?: string
    username?: string | null
    email?: string | null
    cargo?: string | null
    cor_identificacao?: string
    perm_config?: boolean
    perm_admin?: boolean
    perm_menu?: PermMenu | null
    [key: string]: unknown
}

interface AuthState {
    user: any | null
    atendente: AtendenteAuth | null
    loading: boolean
    initialized: boolean
    signIn: () => Promise<void>
    signOut: () => Promise<void>
    refresh: () => Promise<void>
    /** Atualiza o estado imediatamente após login (sem re-fetch). */
    setAuth: (user: any, atendente: AtendenteAuth) => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    atendente: null,
    loading: true,
    initialized: false,

    signIn: async () => {
        const seq = ++authLoadSeq
        // Só mostra loading na carga inicial; ao trocar de aba e voltar, não remonta
        const alreadyInitialized = get().initialized
        if (!alreadyInitialized) set({ loading: true })
        try {
            // Verificar se há token no localStorage
            const token = getAuthToken()
            const userJson = localStorage.getItem('user')
            if (seq !== authLoadSeq) return

            if (token && userJson) {
                try {
                    const user = JSON.parse(userJson)
                    
                    // Tentar buscar dados estendidos do atendente no backend
                    let atendente = user
                    try {
                        const response = await fetch(`${getApiBaseUrl()}/api/auth/me`, {
                            headers: { Authorization: `Bearer ${token}` }
                        })

                        if (seq !== authLoadSeq) return

                        if (response.status === 401 || response.status === 403) {
                            // Token inválido, expirado ou assinado com outro SECRET_KEY (ex.: login local vs produção)
                            clearAuthToken()
                            set({ user: null, atendente: null, loading: false, initialized: true })
                            return
                        }
                        if (response.ok) {
                            const userData = await response.json()
                            atendente = userData.atendente || userData || user
                        }
                    } catch (err) {
                        // Se o endpoint não existir, usar os dados do user como atendente
                        console.debug('Endpoint /api/auth/me não disponível, usando dados do token')
                        atendente = {
                            ...user,
                            id: user?.atendente_id || user?.id,
                        }
                    }

                    atendente = {
                        ...atendente,
                        id: user?.atendente_id || (atendente as any)?.id || user?.id,
                    }

                    if (seq !== authLoadSeq) return
                    set({ user, atendente, loading: false, initialized: true })
                    startPrefetch()
                } catch (parseErr) {
                    console.error('Erro ao parsear user do localStorage:', parseErr)
                    clearAuthToken()
                    set({ user: null, atendente: null, loading: false, initialized: true })
                }
            } else {
                if (seq !== authLoadSeq) return
                set({ user: null, atendente: null, loading: false, initialized: true })
            }
        } catch (err) {
            console.error('Erro ao verificar sessão:', err)
            if (seq !== authLoadSeq) return
            
            // Em caso de erro de rede (fetch falhou), NÃO limpa a sessão se já temos dados.
            // Isso evita deslogar o usuário por causa de instabilidade de internet ou SSL.
            const current = get()
            if (current.user || current.atendente || localStorage.getItem('token')) {
                set({ loading: false, initialized: true })
                return
            }
            
            set({ user: null, atendente: null, loading: false, initialized: true })
        }
    },

    signOut: async () => {
        ++authLoadSeq // Cancela qualquer signIn em andamento
        // Tenta revogar o refresh token no backend (best-effort).
        const refresh = getRefreshToken()
        const token = getAuthToken()
        if (refresh) {
            try {
                await fetch(`${getApiBaseUrl()}/api/auth/logout`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({ refresh_token: refresh }),
                })
            } catch { /* ignore — limpamos local de qualquer forma */ }
        }
        clearAuthToken()
        set({ user: null, atendente: null })
    },

    refresh: async () => {
        await get().signIn()
    },

    setAuth: (user: any, atendente: AtendenteAuth) => {
        ++authLoadSeq // Cancela qualquer verificação de sessão antiga que esteja em voo
        set({ user, atendente, loading: false, initialized: true })
        startPrefetch()
    }
}))
