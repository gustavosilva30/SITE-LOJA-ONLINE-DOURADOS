/**
 * PartPhotoCameraModal
 * ─────────────────────
 * Câmera em tela cheia para capturar fotos de peças no processo de desmontagem de sucata.
 *
 * Modos:
 *  - 'produto' : até maxPhotos fotos da peça (padrão 10)
 *    - Miniatura: toque abre pré-visualização em tela cheia
 *  - 'defeito'  : até maxPhotos fotos de defeito (padrão 3)
 *    - Miniatura: toque abre editor de anotação com desenho a dedo
 *    - Banner "⚠️ DEFEITO" gravado na imagem capturada via canvas
 *    - Overlay vermelho no stream em tempo real
 *
 * Novidades:
 *  - Botão de excluir sempre visível nas miniaturas (não só no hover)
 *  - Editor de anotação por toque (apenas modo defeito):
 *    - Seletor de espessura de traço (Fino / Médio / Grosso)
 *    - Desfazer último traço
 *    - Salva a imagem editada substituindo a original
 */
import { useEffect, useRef, useState, useCallback } from "react"
import { X, Camera, Check, AlertTriangle, Undo2, Pencil, RotateCw } from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Props {
    isOpen: boolean
    mode: "produto" | "defeito"
    maxPhotos?: number
    existingFiles?: File[]
    onSave: (files: File[]) => void
    onClose: () => void
}

interface CapturedPhoto {
    file: File
    previewUrl: string
    rotation: number // acumulado: 0 | 90 | 180 | 270
}

// ─── Helper: girar imagem 90° horário e retornar novo File + URL ─────────────

async function rotateImageFile(
    file: File,
    currentRotation: number
): Promise<{ file: File; previewUrl: string; rotation: number }> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        const objectUrl = URL.createObjectURL(file)
        img.onload = () => {
            const newRotation = (currentRotation + 90) % 360
            const sw = img.naturalWidth
            const sh = img.naturalHeight
            const dw = sh
            const dh = sw
            const canvas = document.createElement("canvas")
            canvas.width = dw
            canvas.height = dh
            const ctx = canvas.getContext("2d")!
            ctx.translate(dw / 2, dh / 2)
            ctx.rotate(Math.PI / 2)
            ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh)
            URL.revokeObjectURL(objectUrl)
            canvas.toBlob(
                (blob) => {
                    if (!blob) return reject(new Error("Blob null"))
                    const ts = new Date().toISOString().replace(/[:.]/g, "-")
                    const newFile = new File([blob], `rotated-${ts}.jpg`, { type: "image/jpeg" })
                    const newPreviewUrl = URL.createObjectURL(blob)
                    resolve({ file: newFile, previewUrl: newPreviewUrl, rotation: newRotation })
                },
                "image/jpeg",
                0.9
            )
        }
        img.onerror = () => {
            URL.revokeObjectURL(objectUrl)
            reject(new Error("Falha ao carregar imagem para rotação"))
        }
        img.src = objectUrl
    })
}

// Tamanhos de pincel disponíveis
const BRUSH_SIZES = [
    { label: "Fino", value: 3, icon: "●" },
    { label: "Médio", value: 7, icon: "●" },
    { label: "Grosso", value: 14, icon: "●" },
]

// ─── Componente principal ─────────────────────────────────────────────────────

export function PartPhotoCameraModal({
    isOpen,
    mode,
    maxPhotos = mode === "defeito" ? 3 : 10,
    existingFiles,
    onSave,
    onClose,
}: Props) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const streamRef = useRef<MediaStream | null>(null)
    // Rastreia TODAS as objectURLs criadas por este componente para limpeza segura
    const trackedUrls = useRef<Set<string>>(new Set())

    const [photos, setPhotos] = useState<CapturedPhoto[]>([])
    const [cameraError, setCameraError] = useState<string | null>(null)
    const [capturing, setCapturing] = useState(false)
    const [previewFull, setPreviewFull] = useState<{ url: string; index: number } | null>(null)
    const [facingMode, setFacingMode] = useState<"environment" | "user">("environment")
    const [rotatingIndex, setRotatingIndex] = useState<number | null>(null)

    // Estado do editor de anotação
    const [annotatingIndex, setAnnotatingIndex] = useState<number | null>(null)

    const isDefect = mode === "defeito"
    const isMaxReached = photos.length >= maxPhotos

    // ── Gerenciamento de objectURLs ────────────────────────────────────────────

    const trackUrl = useCallback((url: string) => {
        trackedUrls.current.add(url)
        return url
    }, [])

    const revokeUrl = useCallback((url: string) => {
        if (trackedUrls.current.has(url)) {
            URL.revokeObjectURL(url)
            trackedUrls.current.delete(url)
        }
    }, [])

    const revokeAll = useCallback(() => {
        trackedUrls.current.forEach((u) => URL.revokeObjectURL(u))
        trackedUrls.current.clear()
    }, [])

    // ── Iniciar câmera ─────────────────────────────────────────────────────────

    const startCamera = useCallback(async (facing: "environment" | "user") => {
        setCameraError(null)
        try {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((t) => t.stop())
            }
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: facing,
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                },
                audio: false,
            })
            streamRef.current = stream
            if (videoRef.current) {
                videoRef.current.srcObject = stream
            }
        } catch (err: any) {
            console.error("[PartPhotoCameraModal] Erro ao acessar câmera:", err)
            setCameraError(
                err?.name === "NotAllowedError"
                    ? "Permissão de câmera negada. Permita o acesso nas configurações do navegador."
                    : err?.name === "NotFoundError"
                    ? "Nenhuma câmera encontrada neste dispositivo."
                    : "Não foi possível acessar a câmera: " + (err?.message || String(err))
            )
        }
    }, [])

    // ── Parar câmera ───────────────────────────────────────────────────────────

    const stopCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop())
            streamRef.current = null
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null
        }
    }, [])

    // ── Montar/desmontar ao abrir/fechar ───────────────────────────────────────

    useEffect(() => {
        if (!isOpen) return
        // Limpar URLs antigas antes de criar novas
        revokeAll()
        if (existingFiles && existingFiles.length > 0) {
            const loaded = existingFiles.map((file) => {
                const url = URL.createObjectURL(file)
                trackUrl(url)
                return { file, previewUrl: url, rotation: 0 as number }
            })
            setPhotos(loaded)
        } else {
            setPhotos([])
        }

        startCamera(facingMode)

        return () => {
            stopCamera()
        }
    }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

    // Trocar câmera
    useEffect(() => {
        if (isOpen) startCamera(facingMode)
    }, [facingMode, isOpen, startCamera])

    // Limpeza total ao desmontar o componente
    useEffect(() => () => { revokeAll() }, [revokeAll])

    // ── Capturar foto ──────────────────────────────────────────────────────────

    const capturePhoto = useCallback(async () => {
        if (!videoRef.current || !canvasRef.current || isMaxReached || capturing) return

        setCapturing(true)
        try {
            const video = videoRef.current
            const canvas = canvasRef.current
            const w = video.videoWidth || 1280
            const h = video.videoHeight || 720
            canvas.width = w
            canvas.height = h

            const ctx = canvas.getContext("2d")!
            if (facingMode === "user") {
                ctx.translate(w, 0)
                ctx.scale(-1, 1)
            }
            ctx.drawImage(video, 0, 0, w, h)
            ctx.setTransform(1, 0, 0, 1, 0, 0)

            if (isDefect) {
                const bannerH = Math.round(h * 0.1)
                const bannerY = h - bannerH
                ctx.fillStyle = "rgba(220, 38, 38, 0.88)"
                ctx.fillRect(0, bannerY, w, bannerH)
                const fontSize = Math.round(bannerH * 0.55)
                ctx.font = `900 ${fontSize}px Arial, sans-serif`
                ctx.fillStyle = "#ffffff"
                ctx.textAlign = "center"
                ctx.textBaseline = "middle"
                ctx.fillText("⚠️  DEFEITO", w / 2, bannerY + bannerH / 2)
                ctx.strokeStyle = "#dc2626"
                ctx.lineWidth = Math.round(w * 0.012)
                ctx.strokeRect(
                    ctx.lineWidth / 2,
                    ctx.lineWidth / 2,
                    w - ctx.lineWidth,
                    h - ctx.lineWidth
                )
            }

            canvas.toBlob(
                (blob) => {
                    if (!blob) { setCapturing(false); return }
                    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
                    const filename = `${mode}-${timestamp}.jpg`
                    const file = new File([blob], filename, { type: "image/jpeg" })
                    const previewUrl = URL.createObjectURL(blob)
                    trackUrl(previewUrl)
                    setPhotos((prev) => [...prev, { file, previewUrl, rotation: 0 }])
                    setCapturing(false)
                },
                "image/jpeg",
                0.80
            )
        } catch (err) {
            console.error("[PartPhotoCameraModal] Erro ao capturar:", err)
            setCapturing(false)
        }
    }, [isMaxReached, capturing, isDefect, mode, facingMode, trackUrl])

    // ── Excluir foto ───────────────────────────────────────────────────────────

    const deletePhoto = useCallback((index: number) => {
        setPhotos((prev) => {
            const next = [...prev]
            revokeUrl(next[index].previewUrl)
            next.splice(index, 1)
            return next
        })
    }, [revokeUrl])

    // ── Girar foto ─────────────────────────────────────────────────────────────

    const rotatePhoto = useCallback(async (index: number) => {
        if (rotatingIndex !== null) return
        setRotatingIndex(index)
        try {
            const photo = photos[index]
            const result = await rotateImageFile(photo.file, photo.rotation)
            revokeUrl(photo.previewUrl)
            trackUrl(result.previewUrl)
            setPhotos((prev) => {
                const next = [...prev]
                next[index] = result
                return next
            })
            setPreviewFull((prev) =>
                prev && prev.index === index ? { url: result.previewUrl, index } : prev
            )
        } catch (err) {
            console.error("[PartPhotoCameraModal] Erro ao girar foto:", err)
        } finally {
            setRotatingIndex(null)
        }
    }, [photos, rotatingIndex, revokeUrl, trackUrl])

    // ── Substituir foto anotada ─────────────────────────────────────────────────

    const replacePhoto = useCallback((index: number, newFile: File, newPreviewUrl: string) => {
        setPhotos((prev) => {
            const next = [...prev]
            revokeUrl(next[index].previewUrl)
            trackUrl(newPreviewUrl)
            next[index] = { file: newFile, previewUrl: newPreviewUrl, rotation: 0 }
            return next
        })
    }, [revokeUrl, trackUrl])

    // ── Confirmar ──────────────────────────────────────────────────────────────

    const handleConfirm = () => {
        stopCamera()
        onSave(photos.map((p) => p.file))
    }

    const handleClose = () => {
        stopCamera()
        setPreviewFull(null)
        onClose()
    }

    // ── Abrir miniatura ────────────────────────────────────────────────────────

    const handleThumbnailTap = (index: number) => {
        if (isDefect) {
            // Modo defeito: abre editor de anotação
            setAnnotatingIndex(index)
        } else {
            // Modo produto: abre pré-visualização
            setPreviewFull({ url: photos[index].previewUrl, index })
        }
    }

    // Fallback: recriar objectURL se a imagem falhar ao exibir
    const handleImgError = useCallback((index: number, imgEl: HTMLImageElement) => {
        const photo = photos[index]
        if (!photo?.file) return
        const newUrl = URL.createObjectURL(photo.file)
        trackUrl(newUrl)
        imgEl.src = newUrl
    }, [photos, trackUrl])

    if (!isOpen) return null

    return (
        <>
            {/* ── Câmera em tela cheia ── */}
            <div
                className="fixed inset-0 w-full h-[100dvh] z-[200] flex flex-col bg-black overflow-hidden"
                style={{ touchAction: "none" }}
            >
                {/* Barra superior */}
                <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-3 py-2 bg-gradient-to-b from-black/80 to-transparent">
                    <button
                        type="button"
                        onClick={handleClose}
                        className="flex items-center justify-center w-10 h-10 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                        aria-label="Fechar câmera"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    <div className="flex items-center gap-2">
                        {isDefect ? (
                            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-600/90 text-white text-xs font-black uppercase tracking-wider shadow-lg">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                Foto de Defeito
                            </span>
                        ) : (
                            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-600/90 text-white text-xs font-black uppercase tracking-wider shadow-lg">
                                <Camera className="w-3.5 h-3.5" />
                                Foto da Peça
                            </span>
                        )}
                        <span className="text-white text-xs font-bold opacity-80">
                            {photos.length}/{maxPhotos}
                        </span>
                    </div>
                </div>

                {/* Área principal: vídeo + miniaturas */}
                <div className="flex flex-1 min-h-0 relative">
                    {/* Stream de vídeo */}
                    <div className="relative flex-1 min-w-0 bg-black overflow-hidden">
                        {cameraError ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                                <Camera className="w-16 h-16 text-white/20 mb-4" />
                                <p className="text-white/70 text-sm leading-relaxed">{cameraError}</p>
                                <button
                                    type="button"
                                    onClick={() => startCamera(facingMode)}
                                    className="mt-4 px-4 py-2 rounded-lg bg-white/10 text-white text-sm font-bold hover:bg-white/20"
                                >
                                    Tentar novamente
                                </button>
                            </div>
                        ) : (
                            <>
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    className={cn(
                                        "absolute inset-0 w-full h-full object-cover",
                                        facingMode === "user" && "scale-x-[-1]"
                                    )}
                                />
                                {isDefect && (
                                    <>
                                        <div className="absolute inset-0 border-[6px] border-red-600 pointer-events-none" />
                                        <div className="absolute bottom-0 left-0 right-0 h-[10%] bg-red-700/70 flex items-center justify-center pointer-events-none">
                                            <span className="text-white font-black text-lg tracking-widest uppercase flex items-center gap-2">
                                                <AlertTriangle className="w-5 h-5" /> DEFEITO
                                            </span>
                                        </div>
                                    </>
                                )}
                                {capturing && (
                                    <div className="absolute inset-0 bg-white/40 pointer-events-none animate-ping" />
                                )}
                            </>
                        )}
                    </div>

                    {/* Coluna de miniaturas (lateral direita) */}
                    {photos.length > 0 && (
                        <div className="flex flex-col gap-2 p-2 bg-black/70 overflow-y-auto w-20 shrink-0">
                            {photos.map((photo, i) => (
                                <div key={i} className="relative flex-shrink-0">
                                    {/* Miniatura clicável */}
                                    <button
                                        type="button"
                                        onClick={() => handleThumbnailTap(i)}
                                        className={cn(
                                            "block w-full aspect-square rounded-lg overflow-hidden border-2 transition-colors",
                                            isDefect
                                                ? "border-red-400/60 hover:border-red-300 active:border-red-200"
                                                : "border-white/30 hover:border-white"
                                        )}
                                        aria-label={isDefect ? `Editar foto ${i + 1}` : `Ver foto ${i + 1}`}
                                    >
                                        <img
                                            src={photo.previewUrl}
                                            alt={`Foto ${i + 1}`}
                                            className="w-full h-full object-cover"
                                            onError={(e) => handleImgError(i, e.currentTarget)}
                                        />
                                    </button>

                                    {/* Indicador de modo: ícone lápis (defeito) para indicar que pode editar */}
                                    {isDefect && (
                                        <span className="absolute bottom-0.5 left-0.5 bg-red-600/90 text-white rounded-full p-0.5 pointer-events-none">
                                            <Pencil className="w-2.5 h-2.5" />
                                        </span>
                                    )}

                                    {/* Número da foto */}
                                    <span className="absolute top-0.5 left-0.5 bg-black/70 text-white text-[9px] font-bold rounded px-1">
                                        {i + 1}
                                    </span>

                                    {/* Botão Girar */}
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); rotatePhoto(i) }}
                                        disabled={rotatingIndex !== null}
                                        className="absolute bottom-0.5 right-0.5 w-5 h-5 rounded-full bg-blue-600/90 text-white flex items-center justify-center shadow-md active:bg-blue-700 disabled:opacity-50 transition-colors"
                                        aria-label={`Girar foto ${i + 1}`} title="Girar 90°"
                                    >
                                        <RotateCw className={cn("w-3 h-3", rotatingIndex === i && "animate-spin")} />
                                    </button>

                                    {/* Botão excluir — sempre visível em mobile */}
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); deletePhoto(i) }}
                                        className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center shadow-md active:bg-red-700 transition-colors"
                                        aria-label={`Excluir foto ${i + 1}`}
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Barra inferior: botão de captura + trocar câmera + salvar */}
                <div className="relative flex items-center justify-between px-4 sm:px-8 pb-safe py-4 bg-gradient-to-t from-black/80 to-transparent min-h-[100px] shrink-0">
                    <button
                        type="button"
                        onClick={() => setFacingMode((f) => (f === "environment" ? "user" : "environment"))}
                        className="flex items-center justify-center w-12 h-12 rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors z-10"
                        title="Trocar câmera"
                    >
                        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 4v6h6" /><path d="M23 20v-6h-6" />
                            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" />
                        </svg>
                    </button>

                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                        <button
                            type="button"
                            onClick={capturePhoto}
                            disabled={isMaxReached || !!cameraError || capturing}
                            className={cn(
                                "relative flex items-center justify-center rounded-full transition-all shadow-2xl w-20 h-20",
                                isMaxReached || !!cameraError
                                    ? "opacity-40 cursor-not-allowed"
                                    : isDefect
                                    ? "bg-red-500 hover:bg-red-400 active:scale-95 ring-4 ring-red-700"
                                    : "bg-white hover:bg-white/90 active:scale-95 ring-4 ring-white/40"
                            )}
                            aria-label="Tirar foto"
                        >
                            {isDefect ? (
                                <AlertTriangle className="w-9 h-9 text-white" />
                            ) : (
                                <div className="w-14 h-14 rounded-full border-4 border-gray-400 bg-white" />
                            )}
                            {capturing && (
                                <span className="absolute inset-0 rounded-full bg-white/50 animate-ping" />
                            )}
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={photos.length === 0}
                        className={cn(
                            "flex items-center gap-1.5 px-5 py-3 rounded-full text-sm font-black uppercase transition-colors shadow-xl z-10",
                            photos.length > 0
                                ? "bg-emerald-500 hover:bg-emerald-400 text-white"
                                : "bg-white/20 text-white/40 cursor-not-allowed"
                        )}
                    >
                        <Check className="w-5 h-5" />
                        Salvar
                    </button>
                </div>
            </div>

            {/* Canvas oculto para captura */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Pré-visualização full (modo produto) */}
            {previewFull && (
                <div
                    className="fixed inset-0 w-full h-[100dvh] z-[300] flex items-center justify-center bg-black/95 p-4"
                    onClick={() => setPreviewFull(null)}
                >
                    <img
                        src={previewFull.url}
                        alt="Preview"
                        className="max-w-full max-h-[78vh] object-contain rounded-xl shadow-2xl"
                        onError={(e) => {
                            const photo = photos[previewFull.index]
                            if (photo?.file) {
                                const newUrl = URL.createObjectURL(photo.file)
                                trackUrl(newUrl)
                                e.currentTarget.src = newUrl
                                setPreviewFull({ url: newUrl, index: previewFull.index })
                            }
                        }}
                    />

                    {/* Controles inferiores */}
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                        <button
                            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-blue-600/90 text-white text-sm font-bold hover:bg-blue-500 transition-colors shadow-lg disabled:opacity-50"
                            onClick={async () => { await rotatePhoto(previewFull.index) }}
                            disabled={rotatingIndex !== null}>
                            <RotateCw className={cn("w-4 h-4", rotatingIndex === previewFull.index && "animate-spin")} />
                            Girar
                        </button>
                        <span className="px-3 py-2 rounded-full bg-black/60 text-white text-sm font-bold">
                            {previewFull.index + 1} / {photos.length}
                        </span>
                        <button className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-black/60 text-white text-sm font-bold hover:bg-black/80 transition-colors"
                            onClick={() => setPreviewFull(null)}>
                            <X className="w-4 h-4" /> Fechar
                        </button>
                    </div>

                    {/* Fechar X */}
                    <button className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                        onClick={() => setPreviewFull(null)}>
                        <X className="w-5 h-5" />
                    </button>

                    {/* Seta anterior */}
                    {photos.length > 1 && previewFull.index > 0 && (
                        <button className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                            onClick={(e) => { e.stopPropagation(); setPreviewFull({ url: photos[previewFull.index - 1].previewUrl, index: previewFull.index - 1 }) }}>
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6" /></svg>
                        </button>
                    )}

                    {/* Seta próxima */}
                    {photos.length > 1 && previewFull.index < photos.length - 1 && (
                        <button className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                            onClick={(e) => { e.stopPropagation(); setPreviewFull({ url: photos[previewFull.index + 1].previewUrl, index: previewFull.index + 1 }) }}>
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6" /></svg>
                        </button>
                    )}
                </div>
            )}

            {/* Editor de anotação (modo defeito) */}
            {annotatingIndex !== null && photos[annotatingIndex] && (
                <AnnotationEditor
                    photoUrl={photos[annotatingIndex].previewUrl}
                    photoFile={photos[annotatingIndex].file}
                    photoIndex={annotatingIndex}
                    onSave={(newFile, newPreviewUrl) => {
                        replacePhoto(annotatingIndex, newFile, newPreviewUrl)
                        setAnnotatingIndex(null)
                    }}
                    onClose={() => setAnnotatingIndex(null)}
                    onRotate={async () => {
                        await rotatePhoto(annotatingIndex)
                        setAnnotatingIndex(null)
                    }}
                />
            )}
        </>
    )
}

// ─── Editor de anotação ───────────────────────────────────────────────────────

interface AnnotationEditorProps {
    photoUrl: string
    photoFile: File
    photoIndex: number
    onSave: (file: File, previewUrl: string) => void
    onClose: () => void
    onRotate?: () => Promise<void>
}

interface Stroke {
    points: { x: number; y: number }[]
    color: string
    width: number
}

function AnnotationEditor({ photoUrl, photoFile, photoIndex, onSave, onClose, onRotate }: AnnotationEditorProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const imageRef = useRef<HTMLImageElement | null>(null)

    const [brushSize, setBrushSize] = useState(7)
    const [strokes, setStrokes] = useState<Stroke[]>([])
    const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null)
    const [imageLoaded, setImageLoaded] = useState(false)
    const [saving, setSaving] = useState(false)
    const [rotating, setRotating] = useState(false)

    // Cor fixa: vermelho vivo para marcar defeitos
    const DRAW_COLOR = "#ff2020"

    // ── Carregar e desenhar a imagem base ──────────────────────────────────────

    const redrawAll = useCallback((
        ctx: CanvasRenderingContext2D,
        img: HTMLImageElement,
        strokesToDraw: Stroke[],
        activeStroke?: Stroke | null
    ) => {
        const { width, height } = ctx.canvas
        ctx.clearRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)

        const allStrokes = activeStroke ? [...strokesToDraw, activeStroke] : strokesToDraw
        for (const stroke of allStrokes) {
            if (stroke.points.length < 2) continue
            ctx.beginPath()
            ctx.strokeStyle = stroke.color
            ctx.lineWidth = stroke.width
            ctx.lineCap = "round"
            ctx.lineJoin = "round"
            ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
            for (let i = 1; i < stroke.points.length; i++) {
                ctx.lineTo(stroke.points[i].x, stroke.points[i].y)
            }
            ctx.stroke()
        }
    }, [])

    useEffect(() => {
        setImageLoaded(false)
        setStrokes([])
        const img = new Image()
        img.crossOrigin = "anonymous"
        img.onload = () => { imageRef.current = img; setImageLoaded(true) }
        img.onerror = () => {
            // Fallback: tenta via objectURL do arquivo
            const url = URL.createObjectURL(photoFile)
            const img2 = new Image()
            img2.onload = () => { imageRef.current = img2; setImageLoaded(true); URL.revokeObjectURL(url) }
            img2.src = url
        }
        img.src = photoUrl
    }, [photoUrl, photoFile])

    useEffect(() => {
        if (!imageLoaded || !canvasRef.current || !imageRef.current || !containerRef.current) return
        const canvas = canvasRef.current
        const container = containerRef.current
        const img = imageRef.current

        // Ajusta canvas ao tamanho do container mantendo aspect ratio da imagem
        const containerW = container.clientWidth
        const containerH = container.clientHeight
        const imgAspect = img.naturalWidth / img.naturalHeight
        const containerAspect = containerW / containerH

        let drawW: number, drawH: number
        if (imgAspect > containerAspect) {
            drawW = containerW
            drawH = containerW / imgAspect
        } else {
            drawH = containerH
            drawW = containerH * imgAspect
        }

        canvas.width = drawW
        canvas.height = drawH

        const ctx = canvas.getContext("2d")!
        redrawAll(ctx, img, strokes)
    }, [imageLoaded, strokes, redrawAll])

    // ── Helpers de posição (mouse e touch) ────────────────────────────────────

    const getPos = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
        const canvas = canvasRef.current!
        const rect = canvas.getBoundingClientRect()
        const scaleX = canvas.width / rect.width
        const scaleY = canvas.height / rect.height
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY,
        }
    }

    // ── Eventos de desenho (Pointer API: unifica mouse e touch) ───────────────

    const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        e.preventDefault()
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        const pos = getPos(e)
        setCurrentStroke({ points: [pos], color: DRAW_COLOR, width: brushSize })
    }

    const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!currentStroke) return
        e.preventDefault()
        const pos = getPos(e)
        const updated = { ...currentStroke, points: [...currentStroke.points, pos] }
        setCurrentStroke(updated)

        // Desenho em tempo real
        const ctx = canvasRef.current?.getContext("2d")
        if (ctx && imageRef.current) {
            redrawAll(ctx, imageRef.current, strokes, updated)
        }
    }

    const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
        e.preventDefault()
        if (!currentStroke || currentStroke.points.length < 1) {
            setCurrentStroke(null)
            return
        }
        // Finalizar traço
        const finalStroke = currentStroke
        setStrokes((prev) => [...prev, finalStroke])
        setCurrentStroke(null)
    }

    // ── Desfazer último traço ──────────────────────────────────────────────────

    const handleUndo = () => {
        setStrokes((prev) => {
            const next = prev.slice(0, -1)
            const ctx = canvasRef.current?.getContext("2d")
            if (ctx && imageRef.current) redrawAll(ctx, imageRef.current, next)
            return next
        })
    }

    // ── Girar foto no editor ───────────────────────────────────────────────────

    const handleRotateInEditor = async () => {
        if (rotating || !onRotate) return
        setRotating(true)
        try { await onRotate() } catch (err) { console.error("[AnnotationEditor] Girar:", err) } finally { setRotating(false) }
    }

    // ── Salvar imagem editada ──────────────────────────────────────────────────

    const handleSave = async () => {
        if (!canvasRef.current || !imageRef.current) return
        setSaving(true)

        // Gerar imagem final em resolução original
        const finalCanvas = document.createElement("canvas")
        finalCanvas.width = imageRef.current.naturalWidth
        finalCanvas.height = imageRef.current.naturalHeight
        const finalCtx = finalCanvas.getContext("2d")!

        // Escala dos traços: canvas de edição → resolução original
        const scaleX = imageRef.current.naturalWidth / (canvasRef.current?.width || 1)
        const scaleY = imageRef.current.naturalHeight / (canvasRef.current?.height || 1)

        finalCtx.drawImage(imageRef.current, 0, 0)

        // Redesenhar traços na escala original
        for (const stroke of strokes) {
            if (stroke.points.length < 2) continue
            finalCtx.beginPath()
            finalCtx.strokeStyle = stroke.color
            finalCtx.lineWidth = stroke.width * Math.max(scaleX, scaleY)
            finalCtx.lineCap = "round"
            finalCtx.lineJoin = "round"
            finalCtx.moveTo(stroke.points[0].x * scaleX, stroke.points[0].y * scaleY)
            for (let i = 1; i < stroke.points.length; i++) {
                finalCtx.lineTo(stroke.points[i].x * scaleX, stroke.points[i].y * scaleY)
            }
            finalCtx.stroke()
        }

        finalCanvas.toBlob(
            (blob) => {
                if (!blob) { setSaving(false); return }
                const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
                const newFile = new File([blob], `defeito-anotado-${timestamp}.jpg`, { type: "image/jpeg" })
                const newPreviewUrl = URL.createObjectURL(blob)
                onSave(newFile, newPreviewUrl)
                setSaving(false)
            },
            "image/jpeg",
            0.92
        )
    }

    return (
        <div className="fixed inset-0 w-full h-[100dvh] z-[300] flex flex-col bg-black overflow-hidden" style={{ touchAction: "none" }}>
            {/* Barra superior */}
            <div className="flex items-center justify-between px-3 py-2 bg-black/90 border-b border-white/10 shrink-0">
                <button
                    type="button"
                    onClick={onClose}
                    className="flex items-center justify-center w-10 h-10 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>

                <div className="flex flex-col items-center">
                    <span className="text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                        <Pencil className="w-3.5 h-3.5 text-red-400" />
                        Marcar Defeito
                    </span>
                    <span className="text-white/40 text-[9px]">Foto {photoIndex + 1} — desenhe com o dedo</span>
                </div>

                <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-black uppercase transition-colors shadow-lg disabled:opacity-50"
                >
                    <Check className="w-4 h-4" />
                    {saving ? "Salvando..." : "Pronto"}
                </button>
            </div>

            {/* Seletor de espessura + desfazer + girar */}
            <div className="flex items-center justify-center gap-3 py-2 px-3 bg-black/80 border-b border-white/10 shrink-0 flex-wrap">
                <span className="text-white/50 text-[10px] uppercase font-bold tracking-wider shrink-0">Espessura:</span>
                {BRUSH_SIZES.map((b) => (
                    <button
                        key={b.value}
                        type="button"
                        onClick={() => setBrushSize(b.value)}
                        className={cn(
                            "flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-all",
                            brushSize === b.value
                                ? "bg-red-500/30 ring-1 ring-red-400"
                                : "hover:bg-white/10"
                        )}
                        title={b.label}
                    >
                        <span
                            className="rounded-full bg-red-500 block"
                            style={{
                                width: `${b.value * 1.8}px`,
                                height: `${b.value * 1.8}px`,
                                maxWidth: "22px",
                                maxHeight: "22px",
                                minWidth: "6px",
                                minHeight: "6px",
                            }}
                        />
                        <span className="text-[8px] text-white/50 font-bold">{b.label}</span>
                    </button>
                ))}

                <div className="w-px h-6 bg-white/10 mx-1" />

                <button
                    type="button"
                    onClick={handleUndo}
                    disabled={strokes.length === 0}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-white/70 hover:bg-white/10 disabled:opacity-30 transition-colors"
                    title="Desfazer último traço"
                >
                    <Undo2 className="w-4 h-4" />
                    <span className="text-[9px] font-bold">Desfazer</span>
                </button>

                {onRotate && (
                    <>
                        <div className="w-px h-6 bg-white/10 mx-1" />
                        <button
                            type="button"
                            onClick={handleRotateInEditor}
                            disabled={rotating || strokes.length > 0}
                            title={strokes.length > 0 ? "Salve ou desfaça os traços antes de girar" : "Girar foto 90°"}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-blue-300 hover:bg-white/10 disabled:opacity-30 transition-colors"
                        >
                            <RotateCw className={cn("w-4 h-4", rotating && "animate-spin")} />
                            <span className="text-[9px] font-bold">Girar</span>
                        </button>
                    </>
                )}
            </div>

            {/* Canvas de edição */}
            <div
                ref={containerRef}
                className="flex-1 min-h-0 flex items-center justify-center bg-black/95 overflow-hidden relative"
            >
                {!imageLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                )}
                <canvas
                    ref={canvasRef}
                    className={cn(
                        "touch-none select-none cursor-crosshair rounded-sm shadow-2xl",
                        "max-w-full max-h-full",
                        !imageLoaded && "opacity-0"
                    )}
                    style={{ touchAction: "none" }}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerLeave={onPointerUp}
                />

                {/* Dica visual quando sem traços */}
                {imageLoaded && strokes.length === 0 && (
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-black/70 text-white/60 text-xs font-medium pointer-events-none">
                        <Pencil className="w-3.5 h-3.5 text-red-400 shrink-0" />
                        Toque e arraste para marcar o defeito
                    </div>
                )}
            </div>
        </div>
    )
}
