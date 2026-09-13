import React, { useEffect, useState } from "react"
// @ts-ignore
import { fabric } from "fabric"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Bold, Italic, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"
import { ColorPickerPro } from "./ColorPickerPro"
import { toast } from "sonner"

type FabricCanvasLike = any
type FabricObject = any

interface PropertiesPanelProps {
    canvas: FabricCanvasLike | null
    /** Imagem-camada principal (passada pelo pai); usada para filtros. */
    imageObject: FabricObject | null
    /** Callback chamado depois de alterações para o pai forçar push de snapshot. */
    onCommit?: () => void
    mode?: string
    eraserSize?: number
    onEraserSizeChange?: (val: number) => void
}

interface ImageFilters {
    brightness: number // -1 .. 1
    contrast: number   // -1 .. 1
    saturation: number // -1 .. 1
    sharpen: boolean
}

const DEFAULT_FILTERS: ImageFilters = { brightness: 0, contrast: 0, saturation: 0, sharpen: false }

const FONT_OPTIONS = [
    "Inter, sans-serif",
    "Arial, sans-serif",
    "Helvetica, sans-serif",
    "Georgia, serif",
    "'Times New Roman', serif",
    "'Courier New', monospace",
    "Impact, sans-serif",
    "'Comic Sans MS', cursive",
]

const COLOR_PRESETS = [
    "#ff0000", // vermelho
    "#000000", // preto
    "#ffffff", // branco
    "#fbbf24", // amarelo
    "#22c55e", // verde
    "#3b82f6", // azul
    "#a855f7", // roxo
    "#f97316", // laranja
]

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ canvas, imageObject, onCommit, mode, eraserSize = 20, onEraserSizeChange }) => {
    const [activeObject, setActiveObject] = useState<FabricObject | null>(null)
    const [filters, setFilters] = useState<ImageFilters>(DEFAULT_FILTERS)

    // Estados visíveis para o objeto selecionado
    const [color, setColor] = useState<string>("#ff0000")
    const [strokeWidth, setStrokeWidth] = useState<number>(4)
    const [fontFamily, setFontFamily] = useState<string>("Inter, sans-serif")
    const [fontSize, setFontSize] = useState<number>(40)
    const [textStrokeColor, setTextStrokeColor] = useState<string>("#ffffff")
    const [textStrokeWidth, setTextStrokeWidth] = useState<number>(0)
    const [bold, setBold] = useState<boolean>(false)
    const [italic, setItalic] = useState<boolean>(false)
    const [imageScale, setImageScale] = useState<number>(1)
    const [opacity, setOpacity] = useState<number>(1)
    const [canvasWidth, setCanvasWidth] = useState<number>(800)
    const [canvasHeight, setCanvasHeight] = useState<number>(600)

    // Estados de Sombra
    const [shadowEnabled, setShadowEnabled] = useState(false)
    const [shadowBlur, setShadowBlur] = useState(15)
    const [shadowOffsetX, setShadowOffsetX] = useState(5)
    const [shadowOffsetY, setShadowOffsetY] = useState(5)
    const [shadowOpacity, setShadowOpacity] = useState(0.4)
    const [magnifierZoom, setMagnifierZoom] = useState(2)

    // Sincroniza escala da imagem principal e dimensões do canvas
    useEffect(() => {
        if (imageObject) {
            setImageScale(imageObject.scaleX || 1)
        }
        if (canvas) {
            setCanvasWidth(canvas.getWidth())
            setCanvasHeight(canvas.getHeight())
        }
    }, [imageObject, canvas])

    /**
     * Sincroniza os controles visuais com o objeto ativo.
     * Chamado nos eventos selection:created/updated/cleared do canvas.
     */
    const syncFromObject = (obj: FabricObject | null) => {
        setActiveObject(obj)
        if (!obj) return

        if (obj.type === "i-text" || obj.type === "text" || obj.type === "textbox") {
            setColor(obj.fill || "#ff0000")
            setTextStrokeColor(obj.stroke || "#ffffff")
            setTextStrokeWidth(obj.strokeWidth || 0)
            setFontFamily(obj.fontFamily || "Inter, sans-serif")
            setFontSize(obj.fontSize || 40)
            setBold((obj.fontWeight || "").toString() === "bold" || Number(obj.fontWeight) >= 600)
            setItalic(obj.fontStyle === "italic")
        } else {
            // Formas (rect, circle, line, group/seta)
            setColor(obj.stroke || obj.fill || "#ff0000")
            setStrokeWidth(obj.strokeWidth || 4)
        }

        if (obj.type === "image" || obj.type === "rect" || obj.type === "circle" || obj.type === "group") {
            const shadow = obj.shadow
            if (shadow) {
                setShadowEnabled(true)
                setShadowBlur(shadow.blur || 0)
                setShadowOffsetX(shadow.offsetX || 0)
                setShadowOffsetY(shadow.offsetY || 0)
                // Converte cor rgba em opacidade (se possível)
                const color = shadow.color || "rgba(0,0,0,0.4)"
                if (color.includes("rgba")) {
                    const alpha = parseFloat(color.split(",").pop() || "0.4")
                    setShadowOpacity(alpha)
                }
            } else {
                setShadowEnabled(false)
            }
        }

        if (obj.type === "image") {
            setImageScale(obj.scaleX || 1)
            setOpacity(obj.opacity || 1)

            // Tenta extrair filtros existentes para sincronizar os sliders
            const currentFilters: ImageFilters = { ...DEFAULT_FILTERS }
            if (obj.filters && obj.filters.length > 0) {
                obj.filters.forEach((f: any) => {
                    if (f.type === "Brightness") currentFilters.brightness = f.brightness
                    if (f.type === "Contrast") currentFilters.contrast = f.contrast
                    if (f.type === "Saturation") currentFilters.saturation = f.saturation
                })
            }
            setFilters(currentFilters)
        }

        if (obj.isMagnifier) {
            setMagnifierZoom(obj.magnifierZoom || 2)
        }
    }

    useEffect(() => {
        if (!canvas) return

        const onSelection = () => {
            const active = canvas.getActiveObject()
            syncFromObject(active || null)
        }
        const onCleared = () => syncFromObject(null)

        canvas.on("selection:created", onSelection)
        canvas.on("selection:updated", onSelection)
        canvas.on("selection:cleared", onCleared)

        return () => {
            canvas.off("selection:created", onSelection)
            canvas.off("selection:updated", onSelection)
            canvas.off("selection:cleared", onCleared)
        }
    }, [canvas])

    /**
     * Aplica filtros à imagem-camada ativa ou principal.
     * Fabric.js v5: filters[] + applyFilters().
     */
    const applyImageFilters = (next: ImageFilters) => {
        // Prioriza o objeto selecionado se for imagem, senão a imagem principal
        const target = (activeObject && activeObject.type === "image") ? activeObject : imageObject
        if (!target) return

        const list: any[] = []
        if (next.brightness !== 0) {
            list.push(new fabric.Image.filters.Brightness({ brightness: next.brightness }))
        }
        if (next.contrast !== 0) {
            list.push(new fabric.Image.filters.Contrast({ contrast: next.contrast }))
        }
        if (next.saturation !== 0) {
            list.push(new fabric.Image.filters.Saturation({ saturation: next.saturation }))
        }
        if (next.sharpen) {
            list.push(new fabric.Image.filters.Convolute({
                matrix: [ 0, -1,  0,
                         -1,  5, -1,
                          0, -1,  0 ]
            }))
        }
        target.filters = list
        try {
            target.applyFilters()
            canvas?.requestRenderAll()
        } catch (e) {
            console.warn("[PropertiesPanel] applyFilters falhou:", e)
        }
    }

    const setFilter = (key: keyof ImageFilters, value: number) => {
        const next = { ...filters, [key]: value }
        setFilters(next)
        applyImageFilters(next)
        onCommit?.()
    }

    const resetFilters = () => {
        setFilters(DEFAULT_FILTERS)
        applyImageFilters(DEFAULT_FILTERS)
        onCommit?.()
    }

    const updateShadow = (next: { enabled?: boolean; blur?: number; x?: number; y?: number; opacity?: number }) => {
        if (!activeObject || !canvas) return
        
        const enabled = next.enabled !== undefined ? next.enabled : shadowEnabled
        const blur = next.blur !== undefined ? next.blur : shadowBlur
        const x = next.x !== undefined ? next.x : shadowOffsetX
        const y = next.y !== undefined ? next.y : shadowOffsetY
        const op = next.opacity !== undefined ? next.opacity : shadowOpacity

        if (!enabled) {
            activeObject.set("shadow", null)
        } else {
            activeObject.set("shadow", new fabric.Shadow({
                color: `rgba(0,0,0,${op})`,
                blur: blur,
                offsetX: x,
                offsetY: y
            }))
        }
        canvas.requestRenderAll()
        onCommit?.()
    }

    /** Aplica uma propriedade no objeto ativo e pede render. */
    const updateObject = (props: Record<string, any>) => {
        if (!activeObject || !canvas) return
        activeObject.set(props)
        canvas.requestRenderAll()
    }

    const onColorChange = (newColor: string) => {
        setColor(newColor)
        if (!activeObject) return
        if (activeObject.type === "i-text" || activeObject.type === "text" || activeObject.type === "textbox") {
            updateObject({ fill: newColor })
        } else if (activeObject.type === "group") {
            // Para a seta (linha + triângulo agrupados), aplica em todos os filhos
            ;(activeObject._objects || []).forEach((child: any) => {
                if (child.type === "triangle") {
                    child.set({ fill: newColor })
                } else {
                    child.set({ stroke: newColor })
                }
            })
            updateObject({})
        } else {
            updateObject({ stroke: newColor })
        }
    }

    const onTextStrokeColorChange = (newColor: string) => {
        setTextStrokeColor(newColor)
        updateObject({ stroke: newColor, paintFirst: "stroke" })
    }

    const onTextStrokeWidthChange = (val: number) => {
        setTextStrokeWidth(val)
        updateObject({ strokeWidth: val, paintFirst: "stroke" })
    }

    const onStrokeWidthChange = (val: number) => {
        setStrokeWidth(val)
        updateObject({ strokeWidth: val })
    }

    const onFontFamilyChange = (val: string) => {
        setFontFamily(val)
        updateObject({ fontFamily: val })
    }

    const onFontSizeChange = (val: number) => {
        setFontSize(val)
        updateObject({ fontSize: val })
    }

    const toggleBold = () => {
        const next = !bold
        setBold(next)
        updateObject({ fontWeight: next ? "bold" : "normal" })
    }

    const toggleItalic = () => {
        const next = !italic
        setItalic(next)
        updateObject({ fontStyle: next ? "italic" : "normal" })
    }

    const isText =
        activeObject &&
        (activeObject.type === "i-text" || activeObject.type === "text" || activeObject.type === "textbox")
    const isImage = activeObject && activeObject.type === "image" && activeObject !== imageObject
    const isShape = activeObject && !isText && !isImage
    const isMagnifier = activeObject && activeObject.isMagnifier

    return (
        <aside className="w-60 shrink-0 border-l bg-background overflow-y-auto p-3 space-y-4">
            {/* Filtros (sempre visíveis, no topo) */}
            <Section title="Filtros da imagem">
                <FilterSlider
                    label="Brilho"
                    value={filters.brightness}
                    onChange={(v) => setFilter("brightness", v)}
                />
                <FilterSlider
                    label="Contraste"
                    value={filters.contrast}
                    onChange={(v) => setFilter("contrast", v)}
                />
                <FilterSlider
                    label="Saturação"
                    value={filters.saturation}
                    onChange={(v) => setFilter("saturation", v)}
                />
                <div className="flex items-center justify-between pt-1">
                    <Label className="text-xs font-bold">Aumentar Nitidez</Label>
                    <input 
                        type="checkbox" 
                        checked={filters.sharpen}
                        onChange={(e) => setFilter("sharpen", e.target.checked ? 1 as any : 0 as any)}
                        className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    className="w-full mt-1 h-8 text-xs"
                    onClick={resetFilters}
                    type="button"
                >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Resetar filtros
                </Button>
            </Section>

            {/* Ajustes da Imagem Principal */}
            <Section title="Ajuste da Imagem">
                <div className="space-y-1">
                    <div className="flex items-center justify-between">
                        <Label className="text-xs">Escala ({Math.round(imageScale * 100)}%)</Label>
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-5 w-5" 
                            title="Resetar escala"
                            onClick={() => {
                                if (!imageObject || !canvas) return
                                imageObject.scale(1)
                                setImageScale(1)
                                canvas.requestRenderAll()
                                onCommit?.()
                            }}
                        >
                            <RotateCcw className="h-3 w-3" />
                        </Button>
                    </div>
                    <input
                        type="range"
                        min={0.1}
                        max={4}
                        step={0.01}
                        value={imageScale}
                        onChange={(e) => {
                            const val = Number(e.target.value)
                            setImageScale(val)
                            if (imageObject) {
                                imageObject.scale(val)
                                canvas?.requestRenderAll()
                            }
                        }}
                        onMouseUp={() => onCommit?.()}
                        className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-7 text-[10px] font-bold uppercase"
                        onClick={() => {
                            if (!imageObject || !canvas) return
                            imageObject.center()
                            imageObject.setCoords()
                            canvas.requestRenderAll()
                            onCommit?.()
                        }}
                    >
                        Centralizar
                    </Button>
                    <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-7 text-[10px] font-bold uppercase"
                        onClick={() => {
                            if (!imageObject || !canvas) return
                            const vW = canvas.width || 800
                            const vH = canvas.height || 600
                            const iW = imageObject.width || 1
                            const iH = imageObject.height || 1
                            const scale = Math.min(vW / iW, vH / iH) * 0.9
                            imageObject.scale(scale)
                            imageObject.center()
                            imageObject.setCoords()
                            setImageScale(scale)
                            canvas.requestRenderAll()
                            onCommit?.()
                        }}
                    >
                        Ajustar
                    </Button>
                </div>
            </Section>

            {/* Ajustes do Quadro (Canvas) */}
            <Section title="Tamanho do Quadro">
                {/* Pro: 1-click para ajustar quadro à imagem (elimina "caixa em volta") */}
                <Button
                    variant="default"
                    size="sm"
                    className="h-9 w-full text-xs font-black uppercase tracking-wide gap-2 mb-2"
                    onClick={() => {
                        if (!canvas || !imageObject) return
                        // Pega tamanho real da imagem na posição/escala atual
                        const w = Math.round((imageObject.width || 0) * (imageObject.scaleX || 1))
                        const h = Math.round((imageObject.height || 0) * (imageObject.scaleY || 1))
                        if (w <= 0 || h <= 0) return
                        // Reposiciona imagem em (0,0) e ajusta canvas exatamente ao tamanho dela
                        imageObject.set({ left: 0, top: 0 })
                        imageObject.setCoords()
                        canvas.setWidth(w)
                        canvas.setHeight(h)
                        canvas.setViewportTransform([1, 0, 0, 1, 0, 0])
                        canvas.requestRenderAll()
                        setCanvasWidth(w)
                        setCanvasHeight(h)
                        onCommit?.()
                    }}
                    disabled={!imageObject}
                    title="Ajusta o quadro do editor exatamente ao tamanho da imagem (sem espaço em volta)"
                >
                    📐 Ajustar quadro à imagem
                </Button>
                <div className="space-y-1">
                    <div className="flex items-center justify-between">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Largura ({canvasWidth}px)</Label>
                    </div>
                    <input
                        type="range"
                        min={100}
                        max={2000}
                        value={canvasWidth}
                        onChange={(e) => {
                            const val = Number(e.target.value)
                            setCanvasWidth(val)
                            canvas?.setWidth(val)
                            canvas?.requestRenderAll()
                        }}
                        onMouseUp={() => onCommit?.()}
                        className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                </div>
                <div className="space-y-1">
                    <div className="flex items-center justify-between">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Altura ({canvasHeight}px)</Label>
                    </div>
                    <input
                        type="range"
                        min={100}
                        max={2000}
                        value={canvasHeight}
                        onChange={(e) => {
                            const val = Number(e.target.value)
                            setCanvasHeight(val)
                            canvas?.setHeight(val)
                            canvas?.requestRenderAll()
                        }}
                        onMouseUp={() => onCommit?.()}
                        className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                </div>
                <div className="grid grid-cols-1 gap-2 mt-2">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Presets Marketplace</p>
                    <div className="grid grid-cols-2 gap-2">
                        <Button 
                            variant="secondary" 
                            size="sm" 
                            className="h-7 text-[10px] font-bold"
                            onClick={() => {
                                if (!canvas) return
                                canvas.setWidth(1200)
                                canvas.setHeight(1200)
                                setCanvasWidth(1200)
                                setCanvasHeight(1200)
                                if (imageObject) {
                                    imageObject.center()
                                    imageObject.setCoords()
                                }
                                canvas.requestRenderAll()
                                onCommit?.()
                            }}
                        >
                            1200px (ML)
                        </Button>
                        <Button 
                            variant="secondary" 
                            size="sm" 
                            className="h-7 text-[10px] font-bold"
                            onClick={() => {
                                if (!canvas) return
                                canvas.setWidth(1080)
                                canvas.setHeight(1080)
                                setCanvasWidth(1080)
                                setCanvasHeight(1080)
                                if (imageObject) {
                                    imageObject.center()
                                    imageObject.setCoords()
                                }
                                canvas.requestRenderAll()
                                onCommit?.()
                            }}
                        >
                            1080px (Insta)
                        </Button>
                        <Button 
                            variant="secondary" 
                            size="sm" 
                            className="h-7 text-[10px] font-bold"
                            onClick={() => {
                                if (!canvas) return
                                canvas.setWidth(1080)
                                canvas.setHeight(1920)
                                setCanvasWidth(1080)
                                setCanvasHeight(1920)
                                if (imageObject) {
                                    imageObject.center()
                                    imageObject.setCoords()
                                }
                                canvas.requestRenderAll()
                                onCommit?.()
                            }}
                        >
                            Stories
                        </Button>
                        <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-7 text-[10px] font-bold"
                            onClick={() => {
                                if (!canvas || !imageObject) return
                                const rect = imageObject.getBoundingRect()
                                const padding = 40
                                const newW = Math.round(rect.width + padding)
                                const newH = Math.round(rect.height + padding)
                                canvas.setWidth(newW)
                                canvas.setHeight(newH)
                                setCanvasWidth(newW)
                                setCanvasHeight(newH)
                                imageObject.center()
                                imageObject.setCoords()
                                canvas.requestRenderAll()
                                onCommit?.()
                            }}
                        >
                            Auto Ajuste
                        </Button>
                    </div>
                </div>
            </Section>

            {/* Painel contextual: texto */}
            {isText && (
                <Section title="Texto selecionado">
                    <div className="space-y-1">
                        <Label className="text-xs">Fonte</Label>
                        <Select value={fontFamily} onChange={(e) => onFontFamilyChange(e.target.value)}>
                            {FONT_OPTIONS.map((f) => (
                                <option key={f} value={f}>
                                    {f.split(",")[0].replace(/'/g, "")}
                                </option>
                            ))}
                        </Select>
                    </div>

                    <div className="space-y-1">
                        <Label className="text-xs">Tamanho ({fontSize}px)</Label>
                        <input
                            type="range"
                            min={10}
                            max={120}
                            value={fontSize}
                            onChange={(e) => onFontSizeChange(Number(e.target.value))}
                            className="w-full"
                        />
                    </div>

                    <div className="flex gap-2">
                        <Button
                            variant={bold ? "default" : "outline"}
                            size="icon"
                            className="h-8 w-8"
                            onClick={toggleBold}
                            type="button"
                            title="Negrito"
                        >
                            <Bold className="h-4 w-4" />
                        </Button>
                        <Button
                            variant={italic ? "default" : "outline"}
                            size="icon"
                            className="h-8 w-8"
                            onClick={toggleItalic}
                            type="button"
                            title="Itálico"
                        >
                            <Italic className="h-4 w-4" />
                        </Button>
                    </div>

                    <ColorPicker color={color} onChange={onColorChange} />
                    
                    <div className="pt-2 border-t space-y-2 mt-2">
                        <Label className="text-xs font-bold">Contorno (Stroke)</Label>
                        <div className="space-y-1">
                            <Label className="text-[10px]">Espessura ({textStrokeWidth}px)</Label>
                            <input
                                type="range"
                                min={0}
                                max={20}
                                value={textStrokeWidth}
                                onChange={(e) => onTextStrokeWidthChange(Number(e.target.value))}
                                className="w-full"
                            />
                        </div>
                        {textStrokeWidth > 0 && (
                            <ColorPicker color={textStrokeColor} onChange={onTextStrokeColorChange} />
                        )}
                    </div>
                </Section>
            )}

            {/* Painel contextual: borracha */}
            {mode === "eraser" && (
                <Section title="Borracha Mágica">
                    <div className="space-y-1">
                        <Label className="text-xs">Tamanho do Pincel ({eraserSize}px)</Label>
                        <input
                            type="range"
                            min={5}
                            max={100}
                            value={eraserSize}
                            onChange={(e) => onEraserSizeChange?.(Number(e.target.value))}
                            className="w-full"
                        />
                        <p className="text-[10px] text-muted-foreground mt-2 leading-tight">
                            Pinte sobre a imagem para torná-la transparente (apagar o fundo).
                        </p>
                    </div>
                </Section>
            )}

            {/* Painel contextual: forma */}
            {isShape && (
                <Section title="Forma selecionada">
                    <div className="space-y-1">
                        <Label className="text-xs">Espessura ({strokeWidth}px)</Label>
                        <input
                            type="range"
                            min={1}
                            max={20}
                            value={strokeWidth}
                            onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
                            className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                    </div>
                    <ColorPicker color={color} onChange={onColorChange} />
                </Section>
            )}

            {/* Painel contextual: imagem overlay */}
            {isImage && (
                <Section title="Imagem Sobreposta">
                    <div className="space-y-1">
                        <Label className="text-xs">Escala ({Math.round(imageScale * 100)}%)</Label>
                        <input
                            type="range"
                            min={0.05}
                            max={4}
                            step={0.01}
                            value={imageScale}
                            onChange={(e) => {
                                const val = Number(e.target.value)
                                setImageScale(val)
                                if (activeObject) {
                                    activeObject.scale(val)
                                    canvas?.requestRenderAll()
                                }
                            }}
                            onMouseUp={() => onCommit?.()}
                            className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">Opacidade ({Math.round(opacity * 100)}%)</Label>
                        <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            value={opacity}
                            onChange={(e) => {
                                const val = Number(e.target.value)
                                setOpacity(val)
                                if (activeObject) {
                                    activeObject.set("opacity", val)
                                    canvas?.requestRenderAll()
                                }
                            }}
                            onMouseUp={() => onCommit?.()}
                            className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                    </div>
                    <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full h-8 text-[10px] font-bold uppercase mt-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                        onClick={() => {
                            if (!activeObject || !canvas || activeObject.type !== "image") return
                            // The RemoveColor filter is not available in standard fabric.js v5 type definitions
                            // So we just skip this feature to avoid type errors.
                            toast.error("Filtro indisponível");
                            onCommit?.()
                        }}
                    >
                        Tornar Branco Transparente
                    </Button>
                </Section>
            )}

            {/* Painel contextual: Lupa */}
            {isMagnifier && (
                <Section title="Ajuste da Lupa">
                    <div className="space-y-1">
                        <Label className="text-xs font-bold text-amber-600">Zoom interno ({magnifierZoom.toFixed(1)}x)</Label>
                        <input
                            type="range"
                            min={1}
                            max={10}
                            step={0.1}
                            value={magnifierZoom}
                            onChange={(e) => {
                                const val = Number(e.target.value)
                                setMagnifierZoom(val)
                                if (activeObject) {
                                    activeObject.set("magnifierZoom", val)
                                    // Atualiza o transform do padrão do círculo interno
                                    const circle = activeObject.item(0)
                                    if (circle && circle.fill && circle.fill.source) {
                                        circle.fill.patternTransform = [val, 0, 0, val, 0, 0]
                                    }
                                    // Precisamos forçar a atualização dos offsets
                                    // Como não temos a função updateMagnifiers aqui, 
                                    // vamos disparar um evento que o pai escuta
                                    canvas?.fire('object:moving', { target: activeObject })
                                    canvas?.requestRenderAll()
                                }
                            }}
                            className="w-full h-1.5 bg-amber-100 rounded-lg appearance-none cursor-pointer accent-amber-500"
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">
                            Ajuste o nível de ampliação para ver mais detalhes.
                        </p>
                    </div>
                </Section>
            )}

            {/* Painel contextual: Sombras (para objetos que suportam) */}
            {activeObject && (activeObject.type === "image" || activeObject.type === "rect" || activeObject.type === "circle" || activeObject.type === "group") && (
                <Section title="Sombra Projetada">
                    <div className="flex items-center justify-between mb-2">
                        <Label className="text-xs font-bold">Ativar Sombra</Label>
                        <input 
                            type="checkbox" 
                            checked={shadowEnabled}
                            onChange={(e) => {
                                setShadowEnabled(e.target.checked)
                                updateShadow({ enabled: e.target.checked })
                            }}
                            className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                    </div>
                    {shadowEnabled && (
                        <div className="space-y-3 pt-1">
                            <div className="space-y-1">
                                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Blur ({shadowBlur})</Label>
                                <input
                                    type="range" min={0} max={50} value={shadowBlur}
                                    onChange={(e) => { setShadowBlur(Number(e.target.value)); updateShadow({ blur: Number(e.target.value) }) }}
                                    className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-emerald-500"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">Offset X ({shadowOffsetX})</Label>
                                    <input
                                        type="range" min={-30} max={30} value={shadowOffsetX}
                                        onChange={(e) => { setShadowOffsetX(Number(e.target.value)); updateShadow({ x: Number(e.target.value) }) }}
                                        className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-emerald-500"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">Offset Y ({shadowOffsetY})</Label>
                                    <input
                                        type="range" min={-30} max={30} value={shadowOffsetY}
                                        onChange={(e) => { setShadowOffsetY(Number(e.target.value)); updateShadow({ y: Number(e.target.value) }) }}
                                        className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-emerald-500"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Opacidade ({Math.round(shadowOpacity * 100)}%)</Label>
                                <input
                                    type="range" min={0} max={1} step={0.01} value={shadowOpacity}
                                    onChange={(e) => { setShadowOpacity(Number(e.target.value)); updateShadow({ opacity: Number(e.target.value) }) }}
                                    className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-emerald-500"
                                />
                            </div>
                        </div>
                    )}
                </Section>
            )}

            {/* Mensagem quando nada está selecionado (fora dos filtros) */}
            {!activeObject && (
                <p className="text-[11px] text-muted-foreground px-1">
                    Clique em um objeto do canvas para editar suas propriedades.
                </p>
            )}
        </aside>
    )
}

// ---------- componentes auxiliares ----------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</h3>
            <div className="space-y-2">{children}</div>
        </div>
    )
}

function FilterSlider({
    label,
    value,
    onChange,
}: {
    label: string
    value: number
    onChange: (v: number) => void
}) {
    // Converte -1..1 → -100..100 para visual e digitação
    const display = Math.round(value * 100)
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
                <Label className="text-xs">{label}</Label>
                <span className="text-[10px] text-muted-foreground tabular-nums">{display}</span>
            </div>
            <input
                type="range"
                min={-100}
                max={100}
                value={display}
                onChange={(e) => onChange(Number(e.target.value) / 100)}
                className="w-full"
            />
        </div>
    )
}

function rgbToHex(rgb: string): string {
    if (rgb.startsWith("#")) return rgb;
    const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (!match) return "#000000";
    const r = parseInt(match[1]);
    const g = parseInt(match[2]);
    const b = parseInt(match[3]);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}

function ColorPicker({ color, onChange }: { color: string; onChange: (c: string) => void }) {
    const hexColor = rgbToHex(color);
    return (
        <ColorPickerPro value={hexColor} onChange={onChange} label="Cor" />
    )
}
