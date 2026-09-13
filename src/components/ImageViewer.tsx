import { motion, AnimatePresence } from "framer-motion"
import { X, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, RotateCw, Save, Loader2, RectangleHorizontal, RectangleVertical, Maximize2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { getPortalRoot } from "@/lib/portalRoot"

type ViewFrameMode = "landscape" | "portrait" | "auto"

interface ImageViewerProps {
    images: string[]
    initialIndex?: number
    alt?: string
    isOpen: boolean
    onClose: () => void
    /** Quando definido, mostra ação para gravar a rotação atual na galeria do cadastro (pixels). */
    onSaveRotation?: (imageIndex: number, rotationDeg: number) => void | Promise<void>
    saveRotationLoading?: boolean
}

export function ImageViewer({
    images,
    initialIndex = 0,
    alt,
    isOpen,
    onClose,
    onSaveRotation,
    saveRotationLoading,
}: ImageViewerProps) {
    const [currentIndex, setCurrentIndex] = useState(initialIndex)
    const [scale, setScale] = useState(1)
    const [rotationDeg, setRotationDeg] = useState(0)
    /** Paisagem: área larga (melhor para peças horizontais); Retrato: faixa alta; Auto: legado equilibrado. */
    const [viewFrame, setViewFrame] = useState<ViewFrameMode>("landscape")

    const currentSrc = images.length > 0 ? images[Math.min(currentIndex, images.length - 1)] : ""

    useEffect(() => {
        if (isOpen) {
            setCurrentIndex(initialIndex)
            setScale(1)
            setRotationDeg(0)
            setViewFrame("landscape")
        }
    }, [isOpen, initialIndex])

    useEffect(() => {
        if (!isOpen) return
        setRotationDeg(0)
        setScale(1)
    }, [currentSrc, isOpen])

    const handleNext = useCallback(() => {
        if (images.length <= 1) return
        setCurrentIndex((prev) => (prev + 1) % images.length)
        setScale(1)
        setRotationDeg(0)
    }, [images.length])

    const handlePrev = useCallback(() => {
        if (images.length <= 1) return
        setCurrentIndex((prev) => (prev - 1 + images.length) % images.length)
        setScale(1)
        setRotationDeg(0)
    }, [images.length])

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose()
            if (e.key === "ArrowRight") handleNext()
            if (e.key === "ArrowLeft") handlePrev()
            if (e.key === "r" || e.key === "R") {
                e.preventDefault()
                setRotationDeg((d) => (d + 90) % 360)
            }
        }
        if (isOpen) {
            document.body.style.overflow = "hidden"
            window.addEventListener("keydown", handleKeyDown)
        }
        return () => {
            document.body.style.overflow = "unset"
            window.removeEventListener("keydown", handleKeyDown)
        }
    }, [isOpen, onClose, handleNext, handlePrev])

    if (!images || images.length === 0) return null

    const rotationNorm = ((rotationDeg % 360) + 360) % 360
    const showSaveRotation =
        Boolean(onSaveRotation) && (rotationNorm !== 0 || Boolean(saveRotationLoading))
    const canSaveRotation = Boolean(onSaveRotation) && rotationNorm !== 0 && !saveRotationLoading

    const portalRoot = getPortalRoot("portal-imageviewer-root")
    if (!portalRoot) return null

    return createPortal(
        <AnimatePresence mode="wait">
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 md:p-10">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 cursor-zoom-out"
                        onClick={onClose}
                    />

                    {/* Controls */}
                    <div className="absolute top-4 right-4 z-[110] flex max-w-[calc(100vw-1rem)] flex-wrap justify-end gap-2">
                        <button
                            onClick={() => setScale(s => Math.min(s + 0.5, 3))}
                            className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors backdrop-blur-md"
                            title="Aumentar Zoom"
                        >
                            <ZoomIn className="w-6 h-6" />
                        </button>
                        <button
                            onClick={() => setScale(s => Math.max(s - 0.5, 0.5))}
                            className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors backdrop-blur-md"
                            title="Diminuir Zoom"
                        >
                            <ZoomOut className="w-6 h-6" />
                        </button>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation()
                                setRotationDeg((d) => (d + 90) % 360)
                            }}
                            className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors backdrop-blur-md"
                            title="Girar 90° (atalho: R)"
                        >
                            <RotateCw className="w-6 h-6" />
                        </button>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation()
                                setViewFrame("landscape")
                            }}
                            className={`p-2 rounded-full transition-colors backdrop-blur-md ${
                                viewFrame === "landscape"
                                    ? "bg-white/25 text-white ring-1 ring-white/40"
                                    : "bg-white/10 hover:bg-white/20 text-white"
                            }`}
                            title="Enquadrar em paisagem (área larga — padrão)"
                        >
                            <RectangleHorizontal className="w-6 h-6" />
                        </button>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation()
                                setViewFrame("portrait")
                            }}
                            className={`p-2 rounded-full transition-colors backdrop-blur-md ${
                                viewFrame === "portrait"
                                    ? "bg-white/25 text-white ring-1 ring-white/40"
                                    : "bg-white/10 hover:bg-white/20 text-white"
                            }`}
                            title="Enquadrar em retrato (faixa vertical)"
                        >
                            <RectangleVertical className="w-6 h-6" />
                        </button>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation()
                                setViewFrame("auto")
                            }}
                            className={`p-2 rounded-full transition-colors backdrop-blur-md ${
                                viewFrame === "auto"
                                    ? "bg-white/25 text-white ring-1 ring-white/40"
                                    : "bg-white/10 hover:bg-white/20 text-white"
                            }`}
                            title="Automático (largura e altura iguais ao antigo)"
                        >
                            <Maximize2 className="w-6 h-6" />
                        </button>
                        {showSaveRotation && (
                            <button
                                type="button"
                                disabled={!canSaveRotation}
                                onClick={async (e) => {
                                    e.stopPropagation()
                                    if (!onSaveRotation || !canSaveRotation) return
                                    await onSaveRotation(currentIndex, rotationDeg)
                                }}
                                className="p-2 bg-emerald-600/90 hover:bg-emerald-500 disabled:opacity-40 disabled:pointer-events-none text-white rounded-full transition-colors backdrop-blur-md"
                                title="Gravar esta rotação na foto do cadastro (será salva no arquivo)"
                            >
                                {saveRotationLoading ? (
                                    <Loader2 className="w-6 h-6 animate-spin" />
                                ) : (
                                    <Save className="w-6 h-6" />
                                )}
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors backdrop-blur-md"
                            title="Fechar"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Navigation Arrows */}
                    {images.length > 1 && (
                        <>
                            <button
                                onClick={(e) => { e.stopPropagation(); handlePrev(); }}
                                className="absolute left-4 md:left-10 z-[110] p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors backdrop-blur-md"
                            >
                                <ChevronLeft className="w-8 h-8" />
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); handleNext(); }}
                                className="absolute right-4 md:right-10 z-[110] p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors backdrop-blur-md"
                            >
                                <ChevronRight className="w-8 h-8" />
                            </button>

                            {/* Pagination Indicator */}
                            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-[110] flex gap-2 bg-black/40 px-3 py-1.5 rounded-full backdrop-blur-sm border border-white/10">
                                {images.map((_, i) => (
                                    <div
                                        key={i}
                                        className={`w-1.5 h-1.5 rounded-full transition-all ${i === currentIndex ? "bg-white scale-125 w-3" : "bg-white/30"}`}
                                    />
                                ))}
                            </div>
                        </>
                    )}

                    <motion.div
                        key={`${currentSrc}-${viewFrame}`}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.2 }}
                        className={[
                            "relative z-[105] flex items-center justify-center pointer-events-none w-full px-2",
                            viewFrame === "landscape"
                                ? "min-h-0 max-h-[min(92vh,100dvh-6rem)]"
                                : viewFrame === "portrait"
                                  ? "min-h-0 max-h-[92vh]"
                                  : "max-w-full max-h-full",
                        ].join(" ")}
                    >
                        <motion.img
                            src={currentSrc}
                            alt={alt || `Imagem ${currentIndex + 1}`}
                            animate={{ scale, rotate: rotationDeg }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            className={[
                                "object-contain shadow-2xl rounded-lg pointer-events-auto",
                                viewFrame === "landscape" &&
                                    "max-w-[min(98vw,1680px)] max-h-[min(72vw,88vh,calc(100dvh-8rem))] w-auto h-auto",
                                viewFrame === "portrait" &&
                                    "max-w-[min(92vw,520px)] max-h-[min(90vh,100dvh-8rem)] w-auto h-auto",
                                viewFrame === "auto" && "max-w-[95vw] max-h-[85vh] w-auto h-auto",
                            ]
                                .filter(Boolean)
                                .join(" ")}
                            drag={scale > 1}
                            dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                            dragElastic={0.1}
                            draggable
                        />
                    </motion.div>

                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[110] text-white/50 text-[10px] font-medium pointer-events-none uppercase tracking-widest bg-black/20 px-4 py-1.5 rounded-full backdrop-blur-sm border border-white/5 max-w-[95vw] text-center leading-snug">
                        {currentIndex + 1} / {images.length} • ESC fechar • Setas • R girar • Ícones retângulo = paisagem / retrato / auto
                        {onSaveRotation ? " • Verde = gravar rotação" : ""}
                    </div>
                </div>
            )}
        </AnimatePresence>,
        portalRoot
    )
}
