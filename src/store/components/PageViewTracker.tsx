import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { track, isStorePublicPath } from '../lib/analytics'

/**
 * Sem UI — dispara um evento 'pageview' a cada navegação dentro da loja.
 * Montado uma única vez em App.tsx (dentro do BrowserRouter), condicionado
 * ao domínio da vitrine (landingHost) para não rastrear o CRM interno.
 */
export function PageViewTracker() {
    const location = useLocation()

    useEffect(() => {
        if (isStorePublicPath(location.pathname)) {
            track('pageview')
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.pathname])

    return null
}
