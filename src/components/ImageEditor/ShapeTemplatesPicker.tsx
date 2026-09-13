import React, { useState } from "react"
// @ts-ignore
import { fabric } from "fabric"
import { Modal } from "@/components/ui/modal"
import { cn } from "@/lib/utils"
import { ArrowUpRight, Circle, Square, Minus } from "lucide-react"

type FabricCanvasLike = any

interface ShapeTemplatesPickerProps {
    isOpen: boolean
    onClose: () => void
    canvas: FabricCanvasLike | null
    /** Categoria a abrir por padrão. */
    initialTab?: "arrows" | "shapes" | "lines"
    /** Cor padrão das formas (pode vir de um picker externo). */
    defaultColor?: string
}

// ─── Helpers de criação de setas ────────────────────────────────────────
function makeArrowSimple(color: string, dashed = false) {
    const line = new fabric.Line([0, 0, 140, 0], {
        strokeWidth: 6, stroke: color, originX: "left", originY: "center",
        strokeDashArray: dashed ? [12, 8] : undefined,
    })
    const head = new fabric.Triangle({
        width: 24, height: 28, fill: color, left: 140, top: 0,
        angle: 90, originX: "center", originY: "center",
    })
    return new fabric.Group([line, head], { left: 100, top: 100 })
}

function makeArrowDouble(color: string) {
    const line = new fabric.Line([0, 0, 160, 0], {
        strokeWidth: 6, stroke: color, originX: "left", originY: "center",
    })
    const headRight = new fabric.Triangle({
        width: 22, height: 26, fill: color, left: 160, top: 0,
        angle: 90, originX: "center", originY: "center",
    })
    const headLeft = new fabric.Triangle({
        width: 22, height: 26, fill: color, left: 0, top: 0,
        angle: -90, originX: "center", originY: "center",
    })
    return new fabric.Group([line, headRight, headLeft], { left: 100, top: 100 })
}

function makeArrowThick(color: string) {
    // Seta gorda em formato de "block arrow"
    const path = new fabric.Path(
        "M 0,30 L 100,30 L 100,10 L 150,50 L 100,90 L 100,70 L 0,70 Z",
        { fill: color, stroke: "#000000", strokeWidth: 1, opacity: 0.95 }
    )
    path.set({ left: 100, top: 100 })
    return path
}

function makeArrowCurved(color: string) {
    // Seta com curvatura (ideal pra apontar de longe)
    const path = new fabric.Path(
        "M 10,90 Q 80,10 150,40 L 145,28 M 150,40 L 138,52",
        { fill: "transparent", stroke: color, strokeWidth: 5, strokeLineCap: "round", strokeLineJoin: "round" }
    )
    path.set({ left: 100, top: 100 })
    return path
}

function makeArrowCallout(color: string) {
    // Seta callout (com base larga, indicada pra apontar e marcar)
    const path = new fabric.Path(
        "M 0,10 L 70,10 L 90,0 L 90,30 L 70,20 L 0,20 Z",
        { fill: color, opacity: 0.9 }
    )
    path.set({ left: 100, top: 100, scaleX: 1.5, scaleY: 1.5 })
    return path
}

// ─── Círculos / formas ───────────────────────────────────────────────────
function makeCircleOutline(color: string, dashed = false) {
    return new fabric.Circle({
        left: 100, top: 100, radius: 60,
        fill: "transparent", stroke: color, strokeWidth: 4,
        strokeDashArray: dashed ? [10, 8] : undefined,
    })
}
function makeCircleFilled(color: string) {
    return new fabric.Circle({
        left: 100, top: 100, radius: 60, fill: color,
    })
}
function makeBadgeStar(color: string) {
    // Forma estrela 12 pontas (estilo selo) usando Polygon
    const points: { x: number; y: number }[] = []
    const cx = 60, cy = 60, outer = 60, inner = 50
    for (let i = 0; i < 24; i++) {
        const r = i % 2 === 0 ? outer : inner
        const a = (i * Math.PI) / 12
        points.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
    }
    return new fabric.Polygon(points as any, {
        left: 100, top: 100, fill: color, stroke: "#ffffff", strokeWidth: 2,
    })
}
function makeRectRounded(color: string) {
    return new fabric.Rect({
        left: 100, top: 100, width: 180, height: 100,
        fill: "transparent", stroke: color, strokeWidth: 4, rx: 18, ry: 18,
    })
}
function makeSquareSolid(color: string) {
    return new fabric.Rect({
        left: 100, top: 100, width: 140, height: 140, fill: color,
    })
}
function makeTagShape(color: string) {
    // Forma de tag/etiqueta
    const path = new fabric.Path(
        "M 0,10 L 130,10 L 160,50 L 130,90 L 0,90 Z",
        { fill: color }
    )
    // Furinho
    const hole = new fabric.Circle({
        radius: 6, fill: "#ffffff", left: 18, top: 50, originX: "center", originY: "center",
    })
    return new fabric.Group([path, hole], { left: 100, top: 100 })
}

// ─── Linhas ──────────────────────────────────────────────────────────────
function makeLineSolid(color: string, width = 5) {
    return new fabric.Line([0, 0, 200, 0], {
        stroke: color, strokeWidth: width, left: 100, top: 100,
        strokeLineCap: "round",
    })
}
function makeLineDashed(color: string) {
    return new fabric.Line([0, 0, 200, 0], {
        stroke: color, strokeWidth: 4, left: 100, top: 100,
        strokeDashArray: [12, 8], strokeLineCap: "round",
    })
}
function makeLineDotted(color: string) {
    return new fabric.Line([0, 0, 200, 0], {
        stroke: color, strokeWidth: 6, left: 100, top: 100,
        strokeDashArray: [1, 12], strokeLineCap: "round",
    })
}
function makeLineThick(color: string) {
    return new fabric.Line([0, 0, 220, 0], {
        stroke: color, strokeWidth: 14, left: 100, top: 100,
        strokeLineCap: "round",
    })
}
function makeLineDouble(color: string) {
    const top = new fabric.Line([0, -4, 200, -4], { stroke: color, strokeWidth: 3 })
    const bot = new fabric.Line([0, 4, 200, 4], { stroke: color, strokeWidth: 3 })
    return new fabric.Group([top, bot], { left: 100, top: 100 })
}

// ─── Templates organizados ───────────────────────────────────────────────
type ShapeTemplate = {
    id: string
    label: string
    /** SVG inline pra preview na grid */
    preview: React.ReactNode
    /** Builder que retorna fabric Object */
    build: (color: string) => any
}

function makeArrowTemplates(): ShapeTemplate[] {
    return [
        {
            id: "arr-simple", label: "Simples",
            preview: <svg viewBox="0 0 100 30" className="w-full h-full"><line x1="5" y1="15" x2="80" y2="15" stroke="currentColor" strokeWidth="3"/><polygon points="80,8 95,15 80,22" fill="currentColor"/></svg>,
            build: (c) => makeArrowSimple(c, false),
        },
        {
            id: "arr-dashed", label: "Tracejada",
            preview: <svg viewBox="0 0 100 30" className="w-full h-full"><line x1="5" y1="15" x2="80" y2="15" stroke="currentColor" strokeWidth="3" strokeDasharray="6,4"/><polygon points="80,8 95,15 80,22" fill="currentColor"/></svg>,
            build: (c) => makeArrowSimple(c, true),
        },
        {
            id: "arr-double", label: "Dupla",
            preview: <svg viewBox="0 0 100 30" className="w-full h-full"><line x1="10" y1="15" x2="90" y2="15" stroke="currentColor" strokeWidth="3"/><polygon points="90,8 100,15 90,22" fill="currentColor"/><polygon points="10,8 0,15 10,22" fill="currentColor"/></svg>,
            build: makeArrowDouble,
        },
        {
            id: "arr-thick", label: "Bloco",
            preview: <svg viewBox="0 0 100 50" className="w-full h-full"><polygon points="0,20 60,20 60,5 95,25 60,45 60,30 0,30" fill="currentColor"/></svg>,
            build: makeArrowThick,
        },
        {
            id: "arr-curved", label: "Curva",
            preview: <svg viewBox="0 0 100 50" className="w-full h-full"><path d="M 5,45 Q 50,5 90,25 L 85,18 M 90,25 L 80,32" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
            build: makeArrowCurved,
        },
        {
            id: "arr-callout", label: "Callout",
            preview: <svg viewBox="0 0 100 30" className="w-full h-full"><polygon points="0,8 70,8 90,2 90,28 70,22 0,22" fill="currentColor"/></svg>,
            build: makeArrowCallout,
        },
    ]
}

function makeShapeTemplates(): ShapeTemplate[] {
    return [
        {
            id: "circ-out", label: "Círculo",
            preview: <svg viewBox="0 0 50 50" className="w-full h-full"><circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" strokeWidth="3"/></svg>,
            build: (c) => makeCircleOutline(c, false),
        },
        {
            id: "circ-dash", label: "Círculo trac.",
            preview: <svg viewBox="0 0 50 50" className="w-full h-full"><circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="5,4"/></svg>,
            build: (c) => makeCircleOutline(c, true),
        },
        {
            id: "circ-fill", label: "Círculo cheio",
            preview: <svg viewBox="0 0 50 50" className="w-full h-full"><circle cx="25" cy="25" r="20" fill="currentColor"/></svg>,
            build: makeCircleFilled,
        },
        {
            id: "badge-star", label: "Selo",
            preview: <svg viewBox="0 0 50 50" className="w-full h-full"><polygon points="25,5 28,18 41,18 31,26 35,40 25,32 15,40 19,26 9,18 22,18" fill="currentColor"/></svg>,
            build: makeBadgeStar,
        },
        {
            id: "rect-round", label: "Caixa arredondada",
            preview: <svg viewBox="0 0 60 30" className="w-full h-full"><rect x="3" y="3" width="54" height="24" rx="8" fill="none" stroke="currentColor" strokeWidth="3"/></svg>,
            build: makeRectRounded,
        },
        {
            id: "rect-solid", label: "Quadrado",
            preview: <svg viewBox="0 0 50 50" className="w-full h-full"><rect x="5" y="5" width="40" height="40" fill="currentColor"/></svg>,
            build: makeSquareSolid,
        },
        {
            id: "tag", label: "Etiqueta",
            preview: <svg viewBox="0 0 80 30" className="w-full h-full"><polygon points="0,5 60,5 75,15 60,25 0,25" fill="currentColor"/><circle cx="10" cy="15" r="3" fill="white"/></svg>,
            build: makeTagShape,
        },
    ]
}

function makeLineTemplates(): ShapeTemplate[] {
    return [
        {
            id: "line-solid", label: "Sólida",
            preview: <svg viewBox="0 0 100 10" className="w-full h-full"><line x1="2" y1="5" x2="98" y2="5" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>,
            build: (c) => makeLineSolid(c, 5),
        },
        {
            id: "line-thick", label: "Grossa",
            preview: <svg viewBox="0 0 100 14" className="w-full h-full"><line x1="2" y1="7" x2="98" y2="7" stroke="currentColor" strokeWidth="8" strokeLinecap="round"/></svg>,
            build: makeLineThick,
        },
        {
            id: "line-dashed", label: "Tracejada",
            preview: <svg viewBox="0 0 100 10" className="w-full h-full"><line x1="2" y1="5" x2="98" y2="5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="8,5"/></svg>,
            build: makeLineDashed,
        },
        {
            id: "line-dotted", label: "Pontilhada",
            preview: <svg viewBox="0 0 100 10" className="w-full h-full"><line x1="2" y1="5" x2="98" y2="5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="1,8"/></svg>,
            build: makeLineDotted,
        },
        {
            id: "line-double", label: "Dupla",
            preview: <svg viewBox="0 0 100 14" className="w-full h-full"><line x1="2" y1="4" x2="98" y2="4" stroke="currentColor" strokeWidth="2"/><line x1="2" y1="10" x2="98" y2="10" stroke="currentColor" strokeWidth="2"/></svg>,
            build: makeLineDouble,
        },
    ]
}

const COLOR_PRESETS = [
    "#ef4444", "#f97316", "#facc15", "#22c55e",
    "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
    "#0f172a", "#ffffff",
]

export const ShapeTemplatesPicker: React.FC<ShapeTemplatesPickerProps> = ({
    isOpen, onClose, canvas, initialTab = "arrows", defaultColor = "#ef4444",
}) => {
    const [tab, setTab] = useState<"arrows" | "shapes" | "lines">(initialTab)
    const [color, setColor] = useState<string>(defaultColor)

    React.useEffect(() => { if (isOpen) setTab(initialTab) }, [isOpen, initialTab])

    const templates = tab === "arrows" ? makeArrowTemplates() : tab === "shapes" ? makeShapeTemplates() : makeLineTemplates()

    const addShape = (template: ShapeTemplate) => {
        if (!canvas) return
        const obj = template.build(color)
        canvas.add(obj)
        canvas.setActiveObject(obj)
        canvas.requestRenderAll()
        onClose()
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Adicionar Forma" className="max-w-xl">
            <div className="space-y-4 py-2">
                {/* Tabs */}
                <div className="flex border-b border-slate-200">
                    {([
                        { id: "arrows", label: "Setas", icon: ArrowUpRight },
                        { id: "shapes", label: "Formas", icon: Circle },
                        { id: "lines", label: "Linhas", icon: Minus },
                    ] as const).map(t => {
                        const TabIcon = t.icon
                        const isActive = tab === t.id
                        return (
                            <button
                                key={t.id}
                                onClick={() => setTab(t.id)}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-2 text-sm font-bold border-b-2 transition-all",
                                    isActive
                                        ? "border-primary text-primary"
                                        : "border-transparent text-slate-500 hover:text-slate-700"
                                )}
                            >
                                <TabIcon className="h-4 w-4" />
                                {t.label}
                            </button>
                        )
                    })}
                </div>

                {/* Color picker */}
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Cor:</span>
                    {COLOR_PRESETS.map(c => (
                        <button
                            key={c}
                            type="button"
                            onClick={() => setColor(c)}
                            className={cn(
                                "h-6 w-6 rounded-full border transition-transform hover:scale-110",
                                color.toLowerCase() === c.toLowerCase()
                                    ? "border-slate-800 ring-2 ring-primary"
                                    : "border-slate-200"
                            )}
                            style={{ backgroundColor: c }}
                            title={c}
                        />
                    ))}
                    <input
                        type="color"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className="h-6 w-8 rounded border border-slate-300 cursor-pointer"
                        title="Cor personalizada"
                    />
                </div>

                {/* Templates grid */}
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                    {templates.map(t => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => addShape(t)}
                            className="group flex flex-col items-center gap-2 p-3 rounded-xl border-2 border-slate-200 hover:border-primary hover:shadow-md transition-all bg-white"
                        >
                            <div
                                className="w-full h-12 flex items-center justify-center"
                                style={{ color }}
                            >
                                {t.preview}
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-700 text-center">
                                {t.label}
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        </Modal>
    )
}
