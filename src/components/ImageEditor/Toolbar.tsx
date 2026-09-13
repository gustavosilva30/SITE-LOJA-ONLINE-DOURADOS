import React, { useState } from "react"
// @ts-ignore
import { fabric } from "fabric"
import { Button } from "@/components/ui/button"
import {
    Type,
    ArrowUpRight,
    Square,
    Circle,
    Trash2,
    MousePointer2,
    Minus,
    Brush,
    Crop,
    Wand2,
    Loader2,
    RotateCw,
    FlipHorizontal2,
    Eraser,
    ImagePlus,
    LayoutTemplate,
    Sticker,
    Ruler,
    Sparkles,
    Shield,
    Search,
    AlignCenter,
    Scissors,
} from "lucide-react"
import { getApiBaseUrl } from "@/lib/apiBase"
import { getAuthToken } from "@/lib/auth"
import { toast } from "sonner"
import { cn } from "@/lib/utils"


type FabricCanvasLike = any

export type EditorMode = "select" | "draw" | "crop" | "eraser"

interface ToolbarProps {
    canvas: FabricCanvasLike | null
    /** Imagem atualmente carregada como camada (não fundo). Usada pelo botão "Remover Fundo". */
    imageObject: any | null
    /** Callback chamado quando a IA terminar de remover o fundo: o pai troca a imagem do canvas pela nova URL. */
    onBackgroundRemoved: (newImageUrl: string) => void | Promise<void>
    /** Modo atual do editor (controlado pelo pai). */
    mode: EditorMode
    /** Pede ao pai para mudar o modo. */
    onModeChange: (mode: EditorMode) => void
    onRotate?: () => void
    onFlip?: () => void
    onAddWatermark?: () => void
    onAddImage?: (imageUrl: string) => void
    cropRatio?: "1:1" | "4:3" | "free"
    onCropRatioChange?: (ratio: "1:1" | "4:3" | "free") => void
    onAddBadge?: (type: string) => void
    onSetStudioBackground?: (type: string) => void
    onIAEnhance?: () => void
    onAddMeasurement?: () => void
    onApplyLogo?: () => void
    onAddMagnifier?: () => void
    onSmartCenter?: () => void
    onOpenTemplates?: () => void
    isTransparent?: boolean
    onSmartCutout?: (newImageUrl: string) => void | Promise<void>
    /** Pro: callbacks que abrem pickers ricos (estilos, setas, etc).
     * Se passados, sobrepõem os add* locais (mantém compat caso não venha). */
    onOpenTextStyles?: () => void
    onOpenShapeTemplates?: (tab: "arrows" | "shapes" | "lines") => void
}

export const Toolbar: React.FC<ToolbarProps> = ({
    canvas,
    imageObject,
    onBackgroundRemoved,
    mode,
    onModeChange,
    onRotate,
    onFlip,
    onAddWatermark,
    onAddImage,
    cropRatio = "1:1",
    onCropRatioChange,
    onAddBadge,
    onSetStudioBackground,
    onIAEnhance,
    onAddMeasurement,
    onApplyLogo,
    onAddMagnifier,
    onSmartCenter,
    onOpenTemplates,
    isTransparent = false,
    onSmartCutout,
    onOpenTextStyles,
    onOpenShapeTemplates,
}) => {
    const [removingBg, setRemovingBg] = useState(false)
    const [cuttingOut, setCuttingOut] = useState(false)
    const fileInputRef = React.useRef<HTMLInputElement>(null)

    if (!canvas) return null

    /** Sai do modo desenho e volta para o modo seleção (chamado antes de adicionar formas). */
    const ensureSelectMode = () => {
        if (mode !== "select") {
            onModeChange("select")
        }
    }

    const addText = () => {
        ensureSelectMode()
        const text = new fabric.IText("Texto editável", {
            left: 100,
            top: 100,
            fontFamily: "Inter, sans-serif",
            fontSize: 40,
            fill: "#ff0000",
            fontWeight: "bold",
        })
        canvas.add(text)
        canvas.setActiveObject(text)
        canvas.requestRenderAll()
    }

    const addArrow = () => {
        ensureSelectMode()
        // Linha base
        const line = new fabric.Line([0, 0, 120, 0], {
            strokeWidth: 6,
            stroke: "#ff0000",
            originX: "left",
            originY: "center",
        })
        // Ponta da seta (triângulo) na extremidade direita
        const head = new fabric.Triangle({
            width: 22,
            height: 26,
            fill: "#ff0000",
            left: 120,
            top: 0,
            angle: 90,
            originX: "center",
            originY: "center",
        })
        const group = new fabric.Group([line, head], {
            left: 100,
            top: 100,
        })
        canvas.add(group)
        canvas.setActiveObject(group)
        canvas.requestRenderAll()
    }

    const addRect = () => {
        ensureSelectMode()
        const rect = new fabric.Rect({
            left: 100,
            top: 100,
            fill: "transparent",
            stroke: "#ff0000",
            strokeWidth: 4,
            width: 160,
            height: 100,
        })
        canvas.add(rect)
        canvas.setActiveObject(rect)
        canvas.requestRenderAll()
    }

    const addCircle = () => {
        ensureSelectMode()
        const circle = new fabric.Circle({
            left: 100,
            top: 100,
            fill: "transparent",
            stroke: "#ff0000",
            strokeWidth: 4,
            radius: 60,
        })
        canvas.add(circle)
        canvas.setActiveObject(circle)
        canvas.requestRenderAll()
    }

    const addLine = () => {
        ensureSelectMode()
        const line = new fabric.Line([50, 50, 250, 50], {
            stroke: "#ff0000",
            strokeWidth: 5,
            left: 100,
            top: 100,
        })
        canvas.add(line)
        canvas.setActiveObject(line)
        canvas.requestRenderAll()
    }

    const toggleDraw = () => {
        if (mode === "draw") {
            onModeChange("select")
        } else {
            onModeChange("draw")
        }
    }

    const toggleCrop = () => {
        if (mode === "crop") {
            onModeChange("select")
        } else {
            onModeChange("crop")
        }
    }

    const toggleEraser = () => {
        if (mode === "eraser") {
            onModeChange("select")
        } else {
            onModeChange("eraser")
        }
    }

    const deleteSelected = () => {
        const active = canvas.getActiveObjects()
        if (!active || active.length === 0) return
        canvas.discardActiveObject()
        canvas.remove(...active)
        canvas.requestRenderAll()
    }

    const handleRemoveBackground = async () => {
        if (!imageObject) {
            toast.error("Nenhuma imagem carregada para processar.")
            return
        }
        setRemovingBg(true)
        const toastId = toast.loading("Removendo fundo...")
        try {
            const dataUrl: string = imageObject.toDataURL({
                format: "png",
                multiplier: 3,
            })

            const blobRes = await fetch(dataUrl)
            const blob = await blobRes.blob()

            const formData = new FormData()
            formData.append("file", blob, "image.png")

            const response = await fetch(`${getApiBaseUrl()}/api/admin/remover-fundo-blob?transparent=true`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${getAuthToken()}`,
                },
                body: formData,
            })

            if (!response.ok) {
                const err = await response.json().catch(() => ({}))
                throw new Error(err.detail || "Falha na API do Servidor")
            }

            const outBlob = await response.blob()

            const reader = new FileReader()
            const newDataUrl: string = await new Promise((resolve, reject) => {
                reader.onload = () => resolve(reader.result as string)
                reader.onerror = () => reject(reader.error)
                reader.readAsDataURL(outBlob)
            })

            await onBackgroundRemoved(newDataUrl)
            toast.success("Fundo removido com sucesso!", { id: toastId })
        } catch (e: any) {
            console.error("[Toolbar] remover fundo erro:", e)
            toast.error(e?.message || "Erro ao remover fundo", { id: toastId })
        } finally {
            setRemovingBg(false)
        }
    }

    const handleCutout = async () => {
        if (!imageObject) {
            toast.error("Nenhuma imagem carregada para processar.")
            return
        }
        setCuttingOut(true)
        const toastId = toast.loading("Recortando item...")
        try {
            const dataUrl: string = imageObject.toDataURL({
                format: "png",
                multiplier: 3,
            })
            const blobRes = await fetch(dataUrl)
            const blob = await blobRes.blob()

            const formData = new FormData()
            formData.append("file", blob, "image.png")

            const response = await fetch(`${getApiBaseUrl()}/api/admin/remover-fundo-blob?transparent=true`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${getAuthToken()}`,
                },
                body: formData,
            })

            if (!response.ok) {
                const err = await response.json().catch(() => ({}))
                throw new Error(err.detail || "Falha na API do Servidor")
            }

            const outBlob = await response.blob()

            const reader = new FileReader()
            const newDataUrl: string = await new Promise((resolve, reject) => {
                reader.onload = () => resolve(reader.result as string)
                reader.onerror = () => reject(reader.error)
                reader.readAsDataURL(outBlob)
            })

            if (onSmartCutout) {
                await onSmartCutout(newDataUrl)
            } else {
                await onBackgroundRemoved(newDataUrl)
            }
            toast.success("Item recortado com sucesso!", { id: toastId })
        } catch (e: any) {
            console.error("[Toolbar] cutout erro:", e)
            toast.error(e?.message || "Erro ao recortar item", { id: toastId })
        } finally {
            setCuttingOut(false)
        }
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = (event) => {
            const url = event.target?.result as string
            if (onAddImage) {
                onAddImage(url)
            } else {
                // Fallback local se não passar via props
                fabric.Image.fromURL(url, (img: any) => {
                    img.scaleToWidth(200)
                    canvas.add(img)
                    canvas.setActiveObject(img)
                    canvas.requestRenderAll()
                })
            }
            // Reset input
            e.target.value = ""
        }
        reader.readAsDataURL(file)
    }

    return (
        <div className="flex flex-col bg-slate-50 border-r border-slate-200 w-[78px] h-full overflow-y-auto custom-scrollbar">
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleFileChange}
            />

            {/* ─── Modos (selecionar / cortar / pincel / borracha) ─── */}
            <ToolGroup label="Modo" accent="sky">
                <ToolButton
                    icon={<MousePointer2 className="h-4 w-4" />}
                    label="Mover"
                    active={mode === "select"}
                    onClick={() => onModeChange("select")}
                    accent="sky"
                />
                <ToolButton
                    icon={<Crop className="h-4 w-4" />}
                    label="Cortar"
                    active={mode === "crop"}
                    onClick={toggleCrop}
                    accent="sky"
                />
                <ToolButton
                    icon={<Brush className="h-4 w-4" />}
                    label="Pincel"
                    active={mode === "draw"}
                    onClick={toggleDraw}
                    accent="amber"
                />
                <ToolButton
                    icon={<Eraser className="h-4 w-4" />}
                    label="Borracha"
                    active={mode === "eraser"}
                    onClick={toggleEraser}
                    accent="rose"
                />
            </ToolGroup>

            {/* Sub-controles de Crop quando ativo */}
            {mode === "crop" && onCropRatioChange && (
                <div className="px-2 pb-2 -mt-1">
                    <div className="flex flex-col gap-0.5 p-1.5 bg-blue-50 border border-blue-200 rounded-lg">
                        <span className="text-[8px] font-black uppercase tracking-widest text-blue-700 text-center mb-0.5">
                            Proporção
                        </span>
                        {[
                            { id: "1:1", label: "1:1" },
                            { id: "4:3", label: "4:3" },
                            { id: "free", label: "Livre" },
                        ].map(opt => (
                            <button
                                key={opt.id}
                                type="button"
                                onClick={() => onCropRatioChange(opt.id as any)}
                                className={cn(
                                    "h-6 text-[10px] font-bold rounded transition-all",
                                    cropRatio === opt.id
                                        ? "bg-blue-600 text-white shadow-sm"
                                        : "bg-white text-blue-700 hover:bg-blue-100"
                                )}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ─── Adicionar (texto, formas, imagem) ─── */}
            <ToolGroup label="Adicionar" accent="emerald">
                <ToolButton
                    icon={<Type className="h-4 w-4" />}
                    label="Texto"
                    onClick={() => onOpenTextStyles ? onOpenTextStyles() : addText()}
                    accent="emerald"
                />
                <ToolButton
                    icon={<ArrowUpRight className="h-4 w-4" />}
                    label="Seta"
                    onClick={() => onOpenShapeTemplates ? onOpenShapeTemplates("arrows") : addArrow()}
                    accent="emerald"
                />
                <ToolButton
                    icon={<Square className="h-4 w-4" />}
                    label="Caixa"
                    onClick={() => onOpenShapeTemplates ? onOpenShapeTemplates("shapes") : addRect()}
                    accent="emerald"
                />
                <ToolButton
                    icon={<Circle className="h-4 w-4" />}
                    label="Círculo"
                    onClick={() => onOpenShapeTemplates ? onOpenShapeTemplates("shapes") : addCircle()}
                    accent="emerald"
                />
                <ToolButton
                    icon={<Minus className="h-4 w-4" />}
                    label="Linha"
                    onClick={() => onOpenShapeTemplates ? onOpenShapeTemplates("lines") : addLine()}
                    accent="emerald"
                />
                <ToolButton
                    icon={<ImagePlus className="h-4 w-4" />}
                    label="Imagem"
                    onClick={() => fileInputRef.current?.click()}
                    accent="emerald"
                />
            </ToolGroup>

            {/* ─── Transformar ─── */}
            <ToolGroup label="Transformar" accent="violet">
                <ToolButton icon={<RotateCw className="h-4 w-4" />} label="Girar 90°" onClick={() => onRotate?.()} accent="violet" />
                <ToolButton icon={<FlipHorizontal2 className="h-4 w-4" />} label="Espelhar" onClick={() => onFlip?.()} accent="violet" />
                <ToolButton icon={<AlignCenter className="h-4 w-4" />} label="Centralizar" onClick={() => onSmartCenter?.()} accent="violet" />
            </ToolGroup>

            {/* ─── Estilo (cenários, selos, marca d'água, logo) ─── */}
            <ToolGroup label="Estilo" accent="indigo">
                <ToolButton
                    icon={<LayoutTemplate className="h-4 w-4" />}
                    label="Cenário"
                    onClick={() => onSetStudioBackground?.("picker")}
                    accent="indigo"
                />
                <ToolButton
                    icon={<Sticker className="h-4 w-4" />}
                    label="Selos"
                    onClick={() => onAddBadge?.("picker")}
                    accent="indigo"
                />
                <ToolButton icon={<Shield className="h-4 w-4" />} label="Marca" onClick={() => onAddWatermark?.()} accent="indigo" />
                <ToolButton
                    icon={<Shield className="h-4 w-4 text-emerald-600" />}
                    label="Logo"
                    onClick={() => onApplyLogo?.()}
                    accent="indigo"
                />
                <ToolButton
                    icon={<LayoutTemplate className="h-4 w-4 text-rose-500" />}
                    label="Templates"
                    onClick={() => onOpenTemplates?.()}
                    accent="indigo"
                />
            </ToolGroup>

            {/* ─── Inteligência Artificial (destaque) ─── */}
            <ToolGroup label="IA" accent="purple" highlight>
                <ToolButton
                    icon={<Sparkles className="h-4 w-4 text-amber-500" />}
                    label="Refinar"
                    onClick={() => onIAEnhance?.()}
                    accent="purple"
                />
                <ToolButton
                    icon={removingBg ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4 text-purple-600" />}
                    label="Tirar fundo"
                    onClick={handleRemoveBackground}
                    disabled={removingBg || cuttingOut || !imageObject}
                    accent="purple"
                />
                <ToolButton
                    icon={cuttingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4 text-pink-600" />}
                    label="Recortar"
                    onClick={handleCutout}
                    disabled={removingBg || cuttingOut || !imageObject}
                    accent="purple"
                />
            </ToolGroup>

            {/* ─── Extras ─── */}
            <ToolGroup label="Extras" accent="slate">
                <ToolButton icon={<Search className="h-4 w-4" />} label="Lupa" onClick={() => onAddMagnifier?.()} accent="slate" />
                <ToolButton icon={<Ruler className="h-4 w-4" />} label="Medida" onClick={() => onAddMeasurement?.()} accent="slate" />
            </ToolGroup>

            {/* Excluir — sempre no final, separado e em vermelho */}
            <div className="mt-auto p-2 border-t border-slate-200 bg-rose-50/50">
                <ToolButton
                    icon={<Trash2 className="h-4 w-4" />}
                    label="Excluir"
                    onClick={deleteSelected}
                    accent="destructive"
                />
            </div>
        </div>
    )
}

// ─── Helpers visuais ─────────────────────────────────────────────────────

type Accent = "sky" | "emerald" | "violet" | "indigo" | "purple" | "amber" | "rose" | "slate" | "destructive"

const ACCENT_CLASSES: Record<Accent, { active: string; hover: string; ring: string; iconActive: string; sectionBg: string; sectionText: string }> = {
    sky:        { active: "bg-sky-500 text-white",       hover: "hover:bg-sky-100 hover:text-sky-700",         ring: "ring-sky-300",        iconActive: "text-white",   sectionBg: "bg-sky-50",        sectionText: "text-sky-700" },
    emerald:    { active: "bg-emerald-500 text-white",   hover: "hover:bg-emerald-100 hover:text-emerald-700", ring: "ring-emerald-300",    iconActive: "text-white",   sectionBg: "bg-emerald-50",    sectionText: "text-emerald-700" },
    violet:     { active: "bg-violet-500 text-white",    hover: "hover:bg-violet-100 hover:text-violet-700",   ring: "ring-violet-300",     iconActive: "text-white",   sectionBg: "bg-violet-50",     sectionText: "text-violet-700" },
    indigo:     { active: "bg-indigo-500 text-white",    hover: "hover:bg-indigo-100 hover:text-indigo-700",   ring: "ring-indigo-300",     iconActive: "text-white",   sectionBg: "bg-indigo-50",     sectionText: "text-indigo-700" },
    purple:     { active: "bg-purple-500 text-white",    hover: "hover:bg-purple-100 hover:text-purple-700",   ring: "ring-purple-300",     iconActive: "text-white",   sectionBg: "bg-gradient-to-b from-purple-50 to-pink-50", sectionText: "text-purple-700" },
    amber:      { active: "bg-amber-500 text-white",     hover: "hover:bg-amber-100 hover:text-amber-700",     ring: "ring-amber-300",      iconActive: "text-white",   sectionBg: "bg-amber-50",      sectionText: "text-amber-700" },
    rose:       { active: "bg-rose-500 text-white",      hover: "hover:bg-rose-100 hover:text-rose-700",       ring: "ring-rose-300",       iconActive: "text-white",   sectionBg: "bg-rose-50",       sectionText: "text-rose-700" },
    slate:      { active: "bg-slate-700 text-white",     hover: "hover:bg-slate-200 hover:text-slate-800",     ring: "ring-slate-300",      iconActive: "text-white",   sectionBg: "bg-slate-100",     sectionText: "text-slate-700" },
    destructive:{ active: "bg-rose-600 text-white",      hover: "hover:bg-rose-100 hover:text-rose-700",       ring: "ring-rose-300",       iconActive: "text-white",   sectionBg: "bg-rose-50",       sectionText: "text-rose-700" },
}

function ToolGroup({ label, accent = "slate", highlight = false, children }: { label: string; accent?: Accent; highlight?: boolean; children: React.ReactNode }) {
    const a = ACCENT_CLASSES[accent]
    return (
        <div className={cn("border-b border-slate-200/70", highlight && "bg-gradient-to-b from-purple-50/40 to-transparent")}>
            <div className={cn("text-[8px] font-black uppercase tracking-[0.15em] text-center py-1 select-none", a.sectionText)}>
                {label}
            </div>
            <div className="grid grid-cols-1 gap-0.5 px-1.5 pb-2">
                {children}
            </div>
        </div>
    )
}

function ToolButton({
    icon,
    label,
    onClick,
    active,
    disabled,
    accent = "slate",
}: {
    icon: React.ReactNode
    label: string
    onClick: () => void
    active?: boolean
    disabled?: boolean
    accent?: Accent
}) {
    const a = ACCENT_CLASSES[accent]
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={label}
            className={cn(
                "flex flex-col items-center gap-0.5 py-1.5 rounded-lg transition-all group relative",
                "text-slate-600",
                !active && !disabled && a.hover,
                active && a.active,
                active && "shadow-sm ring-2 ring-offset-1",
                active && a.ring,
                disabled && "opacity-40 cursor-not-allowed",
            )}
        >
            <span className={cn("transition-transform group-hover:scale-110", active && a.iconActive)}>
                {icon}
            </span>
            <span className={cn(
                "text-[8.5px] font-bold uppercase tracking-tight leading-none",
                active ? a.iconActive : "text-slate-500 group-hover:text-current"
            )}>
                {label}
            </span>
        </button>
    )
}
