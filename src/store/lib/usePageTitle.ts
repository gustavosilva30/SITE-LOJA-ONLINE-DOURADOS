import { useEffect } from 'react'

const DEFAULT_TITLE = 'Dourados Auto Peças — Loja Online de Peças Automotivas em Dourados/MS'
const DEFAULT_DESCRIPTION =
    'Compre peças automotivas novas e usadas em Dourados/MS com entrega rápida e retirada na loja. Amortecedores, suspensão, elétrica, lataria e muito mais — confira o catálogo online.'

function setMetaDescription(content: string) {
    let tag = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    if (!tag) {
        tag = document.createElement('meta')
        tag.setAttribute('name', 'description')
        document.head.appendChild(tag)
    }
    tag.setAttribute('content', content)
}

/**
 * Define document.title (+ meta description opcional) enquanto a página está
 * montada, e restaura o padrão da loja ao desmontar/trocar de página — útil
 * pra SEO de páginas de produto/categoria numa SPA (o index.html só tem um
 * <title> estático, que não muda sozinho por rota).
 */
export function usePageTitle(title?: string | null, description?: string | null) {
    useEffect(() => {
        if (!title) return
        const previousTitle = document.title
        const previousDescriptionTag = document.querySelector('meta[name="description"]')
        const previousDescription = previousDescriptionTag?.getAttribute('content') || null

        document.title = title
        if (description) setMetaDescription(description)

        return () => {
            document.title = previousTitle || DEFAULT_TITLE
            setMetaDescription(previousDescription || DEFAULT_DESCRIPTION)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [title, description])
}
