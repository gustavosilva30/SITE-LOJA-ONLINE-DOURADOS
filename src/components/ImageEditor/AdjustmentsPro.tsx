import React, { useEffect, useState } from "react"
// @ts-ignore
import { fabric } from "fabric"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"

type FabricObject = any

interface AdjustmentsProProps {
    imageObject: FabricObject | null
    onCommit?: () => void
}

interface Adjustments {
    exposicao: number    // -1 .. 1 (Brightness)
    contraste: number    // -1 .. 1 (Contrast)
    saturacao: number    // -1 .. 1 (Saturation)
    temperatura: number  // -1 .. 1 (HueRotation: -0.1..0.1 = quente/frio)
    matiz: number        // -1 .. 1 (HueRotation full)
    gamma: number        // 0.5 .. 2 (Gamma — sombras/realces)
    nitidez: number      // 0..1 (Convolute sharpen mix)
    blur: number         // 0..1 (Blur)
}

const DEFAULTS: Adjustments = {
    exposicao: 0, contraste: 0, saturacao: 0,
    temperatura: 0, matiz: 0, gamma: 1, nitidez: 0, blur: 0,
}

const SHARPEN_MATRIX = [0, -1, 0, -1, 5, -1, 0, -1, 0]

function buildFilters(a: Adjustments) {
    const f: any[] = []
    if (a.exposicao !== 0) f.push(new fabric.Image.filters.Brightness({ brightness: a.exposicao }))
    if (a.contraste !== 0) f.push(new fabric.Image.filters.Contrast({ contrast: a.contraste }))
    if (a.saturacao !== 0) f.push(new fabric.Image.filters.Saturation({ saturation: a.saturacao }))
    if (a.temperatura !== 0) {
        // Temperatura quente = mais vermelho/amarelo (HueRotation positivo pequeno)
        f.push(new fabric.Image.filters.HueRotation({ rotation: a.temperatura * 0.08 }))
    }
    if (a.matiz !== 0) f.push(new fabric.Image.filters.HueRotation({ rotation: a.matiz }))
    if (a.gamma !== 1) {
        const GammaCls: any = (fabric as any).Image.filters.Gamma
        if (GammaCls) f.push(new GammaCls({ gamma: [a.gamma, a.gamma, a.gamma] }))
    }
    if (a.nitidez > 0) {
        f.push(new fabric.Image.filters.Convolute({ matrix: SHARPEN_MATRIX, opaque: false }))
    }
    if (a.blur > 0) {
        const BlurCls: any = (fabric as any).Image.filters.Blur
        if (BlurCls) f.push(new BlurCls({ blur: a.blur * 0.4 }))
    }
    return f
}

const SLIDERS: { key: keyof Adjustments; label: string; min: number; max: number; step: number; fmt?: (v: number) => string }[] = [
    { key: "exposicao", label: "Exposição", min: -1, max: 1, step: 0.05 },
    { key: "contraste", label: "Contraste", min: -1, max: 1, step: 0.05 },
    { key: "saturacao", label: "Saturação", min: -1, max: 1, step: 0.05 },
    { key: "gamma", label: "Sombras / Realces (Gamma)", min: 0.4, max: 2.5, step: 0.05, fmt: (v) => v.toFixed(2) },
    { key: "temperatura", label: "Temperatura (Quente / Frio)", min: -1, max: 1, step: 0.05 },
    { key: "matiz", label: "Matiz", min: -1, max: 1, step: 0.05 },
    { key: "nitidez", label: "Nitidez", min: 0, max: 1, step: 0.1 },
    { key: "blur", label: "Desfoque", min: 0, max: 1, step: 0.05 },
]

export const AdjustmentsPro: React.FC<AdjustmentsProProps> = ({ imageObject, onCommit }) => {
    const [adj, setAdj] = useState<Adjustments>(DEFAULTS)

    // Reseta ajustes quando a imagem é trocada (ex: após "Remover fundo IA")
    // — evita reaplicar filtros antigos numa imagem nova.
    const lastImageRef = React.useRef<any>(null)
    useEffect(() => {
        if (imageObject && lastImageRef.current !== imageObject) {
            lastImageRef.current = imageObject
            setAdj(DEFAULTS)
        }
    }, [imageObject])

    // Debounce: aplica filtros 80ms após parar de mexer no slider — evita lag em imagens grandes
    useEffect(() => {
        if (!imageObject) return
        const timer = setTimeout(() => {
            try {
                imageObject.filters = buildFilters(adj)
                imageObject.applyFilters()
                imageObject.canvas?.renderAll()
            } catch (e) {
                console.error("Falha ao aplicar ajustes pro:", e)
            }
        }, 80)
        return () => clearTimeout(timer)
    }, [adj, imageObject])

    const reset = () => setAdj(DEFAULTS)

    const formatValue = (key: keyof Adjustments, v: number, fmt?: (v: number) => string): string => {
        if (fmt) return fmt(v)
        if (key === "exposicao" || key === "contraste" || key === "saturacao" || key === "temperatura" || key === "matiz") {
            return `${v > 0 ? "+" : ""}${Math.round(v * 100)}`
        }
        return Math.round(v * 100).toString()
    }

    if (!imageObject) {
        return (
            <p className="text-[10px] text-slate-400 italic px-3 py-4 text-center">
                Carregue uma imagem para ajustar.
            </p>
        )
    }

    const hasChanges = JSON.stringify(adj) !== JSON.stringify(DEFAULTS)

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Ajustes Pro
                </span>
                {hasChanges && (
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[10px] gap-1 text-blue-600 hover:text-blue-800"
                        onClick={() => { reset(); onCommit?.() }}
                    >
                        <RotateCcw className="h-3 w-3" />
                        Resetar
                    </Button>
                )}
            </div>

            <div className="space-y-3">
                {SLIDERS.map(s => {
                    const v = adj[s.key]
                    const isDefault = v === DEFAULTS[s.key]
                    return (
                        <div key={s.key} className="space-y-1">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-slate-700">{s.label}</span>
                                <span className={`text-[11px] font-mono font-bold tabular-nums ${isDefault ? "text-slate-400" : "text-primary"}`}>
                                    {formatValue(s.key, v, s.fmt)}
                                </span>
                            </div>
                            <input
                                type="range"
                                min={s.min}
                                max={s.max}
                                step={s.step}
                                value={v}
                                onChange={(e) => setAdj(prev => ({ ...prev, [s.key]: parseFloat(e.target.value) }))}
                                onMouseUp={() => onCommit?.()}
                                onTouchEnd={() => onCommit?.()}
                                className="w-full"
                            />
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
