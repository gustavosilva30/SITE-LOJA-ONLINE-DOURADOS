import React from "react"
// @ts-ignore
import { fabric } from "fabric"
import { Eye, EyeOff, Trash2, ArrowUp, ArrowDown, Type, Image as ImageIcon, Square, Circle, Pencil, MoveUp, MoveDown } from "lucide-react"
import { cn } from "@/lib/utils"

type FabricCanvasLike = any
type FabricObject = any

interface LayersPanelProps {
    canvas: FabricCanvasLike | null
    onCommit?: () => void
}

function getObjectIcon(obj: FabricObject) {
    const t = obj.type
    if (t === "i-text" || t === "text" || t === "textbox") return Type
    if (t === "image") return ImageIcon
    if (t === "rect") return Square
    if (t === "circle" || t === "ellipse") return Circle
    if (t === "path" || t === "polyline" || t === "polygon") return Pencil
    return Square
}

function getObjectLabel(obj: FabricObject, idx: number) {
    if (obj.name) return obj.name
    const t = obj.type
    if (t === "i-text" || t === "text" || t === "textbox") {
        const txt = String(obj.text || "").slice(0, 20)
        return txt || `Texto ${idx + 1}`
    }
    if (t === "image") return `Imagem ${idx + 1}`
    if (t === "rect") return `Retângulo ${idx + 1}`
    if (t === "circle") return `Círculo ${idx + 1}`
    if (t === "path") return `Desenho ${idx + 1}`
    if (t === "group") return `Grupo ${idx + 1}`
    return `${t || "Objeto"} ${idx + 1}`
}

export const LayersPanel: React.FC<LayersPanelProps> = ({ canvas, onCommit }) => {
    const [, forceUpdate] = React.useReducer((x) => x + 1, 0)
    const [activeId, setActiveId] = React.useState<string | null>(null)

    React.useEffect(() => {
        if (!canvas) return
        // Gera __layerId em event listener (não durante render — evita side effect impuro)
        const ensureIdOnAdd = (e: any) => {
            const obj = e?.target
            if (obj && !obj.__layerId) obj.__layerId = `l_${Math.random().toString(36).slice(2, 8)}`
            forceUpdate()
        }
        const refresh = () => forceUpdate()
        const onSelect = () => {
            const obj = canvas.getActiveObject()
            setActiveId(obj?.__layerId || null)
        }
        const onClear = () => setActiveId(null)
        // Atribui IDs aos objetos que já existem no canvas (carregados antes deste mount)
        canvas.getObjects().forEach((obj: any) => {
            if (!obj.__layerId) obj.__layerId = `l_${Math.random().toString(36).slice(2, 8)}`
        })
        canvas.on("object:added", ensureIdOnAdd)
        canvas.on("object:removed", refresh)
        canvas.on("object:modified", refresh)
        canvas.on("selection:created", onSelect)
        canvas.on("selection:updated", onSelect)
        canvas.on("selection:cleared", onClear)
        return () => {
            canvas.off("object:added", ensureIdOnAdd)
            canvas.off("object:removed", refresh)
            canvas.off("object:modified", refresh)
            canvas.off("selection:created", onSelect)
            canvas.off("selection:updated", onSelect)
            canvas.off("selection:cleared", onClear)
        }
    }, [canvas])

    if (!canvas) return null

    // Lista de objetos (excluindo a imagem de fundo se houver)
    const objects: FabricObject[] = canvas.getObjects().filter((o: FabricObject) => !o.__isCropRect)
    // Mostra do topo (último adicionado) pra baixo — convenção dos editores
    const display = [...objects].reverse()

    const selectObject = (obj: FabricObject) => {
        canvas.setActiveObject(obj)
        canvas.requestRenderAll()
        setActiveId(obj.__layerId || null)
    }

    const toggleVisibility = (obj: FabricObject, e: React.MouseEvent) => {
        e.stopPropagation()
        obj.visible = !obj.visible
        canvas.requestRenderAll()
        forceUpdate()
        onCommit?.()
    }

    const deleteObject = (obj: FabricObject, e: React.MouseEvent) => {
        e.stopPropagation()
        canvas.remove(obj)
        canvas.requestRenderAll()
        forceUpdate()
        onCommit?.()
    }

    const moveLayer = (obj: FabricObject, direction: "up" | "down", e: React.MouseEvent) => {
        e.stopPropagation()
        if (direction === "up") canvas.bringForward(obj)
        else canvas.sendBackwards(obj)
        canvas.requestRenderAll()
        forceUpdate()
        onCommit?.()
    }

    if (display.length === 0) {
        return (
            <p className="text-[10px] text-slate-400 italic px-3 py-6 text-center">
                Nenhuma camada ainda. Adicione texto, formas ou imagens.
            </p>
        )
    }

    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between px-1 mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Camadas ({display.length})
                </span>
            </div>
            {display.map((obj, idxFromTop) => {
                const Icon = getObjectIcon(obj)
                // ID já garantido pelo listener object:added (e backfill no mount)
                const layerId = obj.__layerId || `l_${idxFromTop}`
                const isActive = activeId === layerId
                const isFirst = idxFromTop === 0
                const isLast = idxFromTop === display.length - 1
                return (
                    <div
                        key={layerId}
                        onClick={() => selectObject(obj)}
                        className={cn(
                            "group flex items-center gap-1.5 rounded-lg border px-2 py-1.5 cursor-pointer transition-all",
                            isActive
                                ? "border-primary bg-primary/5 shadow-sm"
                                : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                            !obj.visible && "opacity-50"
                        )}
                    >
                        <Icon className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-primary" : "text-slate-500")} />
                        <span className={cn(
                            "text-[11px] font-medium truncate flex-1 min-w-0",
                            isActive ? "text-primary font-bold" : "text-slate-700"
                        )}>
                            {getObjectLabel(obj, display.length - idxFromTop - 1)}
                        </span>
                        <button
                            type="button"
                            onClick={(e) => moveLayer(obj, "up", e)}
                            disabled={isFirst}
                            className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent"
                            title="Trazer para frente"
                        >
                            <MoveUp className="h-3 w-3 text-slate-600" />
                        </button>
                        <button
                            type="button"
                            onClick={(e) => moveLayer(obj, "down", e)}
                            disabled={isLast}
                            className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent"
                            title="Enviar para trás"
                        >
                            <MoveDown className="h-3 w-3 text-slate-600" />
                        </button>
                        <button
                            type="button"
                            onClick={(e) => toggleVisibility(obj, e)}
                            className="p-1 rounded hover:bg-slate-200"
                            title={obj.visible ? "Ocultar" : "Mostrar"}
                        >
                            {obj.visible ? (
                                <Eye className="h-3 w-3 text-slate-600" />
                            ) : (
                                <EyeOff className="h-3 w-3 text-slate-400" />
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={(e) => deleteObject(obj, e)}
                            className="p-1 rounded hover:bg-rose-100 hover:text-rose-600 text-slate-500"
                            title="Excluir camada"
                        >
                            <Trash2 className="h-3 w-3" />
                        </button>
                    </div>
                )
            })}
        </div>
    )
}
