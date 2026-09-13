import React, { useEffect, useState } from "react"
// @ts-ignore
import { fabric } from "fabric"
import { Modal } from "@/components/ui/modal"
import { cn } from "@/lib/utils"
import { Type, Sparkles, Tag, AlertOctagon, Award, MessageSquare, Megaphone, Star, Palette } from "lucide-react"

type FabricCanvasLike = any

interface TextStylesPickerProps {
    isOpen: boolean
    onClose: () => void
    canvas: FabricCanvasLike | null
}

// ─── Fontes Google + locais ─────────────────────────────────────────────
// Carregadas dinamicamente via @import no head quando o picker abre 1ª vez
const GOOGLE_FONTS = [
    "Roboto", "Montserrat", "Open Sans", "Lato", "Poppins",
    "Oswald", "Bebas Neue", "Anton", "Playfair Display",
    "Merriweather", "Lora", "Pacifico", "Caveat", "Dancing Script",
    "Permanent Marker", "Russo One", "Black Ops One", "Bungee",
    "Fjalla One", "Righteous", "Archivo Black", "Alfa Slab One",
    "Press Start 2P",
]

const LOCAL_FONTS = [
    "Inter", "Arial", "Helvetica", "Georgia", "Times New Roman",
    "Courier New", "Impact", "Comic Sans MS", "Verdana", "Trebuchet MS",
]

const ALL_FONTS = [...LOCAL_FONTS, ...GOOGLE_FONTS]

let _fontsLoaded = false
function ensureGoogleFontsLoaded() {
    if (_fontsLoaded) return
    _fontsLoaded = true
    const linkId = "image-editor-google-fonts"
    if (document.getElementById(linkId)) return
    const families = GOOGLE_FONTS.map(f => `family=${f.replace(/ /g, "+")}:wght@400;700;900`).join("&")
    const link = document.createElement("link")
    link.id = linkId
    link.rel = "stylesheet"
    link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`
    document.head.appendChild(link)
}

// ─── Templates de texto profissionais ────────────────────────────────────
type TextTemplate = {
    id: string
    label: string
    desc: string
    icon: React.ComponentType<any>
    preview: string                       // texto que aparece como preview
    apply: (text: any) => void            // muda propriedades do fabric.IText
    placeholder: string                   // texto inicial
}

const TEXT_TEMPLATES: TextTemplate[] = [
    {
        id: "title",
        label: "Título",
        desc: "Texto grande pra título principal",
        icon: Type,
        preview: "TÍTULO",
        placeholder: "TÍTULO",
        apply: (t) => t.set({
            fontSize: 64,
            fontFamily: "Anton",
            fontWeight: "900",
            fill: "#0f172a",
            charSpacing: 30,
        }),
    },
    {
        id: "subtitle",
        label: "Subtítulo",
        desc: "Texto médio elegante",
        icon: Type,
        preview: "Subtítulo elegante",
        placeholder: "Subtítulo",
        apply: (t) => t.set({
            fontSize: 32,
            fontFamily: "Playfair Display",
            fontWeight: "400",
            fontStyle: "italic",
            fill: "#475569",
        }),
    },
    {
        id: "sale",
        label: "Promoção",
        desc: "Selo grande de OFERTA",
        icon: Sparkles,
        preview: "OFERTA",
        placeholder: "OFERTA",
        apply: (t) => t.set({
            fontSize: 80,
            fontFamily: "Bebas Neue",
            fontWeight: "900",
            fill: "#dc2626",
            stroke: "#ffffff",
            strokeWidth: 3,
            shadow: new fabric.Shadow({ color: "rgba(0,0,0,0.4)", offsetX: 4, offsetY: 4, blur: 8 }),
            charSpacing: 50,
        }),
    },
    {
        id: "price",
        label: "Preço",
        desc: "Tag de preço destacado",
        icon: Tag,
        preview: "R$ 99",
        placeholder: "R$ 99,90",
        apply: (t) => t.set({
            fontSize: 56,
            fontFamily: "Oswald",
            fontWeight: "700",
            fill: "#16a34a",
            stroke: "#052e16",
            strokeWidth: 1,
        }),
    },
    {
        id: "discount",
        label: "Desconto",
        desc: "% de desconto chamativo",
        icon: AlertOctagon,
        preview: "50% OFF",
        placeholder: "50% OFF",
        apply: (t) => t.set({
            fontSize: 72,
            fontFamily: "Russo One",
            fontWeight: "900",
            fill: "#facc15",
            stroke: "#7c2d12",
            strokeWidth: 4,
            shadow: new fabric.Shadow({ color: "rgba(124,45,18,0.5)", offsetX: 3, offsetY: 3, blur: 0 }),
        }),
    },
    {
        id: "stamp",
        label: "Carimbo",
        desc: "Texto rotacionado tipo selo",
        icon: Award,
        preview: "ORIGINAL",
        placeholder: "ORIGINAL",
        apply: (t) => t.set({
            fontSize: 36,
            fontFamily: "Bebas Neue",
            fontWeight: "900",
            fill: "transparent",
            stroke: "#dc2626",
            strokeWidth: 3,
            angle: -15,
            charSpacing: 80,
        }),
    },
    {
        id: "neon",
        label: "Neon",
        desc: "Texto com brilho neon",
        icon: Sparkles,
        preview: "NEON",
        placeholder: "NEON",
        apply: (t) => t.set({
            fontSize: 64,
            fontFamily: "Bungee",
            fontWeight: "400",
            fill: "#06b6d4",
            stroke: "#67e8f9",
            strokeWidth: 1,
            shadow: new fabric.Shadow({ color: "#06b6d4", offsetX: 0, offsetY: 0, blur: 30 }),
        }),
    },
    {
        id: "outline",
        label: "Contorno",
        desc: "Só borda, sem preenchimento",
        icon: Type,
        preview: "OUTLINE",
        placeholder: "TEXTO",
        apply: (t) => t.set({
            fontSize: 60,
            fontFamily: "Archivo Black",
            fontWeight: "900",
            fill: "transparent",
            stroke: "#0f172a",
            strokeWidth: 2,
            charSpacing: 30,
        }),
    },
    {
        id: "shadow3d",
        label: "3D",
        desc: "Texto com efeito 3D",
        icon: Type,
        preview: "3D",
        placeholder: "TEXTO 3D",
        apply: (t) => t.set({
            fontSize: 72,
            fontFamily: "Black Ops One",
            fontWeight: "900",
            fill: "#fbbf24",
            shadow: new fabric.Shadow({ color: "#92400e", offsetX: 6, offsetY: 6, blur: 0 }),
        }),
    },
    {
        id: "quote",
        label: "Citação",
        desc: "Texto manuscrito elegante",
        icon: MessageSquare,
        preview: "\"Inspire\"",
        placeholder: "\"Sua frase aqui\"",
        apply: (t) => t.set({
            fontSize: 42,
            fontFamily: "Caveat",
            fontWeight: "400",
            fill: "#1e293b",
        }),
    },
    {
        id: "banner",
        label: "Banner",
        desc: "Faixa promocional larga",
        icon: Megaphone,
        preview: "NOVIDADE!",
        placeholder: "NOVIDADE!",
        apply: (t) => t.set({
            fontSize: 48,
            fontFamily: "Fjalla One",
            fontWeight: "700",
            fill: "#ffffff",
            backgroundColor: "#dc2626",
            padding: 12,
            charSpacing: 100,
        }),
    },
    {
        id: "rating",
        label: "Avaliação",
        desc: "Estrelas e nota",
        icon: Star,
        preview: "★★★★★",
        placeholder: "★★★★★ 5.0",
        apply: (t) => t.set({
            fontSize: 36,
            fontFamily: "Inter",
            fontWeight: "700",
            fill: "#facc15",
            stroke: "#854d0e",
            strokeWidth: 0.5,
        }),
    },
]

export const TextStylesPicker: React.FC<TextStylesPickerProps> = ({ isOpen, onClose, canvas }) => {
    const [search, setSearch] = useState("")
    const [selectedFont, setSelectedFont] = useState<string>("Inter")
    const [tab, setTab] = useState<"templates" | "fonts">("templates")

    useEffect(() => {
        if (isOpen) ensureGoogleFontsLoaded()
    }, [isOpen])

    /** Espera a fonte estar disponível antes de adicionar (evita mismatch visual). */
    const waitFont = async (family: string, size = 40) => {
        try {
            // document.fonts.load aceita "<size> '<family>'"
            await (document as any).fonts?.load(`${size}px "${family}"`)
        } catch {
            /* navegadores antigos — segue mesmo assim */
        }
    }

    const addTemplateText = async (template: TextTemplate) => {
        if (!canvas) return
        // Detecta a fonte primária do template e espera carregar
        const probeText = new fabric.IText(template.placeholder, {})
        template.apply(probeText)
        const family = (probeText as any).fontFamily || "Inter"
        await waitFont(family, 60)

        const text = new fabric.IText(template.placeholder, {
            left: canvas.getWidth() / 2 - 100,
            top: canvas.getHeight() / 2 - 30,
            originX: "left",
            originY: "top",
        })
        template.apply(text)
        canvas.add(text)
        canvas.setActiveObject(text)
        canvas.requestRenderAll()
        onClose()
    }

    const addCustomFontText = async (fontFamily: string) => {
        if (!canvas) return
        await waitFont(fontFamily, 40)
        const text = new fabric.IText("Texto editável", {
            left: canvas.getWidth() / 2 - 100,
            top: canvas.getHeight() / 2 - 20,
            fontSize: 40,
            fontFamily,
            fontWeight: "700",
            fill: "#0f172a",
        })
        canvas.add(text)
        canvas.setActiveObject(text)
        canvas.requestRenderAll()
        onClose()
    }

    const filteredFonts = ALL_FONTS.filter(f => f.toLowerCase().includes(search.toLowerCase()))

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Adicionar Texto" className="max-w-2xl">
            <div className="space-y-4 py-2">
                {/* Tabs */}
                <div className="flex border-b border-slate-200">
                    {([
                        { id: "templates", label: "Estilos prontos", icon: Sparkles },
                        { id: "fonts", label: "Escolher fonte", icon: Palette },
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

                {tab === "templates" && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {TEXT_TEMPLATES.map(t => {
                            const Icon = t.icon
                            return (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => addTemplateText(t)}
                                    className="group relative overflow-hidden rounded-xl border-2 border-slate-200 bg-white hover:border-primary hover:shadow-md transition-all p-3 text-left"
                                >
                                    <div className="flex items-center gap-2 mb-2">
                                        <Icon className="h-3.5 w-3.5 text-slate-500" />
                                        <span className="text-[11px] font-black uppercase tracking-wide text-slate-700">
                                            {t.label}
                                        </span>
                                    </div>
                                    <div className="h-16 flex items-center justify-center bg-slate-50 rounded-lg overflow-hidden">
                                        <span style={{
                                            fontFamily: t.id === "neon" || t.id === "shadow3d" ? "Bungee" : t.id === "title" || t.id === "discount" ? "Anton" : t.id === "subtitle" ? "Playfair Display" : t.id === "sale" || t.id === "stamp" ? "Bebas Neue" : t.id === "price" ? "Oswald" : t.id === "quote" ? "Caveat" : "Inter",
                                            fontSize: t.id === "title" || t.id === "sale" ? 22 : 18,
                                            fontWeight: 800,
                                            color: t.id === "sale" || t.id === "stamp" ? "#dc2626" : t.id === "discount" ? "#facc15" : t.id === "price" ? "#16a34a" : t.id === "neon" ? "#06b6d4" : t.id === "shadow3d" ? "#fbbf24" : "#0f172a",
                                            textShadow: t.id === "neon" ? "0 0 12px #06b6d4" : t.id === "shadow3d" ? "3px 3px 0 #92400e" : t.id === "sale" ? "2px 2px 4px rgba(0,0,0,0.3)" : undefined,
                                            WebkitTextStroke: t.id === "outline" ? "1.5px #0f172a" : t.id === "stamp" ? "1.5px #dc2626" : undefined,
                                            ...(t.id === "banner" ? { color: "#fff", padding: "4px 10px", background: "#dc2626" } : {}),
                                            ...(t.id === "outline" ? { color: "transparent" } : {}),
                                        }}>
                                            {t.preview}
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-slate-500 mt-1.5 line-clamp-1">{t.desc}</p>
                                </button>
                            )
                        })}
                    </div>
                )}

                {tab === "fonts" && (
                    <div className="space-y-3">
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Buscar fonte (Roboto, Bebas, Pacifico...)"
                            className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                        />
                        <div className="grid grid-cols-1 gap-1 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
                            {filteredFonts.map(font => (
                                <button
                                    key={font}
                                    type="button"
                                    onMouseEnter={() => setSelectedFont(font)}
                                    onClick={() => addCustomFontText(font)}
                                    className={cn(
                                        "group flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border transition-all text-left",
                                        selectedFont === font
                                            ? "border-primary bg-primary/5"
                                            : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                                    )}
                                >
                                    <div className="flex flex-col min-w-0">
                                        <span style={{ fontFamily: `"${font}", sans-serif` }} className="text-xl font-bold leading-none truncate">
                                            Texto editável
                                        </span>
                                        <span className="text-[10px] text-slate-500 mt-1">{font}</span>
                                    </div>
                                    <span className="text-[10px] font-bold text-primary opacity-0 group-hover:opacity-100">
                                        Adicionar →
                                    </span>
                                </button>
                            ))}
                            {filteredFonts.length === 0 && (
                                <p className="text-center text-sm text-slate-400 py-8">
                                    Nenhuma fonte encontrada
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    )
}
