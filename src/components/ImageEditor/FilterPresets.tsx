import React from "react"
// @ts-ignore
import { fabric } from "fabric"
import { cn } from "@/lib/utils"

type FabricObject = any

interface FilterPresetsProps {
    imageObject: FabricObject | null
    onCommit?: () => void
}

type Preset = {
    id: string
    label: string
    /** Função que retorna array de fabric.Image.filters */
    build: () => any[]
    /** CSS pra preview da miniatura */
    previewClass: string
}

/**
 * Presets de filtro 1-click — qualidade de revista pra fotos de produto.
 * Cada preset combina múltiplos fabric.Image.filters em uma só ação.
 * Click novamente em "Original" pra resetar.
 */
const PRESETS: Preset[] = [
    {
        id: "original",
        label: "Original",
        build: () => [],
        previewClass: "",
    },
    {
        id: "vivid",
        label: "Vívido",
        build: () => [
            new fabric.Image.filters.Saturation({ saturation: 0.4 }),
            new fabric.Image.filters.Contrast({ contrast: 0.15 }),
            new fabric.Image.filters.Brightness({ brightness: 0.05 }),
        ],
        previewClass: "saturate-150 contrast-110",
    },
    {
        id: "bw",
        label: "P&B",
        build: () => [new fabric.Image.filters.Grayscale()],
        previewClass: "grayscale",
    },
    {
        id: "sepia",
        label: "Sépia",
        build: () => [new fabric.Image.filters.Sepia()],
        previewClass: "sepia",
    },
    {
        id: "vintage",
        label: "Vintage",
        build: () => {
            const Cls: any = (fabric as any).Image.filters.Vintage
            return [
                Cls ? new Cls() : new fabric.Image.filters.Sepia(),
                new fabric.Image.filters.Saturation({ saturation: -0.15 }),
            ]
        },
        previewClass: "sepia-[.4] saturate-75",
    },
    {
        id: "cinematic",
        label: "Cinema",
        build: () => [
            new fabric.Image.filters.Contrast({ contrast: 0.25 }),
            new fabric.Image.filters.Saturation({ saturation: -0.2 }),
            new fabric.Image.filters.Brightness({ brightness: -0.05 }),
        ],
        previewClass: "contrast-125 saturate-75 brightness-95",
    },
    {
        id: "polaroid",
        label: "Polaroid",
        build: () => {
            const Cls: any = (fabric as any).Image.filters.Polaroid
            return [Cls ? new Cls() : new fabric.Image.filters.Sepia()]
        },
        previewClass: "saturate-110 brightness-105 contrast-95",
    },
    {
        id: "kodachrome",
        label: "Kodak",
        build: () => {
            const Cls: any = (fabric as any).Image.filters.Kodachrome
            return [Cls ? new Cls() : new fabric.Image.filters.Saturation({ saturation: 0.3 })]
        },
        previewClass: "saturate-125 contrast-110",
    },
    {
        id: "warm",
        label: "Quente",
        build: () => [
            new fabric.Image.filters.HueRotation({ rotation: 0.05 }),
            new fabric.Image.filters.Saturation({ saturation: 0.1 }),
            new fabric.Image.filters.Brightness({ brightness: 0.05 }),
        ],
        previewClass: "saturate-110 hue-rotate-15 brightness-105",
    },
    {
        id: "cool",
        label: "Frio",
        build: () => [
            new fabric.Image.filters.HueRotation({ rotation: -0.05 }),
            new fabric.Image.filters.Saturation({ saturation: -0.1 }),
        ],
        previewClass: "saturate-90 hue-rotate-[-15deg]",
    },
    {
        id: "sharp",
        label: "Nítido",
        build: () => [
            new fabric.Image.filters.Convolute({
                matrix: [0, -1, 0, -1, 5, -1, 0, -1, 0],
            }),
            new fabric.Image.filters.Contrast({ contrast: 0.1 }),
        ],
        previewClass: "contrast-110",
    },
    {
        id: "soft",
        label: "Suave",
        build: () => [
            new fabric.Image.filters.Convolute({
                matrix: [
                    1 / 9, 1 / 9, 1 / 9,
                    1 / 9, 1 / 9, 1 / 9,
                    1 / 9, 1 / 9, 1 / 9,
                ],
            }),
            new fabric.Image.filters.Brightness({ brightness: 0.05 }),
        ],
        previewClass: "blur-[0.3px] brightness-105",
    },
]

export const FilterPresets: React.FC<FilterPresetsProps> = ({ imageObject, onCommit }) => {
    const [activePreset, setActivePreset] = React.useState<string>("original")
    const [thumb, setThumb] = React.useState<string | null>(null)

    // Gera thumbnail da imagem original pra preview
    React.useEffect(() => {
        if (!imageObject) return
        try {
            const src = imageObject.getSrc?.() || imageObject._element?.src
            if (src) setThumb(src)
        } catch {}
    }, [imageObject])

    const applyPreset = (preset: Preset) => {
        if (!imageObject) return
        try {
            imageObject.filters = preset.build().filter(Boolean)
            imageObject.applyFilters()
            imageObject.canvas?.renderAll()
            setActivePreset(preset.id)
            onCommit?.()
        } catch (e: any) {
            // Cross-origin / tainted canvas — WebGL não consegue ler pixels
            const isCors = String(e?.message || e || "").toLowerCase().includes("tainted") ||
                           String(e?.name || "").toLowerCase().includes("security")
            console.error("Falha ao aplicar preset:", e)
            if (typeof window !== "undefined" && isCors) {
                // Aviso amigável só pra erro de CORS (caso comum em fotos externas)
                try {
                    // Import dinâmico do toast pra não acoplar dep aqui
                    import("sonner").then(({ toast }) => {
                        toast.error("Esta imagem é de domínio externo sem CORS. Faça upload local pra aplicar filtros.")
                    })
                } catch {}
            }
        }
    }

    if (!imageObject) {
        return (
            <p className="text-[10px] text-slate-400 italic px-3 py-4 text-center">
                Carregue uma imagem para usar os presets.
            </p>
        )
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Estilos rápidos
                </span>
                {activePreset !== "original" && (
                    <button
                        onClick={() => applyPreset(PRESETS[0])}
                        className="text-[10px] font-bold text-blue-600 hover:text-blue-800 hover:underline"
                    >
                        Limpar
                    </button>
                )}
            </div>
            <div className="grid grid-cols-3 gap-2">
                {PRESETS.map((preset) => {
                    const isActive = activePreset === preset.id
                    return (
                        <button
                            key={preset.id}
                            type="button"
                            onClick={() => applyPreset(preset)}
                            className={cn(
                                "group relative overflow-hidden rounded-lg border-2 transition-all aspect-square",
                                isActive
                                    ? "border-primary ring-2 ring-primary/20 shadow-md"
                                    : "border-slate-200 hover:border-slate-300 hover:shadow-sm"
                            )}
                            title={preset.label}
                        >
                            {thumb ? (
                                <img
                                    src={thumb}
                                    alt={preset.label}
                                    className={cn("w-full h-full object-cover", preset.previewClass)}
                                />
                            ) : (
                                <div className={cn("w-full h-full bg-slate-100", preset.previewClass)} />
                            )}
                            <div className={cn(
                                "absolute inset-x-0 bottom-0 px-1 py-0.5 text-[9px] font-black uppercase tracking-wide transition-all",
                                isActive
                                    ? "bg-primary text-white"
                                    : "bg-black/60 text-white opacity-0 group-hover:opacity-100"
                            )}>
                                {preset.label}
                            </div>
                            {isActive && (
                                <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-primary text-white flex items-center justify-center text-[8px] font-bold shadow">
                                    ✓
                                </div>
                            )}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
