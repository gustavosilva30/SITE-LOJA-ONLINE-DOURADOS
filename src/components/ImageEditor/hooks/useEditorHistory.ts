import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Hook de histórico (undo/redo) para um canvas Fabric.js.
 *
 * Fluxo:
 * - A cada modificação relevante no canvas (object:added, object:modified, object:removed),
 *   captura um snapshot via canvas.toJSON() e empilha em `past`.
 * - undo: pega o último de `past` → vira o estado atual e move o "anterior" pra `future`.
 * - redo: pega o último de `future` → vira o estado atual e o "anterior" volta pra `past`.
 *
 * Atenção: usamos uma flag `isRestoring` para NÃO empilhar de novo enquanto o canvas
 * está sendo restaurado de um snapshot (senão entra em loop).
 */

// Tipo "qualquer" para o canvas porque o fabric@5 não tem tipos perfeitos
type FabricCanvasLike = any

const MAX_HISTORY = 50 // limite de snapshots (cada um pode ter alguns KB de JSON)

export interface UseEditorHistoryReturn {
    /** Captura o snapshot atual e empilha. Chame isso após o load inicial e após operações fora dos eventos do fabric. */
    pushSnapshot: () => void
    /** Desfaz a última alteração. */
    undo: () => void
    /** Refaz a alteração desfeita. */
    redo: () => void
    /** Limpa todo o histórico (ex.: ao fechar/abrir o editor). */
    clear: () => void
    /** True se houver algo a desfazer. */
    canUndo: boolean
    /** True se houver algo a refazer. */
    canRedo: boolean
}

export function useEditorHistory(canvas: FabricCanvasLike | null): UseEditorHistoryReturn {
    const pastRef = useRef<string[]>([])
    const futureRef = useRef<string[]>([])
    const currentRef = useRef<string | null>(null)
    const isRestoringRef = useRef(false)

    // Estados visíveis no React só para habilitar/desabilitar botões. Os arrays reais ficam nos refs.
    const [canUndo, setCanUndo] = useState(false)
    const [canRedo, setCanRedo] = useState(false)

    const updateFlags = useCallback(() => {
        setCanUndo(pastRef.current.length > 0)
        setCanRedo(futureRef.current.length > 0)
    }, [])

    /**
     * Serializa o canvas atual e empilha como novo snapshot.
     * O estado anterior (currentRef) vai para `past`. Limpa `future`.
     */
    const pushSnapshot = useCallback(() => {
        if (!canvas || isRestoringRef.current) return
        try {
            const json = JSON.stringify(canvas.toJSON())
            // Se for igual ao último, não empilha
            if (json === currentRef.current) return
            if (currentRef.current !== null) {
                pastRef.current.push(currentRef.current)
                if (pastRef.current.length > MAX_HISTORY) {
                    pastRef.current.shift()
                }
            }
            currentRef.current = json
            futureRef.current = []
            updateFlags()
        } catch (e) {
            // toJSON pode falhar se o canvas estiver descartado; ignora silenciosamente
            console.warn("[useEditorHistory] pushSnapshot falhou:", e)
        }
    }, [canvas, updateFlags])

    /** Restaura um snapshot JSON no canvas (sem empilhar de novo). */
    const restore = useCallback(
        (json: string) => {
            if (!canvas) return
            isRestoringRef.current = true
            try {
                canvas.loadFromJSON(json, () => {
                    canvas.renderAll()
                    isRestoringRef.current = false
                })
            } catch (e) {
                isRestoringRef.current = false
                console.warn("[useEditorHistory] restore falhou:", e)
            }
        },
        [canvas]
    )

    const undo = useCallback(() => {
        if (!canvas) return
        const prev = pastRef.current.pop()
        if (prev === undefined) return
        // O atual vai para `future`
        if (currentRef.current !== null) {
            futureRef.current.push(currentRef.current)
        }
        currentRef.current = prev
        restore(prev)
        updateFlags()
    }, [canvas, restore, updateFlags])

    const redo = useCallback(() => {
        if (!canvas) return
        const next = futureRef.current.pop()
        if (next === undefined) return
        // O atual vai para `past`
        if (currentRef.current !== null) {
            pastRef.current.push(currentRef.current)
        }
        currentRef.current = next
        restore(next)
        updateFlags()
    }, [canvas, restore, updateFlags])

    const clear = useCallback(() => {
        pastRef.current = []
        futureRef.current = []
        currentRef.current = null
        updateFlags()
    }, [updateFlags])

    /**
     * Liga os listeners do fabric para capturar mudanças automaticamente.
     * Eventos relevantes: object:added, object:modified, object:removed, path:created (pincel).
     */
    useEffect(() => {
        if (!canvas) return

        const handler = () => {
            // pequeno debounce manual para juntar eventos sequenciais (ex.: drag arrasta dispara muitos)
            // mas como o object:modified só dispara ao soltar, geralmente está OK chamar direto.
            pushSnapshot()
        }

        canvas.on("object:added", handler)
        canvas.on("object:modified", handler)
        canvas.on("object:removed", handler)
        canvas.on("path:created", handler) // pincel livre

        return () => {
            canvas.off("object:added", handler)
            canvas.off("object:modified", handler)
            canvas.off("object:removed", handler)
            canvas.off("path:created", handler)
        }
    }, [canvas, pushSnapshot])

    /**
     * Atalhos de teclado: Ctrl+Z (undo) e Ctrl+Y / Ctrl+Shift+Z (redo).
     */
    useEffect(() => {
        if (!canvas) return

        const onKey = (e: KeyboardEvent) => {
            const isCtrl = e.ctrlKey || e.metaKey
            if (!isCtrl) return

            // Não interferir em campos de texto fora do canvas (inputs do painel de propriedades)
            const target = e.target as HTMLElement | null
            const tag = target?.tagName?.toLowerCase()
            if (tag === "input" || tag === "textarea" || target?.isContentEditable) return

            if (e.key === "z" || e.key === "Z") {
                e.preventDefault()
                if (e.shiftKey) {
                    redo()
                } else {
                    undo()
                }
            } else if (e.key === "y" || e.key === "Y") {
                e.preventDefault()
                redo()
            }
        }

        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [canvas, undo, redo])

    return { pushSnapshot, undo, redo, clear, canUndo, canRedo }
}
