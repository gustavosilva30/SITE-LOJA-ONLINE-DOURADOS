import React, { useEffect, useRef, useState, useCallback } from "react"
// @ts-ignore
import { fabric } from "fabric"
import { Modal } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { Toolbar, EditorMode } from "./Toolbar"
import { PropertiesPanel } from "./PropertiesPanel"
import { FilterPresets } from "./FilterPresets"
import { AdjustmentsPro } from "./AdjustmentsPro"
import { LayersPanel } from "./LayersPanel"
import { ExportMenu } from "./ExportMenu"
import { KeyboardShortcutsHelp } from "./KeyboardShortcutsHelp"
import { TextStylesPicker } from "./TextStylesPicker"
import { ShapeTemplatesPicker } from "./ShapeTemplatesPicker"
import { useEditorHistory } from "./hooks/useEditorHistory"
import { Loader2, Save, Undo2, Redo2, Download, Send, UploadCloud, Sliders, Sparkles, Layers, Keyboard, X, ZoomIn, ZoomOut, Maximize2 } from "lucide-react"
import { getApiBaseUrl } from "@/lib/apiBase"
import { getAuthToken } from "@/lib/auth"
import { toast } from "sonner"
import { WhatsAppContactPicker } from "../WhatsAppContactPicker"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import { trimImage } from "@/lib/imageTrim"

interface ImageEditorModalProps {
    /** URL da imagem que será editada. */
    imageUrl?: string
    isOpen: boolean
    onClose: () => void
    /** Callback após salvar com sucesso. Recebe a URL da nova imagem (ou o blob, se preferir).  */
    onSave?: (newUrl: string) => void
    /** UUID do produto, usado para substituir a foto via /api/admin/replace-produto-imagem. */
    produtoId?: string
    /** Lista de todas as fotos do produto para exibição de miniaturas */
    allUrls?: string[]
    /** Telefone para envio direto via WhatsApp */
    whatsappPhone?: string
}

/** Tamanho máximo do canvas (a imagem é reduzida proporcionalmente para caber). */
const CANVAS_MAX_WIDTH = 1100
const CANVAS_MAX_HEIGHT = 700

export const ImageEditorModal: React.FC<ImageEditorModalProps> = ({
    imageUrl,
    isOpen,
    onClose,
    onSave,
    produtoId,
    allUrls = [],
    whatsappPhone,
}) => {
    const canvasElRef = useRef<HTMLCanvasElement>(null)
    const fabricRef = useRef<any>(null) // canvas fabric (para evitar re-renders)
    const imageObjectRef = useRef<any>(null) // a fabric.Image principal

    const [fabricCanvas, setFabricCanvas] = useState<any>(null)
    const [imageObject, setImageObject] = useState<any>(null)
    const [currentImageUrl, setCurrentImageUrl] = useState(imageUrl)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [mode, setMode] = useState<EditorMode>("select")
    const [replaceOriginal, setReplaceOriginal] = useState(true)
    const [cropRatio, setCropRatio] = useState<"1:1" | "4:3" | "free">("1:1")
    const [cropRect, setCropRect] = useState<any>(null)
    const [eraserSize, setEraserSize] = useState(20)

    // Estados de Compartilhamento
    const [isContactPickerOpen, setIsContactPickerOpen] = useState(false)
    const [sendingWhatsApp, setSendingWhatsApp] = useState(false)
    const [isTransparent, setIsTransparent] = useState(false)

    // Novos Estados
    const [isStudioPickerOpen, setIsStudioPickerOpen] = useState(false)
    const [isBadgePickerOpen, setIsBadgePickerOpen] = useState(false)
    const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false)

    // ─── Pro: tabs do painel direito + modais auxiliares ─────────────────────
    type RightTab = "ajustes" | "filtros" | "camadas"
    const [rightTab, setRightTab] = useState<RightTab>("ajustes")
    const [isExportMenuOpen, setIsExportMenuOpen] = useState(false)
    const [isShortcutsOpen, setIsShortcutsOpen] = useState(false)

    // Pro: zoom + drag-and-drop
    const [zoom, setZoom] = useState(1)
    const [isDraggingFile, setIsDraggingFile] = useState(false)
    const canvasWrapperRef = useRef<HTMLDivElement>(null)
    const dragLeaveTimeoutRef = useRef<any>(null)

    // Pro: pickers de texto e formas profissionais
    const [isTextPickerOpen, setIsTextPickerOpen] = useState(false)
    const [shapePickerTab, setShapePickerTab] = useState<"arrows" | "shapes" | "lines" | null>(null)

    const setCanvasZoom = useCallback((newZoom: number, point?: { x: number; y: number }) => {
        if (!fabricRef.current) return
        const canvas = fabricRef.current
        const z = Math.max(0.2, Math.min(5, newZoom))
        if (point) {
            canvas.zoomToPoint(new fabric.Point(point.x, point.y), z)
        } else {
            // Centro do canvas
            const cx = canvas.getWidth() / 2
            const cy = canvas.getHeight() / 2
            canvas.zoomToPoint(new fabric.Point(cx, cy), z)
        }
        setZoom(z)
    }, [])

    const zoomIn = useCallback(() => setCanvasZoom((fabricRef.current?.getZoom() || 1) * 1.2), [setCanvasZoom])
    const zoomOut = useCallback(() => setCanvasZoom((fabricRef.current?.getZoom() || 1) * 0.8), [setCanvasZoom])
    const resetZoom = useCallback(() => {
        if (!fabricRef.current) return
        fabricRef.current.setViewportTransform([1, 0, 0, 1, 0, 0])
        setZoom(1)
    }, [])

    const handleCanvasWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
        // Zoom só com Ctrl/Cmd pressionado — senão deixa scroll normal
        if (!e.ctrlKey && !e.metaKey) return
        if (!fabricRef.current) return
        e.preventDefault()
        e.stopPropagation()
        const canvas = fabricRef.current
        const delta = e.deltaY
        let newZoom = canvas.getZoom() * (delta > 0 ? 0.9 : 1.1)
        newZoom = Math.max(0.2, Math.min(5, newZoom))
        // Zoom centrado no ponteiro
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
        const point = new fabric.Point(e.clientX - rect.left, e.clientY - rect.top)
        canvas.zoomToPoint(point, newZoom)
        setZoom(newZoom)
    }, [])

    const addImageFileToCanvas = useCallback((file: File) => {
        if (!fabricRef.current) return
        if (!file.type.startsWith("image/")) {
            toast.error("Arraste apenas arquivos de imagem")
            return
        }
        const reader = new FileReader()
        reader.onload = (ev) => {
            const url = String(ev.target?.result || "")
            if (!url) return
            const imgEl = new Image()
            imgEl.crossOrigin = "anonymous"
            imgEl.onload = () => {
                const canvas = fabricRef.current
                if (!canvas) return
                const fabImg = new fabric.Image(imgEl, {
                    left: 50,
                    top: 50,
                    selectable: true,
                    hasControls: true,
                })
                // Ajusta escala se for maior que metade do canvas
                const maxSide = Math.min(canvas.getWidth(), canvas.getHeight()) * 0.6
                const naturalSide = Math.max(imgEl.naturalWidth, imgEl.naturalHeight)
                if (naturalSide > maxSide) {
                    const s = maxSide / naturalSide
                    fabImg.scale(s)
                }
                canvas.add(fabImg)
                canvas.setActiveObject(fabImg)
                canvas.requestRenderAll()
                history.pushSnapshot()
                toast.success("Imagem adicionada como camada")
            }
            imgEl.src = url
        }
        reader.readAsDataURL(file)
    }, [])

    const handleCanvasDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        if (!e.dataTransfer.types.includes("Files")) return
        e.preventDefault()
        if (dragLeaveTimeoutRef.current) clearTimeout(dragLeaveTimeoutRef.current)
        if (!isDraggingFile) setIsDraggingFile(true)
    }, [isDraggingFile])

    const handleCanvasDragLeave = useCallback((_e: React.DragEvent<HTMLDivElement>) => {
        // Debounce: dragLeave dispara em filhos; ignora se vier outro dragOver logo
        if (dragLeaveTimeoutRef.current) clearTimeout(dragLeaveTimeoutRef.current)
        dragLeaveTimeoutRef.current = setTimeout(() => setIsDraggingFile(false), 80)
    }, [])

    const handleCanvasDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        setIsDraggingFile(false)
        const files = Array.from(e.dataTransfer.files || [])
        const imageFiles = files.filter(f => f.type.startsWith("image/"))
        if (imageFiles.length === 0) return
        // Adiciona até 5 imagens por vez (evita travar)
        imageFiles.slice(0, 5).forEach(addImageFileToCanvas)
    }, [addImageFileToCanvas])

    const history = useEditorHistory(fabricCanvas)

    // ---------------------------------------------------------------
    // 1) Inicializa o canvas Fabric quando o canvas DOM estiver pronto
    // ---------------------------------------------------------------
    const handleCanvasRef = useCallback((node: HTMLCanvasElement | null) => {
        if (!isOpen || !node || fabricRef.current) return

        // Otimização para operações frequentes de leitura de pixels (necessário para perPixelTargetFind)
        node.getContext('2d', { willReadFrequently: true });

        const canvas = new fabric.Canvas(node, {
            backgroundColor: isTransparent ? "rgba(0,0,0,0)" : "#ffffff",
            preserveObjectStacking: true,
        })

        // Pro: handles de seleção MUITO mais visíveis (estilo Figma)
        fabric.Object.prototype.set({
            cornerColor: "#0ea5e9",
            cornerStrokeColor: "#ffffff",
            cornerStyle: "circle",
            cornerSize: 12,
            transparentCorners: false,
            borderColor: "#0ea5e9",
            borderScaleFactor: 2,
            padding: 4,
            rotatingPointOffset: 30,
            borderDashArray: [4, 4],
        })

        fabricRef.current = canvas
        setFabricCanvas(canvas)
    }, [isOpen])

    useEffect(() => {
        return () => {
            if (fabricRef.current) {
                try {
                    fabricRef.current.dispose()
                } catch {
                    /* ignore */
                }
                fabricRef.current = null
            }
            imageObjectRef.current = null
            setFabricCanvas(null)
            setImageObject(null)
        }
    }, [isOpen])

    // ---------------------------------------------------------------
    // 2) Carrega a imagem como camada (não como background) quando o canvas estiver pronto
    // ---------------------------------------------------------------
    useEffect(() => {
        if (!fabricCanvas || !currentImageUrl) return

        setLoading(true)
        const imgEl = new Image()
        imgEl.crossOrigin = "anonymous"

        imgEl.onload = () => {
            // Limpa o canvas de quaisquer edições anteriores ao trocar de foto
            fabricCanvas.clear()
            // Reset de zoom ao carregar nova imagem
            fabricCanvas.setViewportTransform([1, 0, 0, 1, 0, 0])
            setZoom(1)
            fabricCanvas.setBackgroundColor(isTransparent ? "rgba(0,0,0,0)" : "#ffffff", fabricCanvas.renderAll.bind(fabricCanvas))

            // Canvas = tamanho exato da imagem (com clamp p/ MAX). Garante que a imagem
            // PREENCHE o quadro do editor — sem "caixa cinza" sobrando em volta.
            const naturalW = imgEl.naturalWidth || 800
            const naturalH = imgEl.naturalHeight || 600
            const ratio = naturalW / naturalH

            let width = naturalW
            let height = naturalH

            if (width > CANVAS_MAX_WIDTH) {
                width = CANVAS_MAX_WIDTH
                height = Math.round(width / ratio)
            }
            if (height > CANVAS_MAX_HEIGHT) {
                height = CANVAS_MAX_HEIGHT
                width = Math.round(height * ratio)
            }

            fabricCanvas.setWidth(width)
            fabricCanvas.setHeight(height)

            // Cria fabric.Image preenchendo o canvas inteiro (left/top = 0, escala fit)
            const scale = Math.min(width / naturalW, height / naturalH)
            const fabImg = new fabric.Image(imgEl, {
                left: 0,
                top: 0,
                scaleX: scale,
                scaleY: scale,
                selectable: true,
                hasControls: true,
                lockMovementX: false,
                lockMovementY: false,
            })

            // Adiciona como primeira camada (atrás de tudo o que vier depois)
            fabricCanvas.add(fabImg)
            fabricCanvas.sendToBack(fabImg)
            fabricCanvas.requestRenderAll()

            imageObjectRef.current = fabImg
            setImageObject(fabImg)
            setLoading(false)

            // Snapshot inicial para o histórico
            // (usa requestAnimationFrame para garantir que toJSON pegue tudo já renderizado)
            requestAnimationFrame(() => history.pushSnapshot())
        }
        imgEl.onerror = () => {
            toast.error("Erro ao carregar imagem no editor")
            setLoading(false)
        }
        imgEl.src = currentImageUrl

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fabricCanvas, currentImageUrl])

    // ---------------------------------------------------------------
    // 3) Modos: select / draw / crop / eraser
    // ---------------------------------------------------------------
    useEffect(() => {
        if (!fabricCanvas) return

        if (mode === "draw" || mode === "eraser") {
            fabricCanvas.isDrawingMode = true
            const brush = new fabric.PencilBrush(fabricCanvas)
            if (mode === "eraser") {
                brush.color = "rgba(255,255,255,1)"
                brush.width = eraserSize
            } else {
                brush.color = "#ff0000"
                brush.width = 4
            }
            fabricCanvas.freeDrawingBrush = brush
            
            if (imageObjectRef.current) {
                imageObjectRef.current.selectable = false
                imageObjectRef.current.evented = false
            }
        } else {
            fabricCanvas.isDrawingMode = false
            if (imageObjectRef.current) {
                imageObjectRef.current.selectable = mode === "select"
                imageObjectRef.current.evented = mode === "select"
            }
        }

        if (mode === "crop") {
            fabricCanvas.discardActiveObject()
            if (!cropRect) {
                const rect = new fabric.Rect({
                    fill: 'rgba(0,0,0,0.3)',
                    originX: 'left',
                    originY: 'top',
                    stroke: '#3b82f6',
                    strokeDashArray: [5, 5],
                    opacity: 1,
                    width: 300,
                    height: cropRatio === "1:1" ? 300 : cropRatio === "4:3" ? 225 : 300,
                    top: 50,
                    left: 50,
                    padding: 0,
                    transparentCorners: false,
                    cornerColor: '#3b82f6',
                    cornerStrokeColor: '#fff',
                    cornerSize: 8,
                    cornerStyle: 'circle',
                    borderColor: '#3b82f6',
                    borderDashArray: [4, 4],
                    borderScaleFactor: 2,
                    perPixelTargetFind: true,
                });
                if (cropRatio !== "free") {
                    rect.setControlsVisibility({ mt: false, mb: false, ml: false, mr: false });
                    rect.lockUniScaling = true;
                }
                fabricCanvas.add(rect);
                fabricCanvas.setActiveObject(rect);
                setCropRect(rect);
            }
            fabricCanvas.requestRenderAll()
        } else {
            if (cropRect) {
                fabricCanvas.remove(cropRect);
                setCropRect(null);
                fabricCanvas.requestRenderAll();
            }
        }
    }, [mode, fabricCanvas, eraserSize]) // omit cropRatio to avoid rebuilding on ratio change

    useEffect(() => {
        if (!cropRect || !fabricCanvas) return;
        if (cropRatio === "1:1") {
            cropRect.set({ width: cropRect.height });
            cropRect.setControlsVisibility({ mt: false, mb: false, ml: false, mr: false });
            cropRect.lockUniScaling = true;
        } else if (cropRatio === "4:3") {
            cropRect.set({ width: cropRect.height * (4/3) });
            cropRect.setControlsVisibility({ mt: false, mb: false, ml: false, mr: false });
            cropRect.lockUniScaling = true;
        } else {
            cropRect.setControlsVisibility({ mt: true, mb: true, ml: true, mr: true });
            cropRect.lockUniScaling = false;
        }
        fabricCanvas.requestRenderAll();
    }, [cropRatio, cropRect, fabricCanvas])

    useEffect(() => {
        if (!fabricCanvas) return;
        fabricCanvas.setBackgroundColor(isTransparent ? "rgba(0,0,0,0)" : "#ffffff", fabricCanvas.renderAll.bind(fabricCanvas))
    }, [isTransparent, fabricCanvas])

    useEffect(() => {
        if (!fabricCanvas) return;
        const handler = (e: any) => {
            if (mode === "eraser" && e.path) {
                e.path.globalCompositeOperation = 'destination-out';
                fabricCanvas.requestRenderAll();
                history.pushSnapshot();
            }
        };
        fabricCanvas.on("path:created", handler);
        return () => fabricCanvas.off("path:created", handler);
    }, [fabricCanvas, mode]);

    useEffect(() => {
        if (!fabricCanvas) return;
        
        let isDragging = false;
        let lastPosX = 0;
        let lastPosY = 0;
        let spacePressed = false;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space' && !spacePressed) {
                const target = e.target as HTMLElement | null
                const tag = target?.tagName?.toLowerCase()
                if (tag === "input" || tag === "textarea" || target?.isContentEditable) return
                
                e.preventDefault();
                spacePressed = true;
                fabricCanvas.defaultCursor = 'grab';
                fabricCanvas.selection = false;
                fabricCanvas.forEachObject((obj: any) => obj.set('selectable', false));
                fabricCanvas.requestRenderAll();
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                e.preventDefault();
                spacePressed = false;
                fabricCanvas.defaultCursor = 'default';
                fabricCanvas.selection = true;
                fabricCanvas.forEachObject((obj: any) => {
                    if (!obj.isWatermark) obj.set('selectable', true);
                });
                fabricCanvas.requestRenderAll();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        const onMouseDown = (opt: any) => {
            if (spacePressed) {
                isDragging = true;
                fabricCanvas.defaultCursor = 'grabbing';
                lastPosX = opt.e.clientX;
                lastPosY = opt.e.clientY;
            }
        };

        const onMouseMove = (opt: any) => {
            if (isDragging && spacePressed) {
                const e = opt.e;
                const vpt = fabricCanvas.viewportTransform;
                vpt[4] += e.clientX - lastPosX;
                vpt[5] += e.clientY - lastPosY;
                fabricCanvas.requestRenderAll();
                lastPosX = e.clientX;
                lastPosY = e.clientY;
            }
        };

        const onMouseUp = () => {
            if (isDragging) {
                isDragging = false;
                fabricCanvas.defaultCursor = spacePressed ? 'grab' : 'default';
            }
        };

        const onWheel = (opt: any) => {
            const delta = opt.e.deltaY;
            let zoom = fabricCanvas.getZoom();
            zoom *= 0.999 ** delta;
            if (zoom > 5) zoom = 5;
            if (zoom < 0.5) zoom = 0.5;
            fabricCanvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
            opt.e.preventDefault();
            opt.e.stopPropagation();
        };

        fabricCanvas.on('mouse:down', onMouseDown);
        fabricCanvas.on('mouse:move', onMouseMove);
        fabricCanvas.on('mouse:up', onMouseUp);
        fabricCanvas.on('mouse:wheel', onWheel);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            fabricCanvas.off('mouse:down', onMouseDown);
            fabricCanvas.off('mouse:move', onMouseMove);
            fabricCanvas.off('mouse:up', onMouseUp);
            fabricCanvas.off('mouse:wheel', onWheel);
        };
    }, [fabricCanvas]);

    // ---------------------------------------------------------------
    // 4) Atalho DELETE para apagar objeto selecionado
    // ---------------------------------------------------------------
    useEffect(() => {
        if (!fabricCanvas) return
        const handler = (e: KeyboardEvent) => {
            if (e.key !== "Delete" && e.key !== "Backspace") return
            // não deleta se estiver editando texto
            const active = fabricCanvas.getActiveObject()
            if (!active) return
            if (active.isEditing) return
            // não deleta a imagem principal
            if (active === imageObjectRef.current) return
            // se foco estiver em input do painel, ignora
            const target = e.target as HTMLElement | null
            const tag = target?.tagName?.toLowerCase()
            if (tag === "input" || tag === "textarea" || target?.isContentEditable) return

            fabricCanvas.remove(...fabricCanvas.getActiveObjects())
            fabricCanvas.discardActiveObject()
            fabricCanvas.requestRenderAll()
        }
        window.addEventListener("keydown", handler)
        return () => window.removeEventListener("keydown", handler)
    }, [fabricCanvas])

    // ---------------------------------------------------------------
    // 5) Quando a IA termina de remover o fundo, troca a imagem-camada
    //    pela nova versão (preservando posição/escala).
    // ---------------------------------------------------------------
    const [autoRemovingBg, setAutoRemovingBg] = useState(false)

    /**
     * Quando o usuário ativa "Fundo Transparente":
     *  - Marca canvas como transparente (visual)
     *  - Se há imagem carregada e ela ainda tem fundo (não foi processada),
     *    chama a IA pra remover o fundo deixando-o transparente.
     *
     * Quando desativa: só volta o canvas para fundo branco (NÃO restaura fundo da imagem).
     */
    // Flag pra cancelar updates de state se o modal fechar durante async
    const isMountedRef = useRef(true)
    useEffect(() => {
        isMountedRef.current = true
        return () => { isMountedRef.current = false }
    }, [])

    const handleToggleTransparentBackground = useCallback(async (checked: boolean) => {
        setIsTransparent(checked)
        if (!checked || !fabricCanvas || !imageObjectRef.current) return

        const imgObj = imageObjectRef.current
        if ((imgObj as any).__bgRemoved) return

        setAutoRemovingBg(true)
        let toastId: string | number | undefined
        try {
            // Detecção de tainted canvas (CORS): toDataURL lança SecurityError silencioso
            let dataUrl: string
            try {
                dataUrl = imgObj.toDataURL({ format: "png", multiplier: 3 })
            } catch (corsErr) {
                throw new Error("Imagem está em domínio externo sem CORS — não consegui processar. Faça upload local primeiro.")
            }
            const blobRes = await fetch(dataUrl)
            const blob = await blobRes.blob()

            toastId = toast.loading("Removendo fundo na nuvem...")

            const formData = new FormData()
            formData.append("file", blob, "image.png")
            formData.append("transparent", "true")

            const apiRes = await fetch(`${getApiBaseUrl()}/api/admin/remover-fundo-blob`, {
                method: "POST",
                headers: { Authorization: `Bearer ${getAuthToken() || ""}` },
                body: formData,
            })

            if (!apiRes.ok) {
                const errDetail = await apiRes.text().catch(() => "")
                throw new Error(errDetail || "Falha na API da nuvem")
            }

            const outBlob = await apiRes.blob()

            if (toastId !== undefined) {
                toast.dismiss(toastId)
                toastId = undefined
            }

            // Se o modal fechou no meio, aborta sem tocar state
            if (!isMountedRef.current) return

            const reader = new FileReader()
            const newDataUrl: string = await new Promise((resolve, reject) => {
                reader.onload = () => resolve(reader.result as string)
                reader.onerror = () => reject(reader.error)
                reader.readAsDataURL(outBlob)
            })

            if (!isMountedRef.current) return
            await handleBackgroundRemovedRef.current?.(newDataUrl)
            if (imageObjectRef.current) (imageObjectRef.current as any).__bgRemoved = true
            if (isMountedRef.current) toast.success("Fundo removido localmente!")
        } catch (e: any) {
            if (toastId !== undefined) {
                toast.dismiss(toastId)
            }
            if (isMountedRef.current) {
                toast.error(`Erro ao remover fundo local: ${e?.message || "tente novamente"}`)
                setIsTransparent(false)
            }
        } finally {
            if (isMountedRef.current) setAutoRemovingBg(false)
        }
    }, [fabricCanvas])

    // Ref pra evitar circular dep entre handleToggleTransparent e handleBackgroundRemoved
    const handleBackgroundRemovedRef = useRef<((url: string) => Promise<void>) | null>(null)

    const handleBackgroundRemoved = useCallback(
        async (newImageDataUrl: string) => {
            if (!fabricCanvas || !imageObjectRef.current) return
            const old = imageObjectRef.current

            return new Promise<void>((resolve) => {
                const tmp = new Image()
                tmp.crossOrigin = "anonymous"
                tmp.onload = () => {
                    // Cria nova fabric.Image com mesma posição/escala
                    const newFab = new fabric.Image(tmp, {
                        left: old.left,
                        top: old.top,
                        scaleX: (old.width * old.scaleX) / (tmp.naturalWidth || 1),
                        scaleY: (old.height * old.scaleY) / (tmp.naturalHeight || 1),
                        angle: old.angle || 0,
                        selectable: mode === "select",
                        evented: mode === "select",
                        perPixelTargetFind: true,
                        transparentCorners: false,
                        cornerColor: '#3b82f6',
                        cornerStyle: 'circle'
                    })
                    // Mantém os filtros aplicados? Por simplicidade, removemos
                    // (a IA já aplicou alteração relevante; usuário pode reaplicar)
                    fabricCanvas.remove(old)
                    fabricCanvas.add(newFab)
                    fabricCanvas.sendToBack(newFab)
                    imageObjectRef.current = newFab
                    setImageObject(newFab)
                    fabricCanvas.requestRenderAll()
                    history.pushSnapshot()
                    resolve()
                }
                tmp.onerror = () => {
                    toast.error("Não consegui carregar a imagem processada")
                    resolve()
                }
                tmp.src = newImageDataUrl
            })
        },
        [fabricCanvas, mode, history]
    )

    // Mantém ref sempre atualizado (em useEffect, não durante render)
    useEffect(() => {
        handleBackgroundRemovedRef.current = handleBackgroundRemoved
    }, [handleBackgroundRemoved])

    /** Remove fundo e recorta a imagem para o item. */
    const handleSmartCutout = useCallback(async (newImageDataUrl: string) => {
        if (!fabricCanvas || !imageObjectRef.current) return
        
        // 1) Remove o fundo
        await handleBackgroundRemoved(newImageDataUrl)

        // 2) Recorta o canvas para o bounding box do item
        const obj = imageObjectRef.current
        if (!obj) return

        // Aguarda um frame para garantir que a nova imagem foi carregada e processada pelo fabric
        requestAnimationFrame(() => {
            const rect = obj.getBoundingRect()
            const padding = 20
            
            // Movemos todos os objetos para a nova origem (0,0) do recorte
            const objects = fabricCanvas.getObjects()
            objects.forEach((o: any) => {
                o.set({
                    left: o.left - rect.left + padding,
                    top: o.top - rect.top + padding
                })
                o.setCoords()
            })

            fabricCanvas.setWidth(rect.width + padding * 2)
            fabricCanvas.setHeight(rect.height + padding * 2)
            fabricCanvas.requestRenderAll()
            history.pushSnapshot()
        })
    }, [fabricCanvas, handleBackgroundRemoved, history])

    /** Garante que marcas d'água fiquem sempre no topo. */
    const ensureWatermarksOnTop = useCallback(() => {
        if (!fabricCanvas) return
        const objects = fabricCanvas.getObjects()
        const watermarks = objects.filter((obj: any) => obj.isWatermark)
        watermarks.forEach((wm: any) => fabricCanvas.bringToFront(wm))
    }, [fabricCanvas])

    useEffect(() => {
        if (!fabricCanvas) return
        fabricCanvas.on("object:added", ensureWatermarksOnTop)
        fabricCanvas.on("object:modified", ensureWatermarksOnTop)
        return () => {
            fabricCanvas.off("object:added", ensureWatermarksOnTop)
            fabricCanvas.off("object:modified", ensureWatermarksOnTop)
        }
    }, [fabricCanvas, ensureWatermarksOnTop])

    /** Atualiza o conteúdo de todas as lupas no canvas. */
    const updateMagnifiers = useCallback(() => {
        if (!fabricCanvas || !imageObjectRef.current) return
        const objects = fabricCanvas.getObjects()
        const magnifiers = objects.filter((obj: any) => obj.isMagnifier)
        
        magnifiers.forEach((mag: any) => {
            const circle = mag.item(0) // O círculo com o padrão
            if (!circle || !circle.fill || !circle.fill.source) return
            
            // O padrão deve mostrar a imagem principal zoomada
            // Calculamos o offset baseado na posição da lupa em relação à imagem principal
            const zoom = mag.magnifierZoom || 2
            const img = imageObjectRef.current
            
            // Posição central da lupa no canvas
            const centerX = mag.left + (mag.width * mag.scaleX) / 2
            const centerY = mag.top + (mag.height * mag.scaleY) / 2
            
            // Posição relativa na imagem (considerando escala da imagem)
            const relX = (centerX - img.left) / img.scaleX
            const relY = (centerY - img.top) / img.scaleY
            
            circle.fill.offsetX = -relX * zoom + circle.radius
            circle.fill.offsetY = -relY * zoom + circle.radius
            circle.fill.repeat = 'no-repeat'
        })
        fabricCanvas.requestRenderAll()
    }, [fabricCanvas])

    useEffect(() => {
        if (!fabricCanvas) return
        fabricCanvas.on("object:moving", updateMagnifiers)
        fabricCanvas.on("object:scaling", updateMagnifiers)
        return () => {
            fabricCanvas.off("object:moving", updateMagnifiers)
            fabricCanvas.off("object:scaling", updateMagnifiers)
        }
    }, [fabricCanvas, updateMagnifiers])

    const handleRotate = () => {
        const obj = fabricCanvas?.getActiveObject() || imageObjectRef.current;
        if (!obj) return;
        obj.set('angle', (obj.angle || 0) + 90);
        fabricCanvas.requestRenderAll();
        history.pushSnapshot();
    }

    const handleFlip = () => {
        const obj = fabricCanvas?.getActiveObject() || imageObjectRef.current;
        if (!obj) return;
        obj.set('flipX', !obj.flipX);
        fabricCanvas.requestRenderAll();
        history.pushSnapshot();
    }

    const handleAddWatermark = async () => {
        if (!fabricCanvas) return;
        const trimmedUrl = await trimImage("/assets/watermark.png").catch(() => "/assets/watermark.png")
        fabric.Image.fromURL(trimmedUrl, (img: any) => {
            img.set({
                opacity: 0.3,
                selectable: false,
                evented: false,
                lockMovementX: true,
                lockMovementY: true,
                lockRotation: true,
                lockScalingX: true,
                lockScalingY: true,
            });
            img.isWatermark = true;
            const scale = 200 / (img.width || 1);
            img.scale(scale);
            img.set({
                left: fabricCanvas.width - (img.width * scale) - 20,
                top: fabricCanvas.height - (img.height * scale) - 20
            });
            fabricCanvas.add(img);
            fabricCanvas.bringToFront(img)
            fabricCanvas.requestRenderAll();
            history.pushSnapshot();
        });
    }

    const handleAddImage = async (url: string) => {
        if (!fabricCanvas) return;
        const trimmedUrl = await trimImage(url).catch(() => url)
        fabric.Image.fromURL(trimmedUrl, (img: any) => {
            // Se a imagem for maior que metade do canvas, reduzimos ela
            const maxWidth = fabricCanvas.width / 2;
            if (img.width > maxWidth) {
                img.scaleToWidth(maxWidth);
            }
            img.set({
                left: 100,
                top: 100,
                cornerColor: '#3b82f6',
                borderColor: '#3b82f6',
                cornerSize: 12,
                transparentCorners: false,
                cornerStyle: 'circle',
                perPixelTargetFind: true
            });
            fabricCanvas.add(img);
            fabricCanvas.setActiveObject(img);
            fabricCanvas.requestRenderAll();
            history.pushSnapshot();
        }, { crossOrigin: 'anonymous' });
    }

    const applyCrop = () => {
        if (!cropRect || !fabricCanvas) return;
        const rect = cropRect.getBoundingRect();
        const objects = fabricCanvas.getObjects();
        objects.forEach((obj: any) => {
            if (obj === cropRect) return;
            obj.set({
                left: obj.left - rect.left,
                top: obj.top - rect.top
            });
            obj.setCoords();
        });
        
        fabricCanvas.setWidth(rect.width);
        fabricCanvas.setHeight(rect.height);
        
        fabricCanvas.remove(cropRect);
        setCropRect(null);
        setMode('select');
        history.pushSnapshot();
    }

    // ---------------------------------------------------------------
    // 6) Salvar — gera dataURL → blob → POST /replace-produto-imagem
    // ---------------------------------------------------------------
    const handleSave = async () => {
        if (!fabricCanvas) return

        // Confirmação destrutiva (apenas se for substituir)
        if (replaceOriginal) {
            const confirmed = window.confirm(
                "Esta ação substituirá a foto original do produto. Deseja continuar?"
            )
            if (!confirmed) return
        }

        setSaving(true)
        try {
            // Garante que nada esteja selecionado para não aparecerem alças no export
            fabricCanvas.discardActiveObject()
            fabricCanvas.requestRenderAll()

            // Exporta em alta qualidade (multiplier 2 dobra a resolução)
            const dataUrl: string = fabricCanvas.toDataURL({
                format: "png",
                quality: 1,
                multiplier: 2,
            })

            const blobRes = await fetch(dataUrl)
            const blob = await blobRes.blob()

            if (!produtoId) {
                // Fallback: se não há produtoId, só chama onSave passando dataURL.
                // (caso o editor seja chamado em contexto sem persistência)
                if (onSave) onSave(dataUrl)
                toast.success("Imagem editada (não foi salva no produto: sem produtoId)")
                onClose()
                return
            }

            const formData = new FormData()
            formData.append("file", blob, "edited-image.png")
            formData.append("produto_id", produtoId)
            
            // Limpa query params para garantir que a URL seja igual a salva no banco
            const cleanUrl = (currentImageUrl ?? "").split('?')[0]
            formData.append("replace_url", replaceOriginal ? cleanUrl : "APPEND")

            const baseUrl = getApiBaseUrl()
            const token = getAuthToken()
            const res = await fetch(`${baseUrl}/api/admin/replace-produto-imagem`, {
                method: "POST",
                headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                body: formData,
            })

            if (!res.ok) {
                const detail = await res.text().catch(() => "")
                throw new Error(detail || `Falha no upload (HTTP ${res.status})`)
            }

            const json = await res.json().catch(() => ({} as any))
            const newUrl = json?.url as string | undefined

            toast.success("Imagem salva e foto do produto atualizada!")
            if (onSave && newUrl) onSave(newUrl)
            onClose()
        } catch (e: any) {
            console.error("[ImageEditorModal] save error:", e)
            toast.error(e?.message || "Erro ao salvar imagem")
        } finally {
            setSaving(false)
        }
    }

    const handleRevertFundo = async () => {
        if (!produtoId || !currentImageUrl) return
        if (!window.confirm("Deseja realmente reverter esta imagem ao seu estado original antes da remoção de fundo?")) return
        setSaving(true)
        try {
            const res = await api.post("/api/admin/reverter-fundo", {
                produto_id: produtoId,
                current_url: currentImageUrl
            })
            const data = res.data || res
            if (data?.ok) {
                toast.success("Imagem original restaurada com sucesso!")
                if (onSave && data.new_url) onSave(data.new_url)
                onClose()
            } else {
                toast.error(data?.message || "Não foi possível reverter a imagem.")
            }
        } catch (e: any) {
            const msg = e.response?.data?.detail || e.message || String(e)
            toast.error(`Erro ao reverter imagem: ${msg}`)
        } finally {
            setSaving(false)
        }
    }

    // ---------------------------------------------------------------
    // 7) Novas Funcionalidades: Download e WhatsApp
    // ---------------------------------------------------------------
    const handleDownload = () => {
        if (!fabricCanvas) return
        
        // Remove seleção para exportar limpo
        fabricCanvas.discardActiveObject()
        fabricCanvas.requestRenderAll()

        const dataUrl = fabricCanvas.toDataURL({
            format: "png",
            quality: 1,
            multiplier: 2,
        })

        const link = document.createElement("a")
        link.download = `imagem-editada-${new Date().getTime()}.png`
        link.href = dataUrl
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        toast.success("Download iniciado!")
    }

    const handleShareWhatsApp = async (targetPhone?: string) => {
        if (!fabricCanvas) return
        
        const phone = targetPhone || whatsappPhone
        if (!phone) {
            setIsContactPickerOpen(true)
            return
        }

        setSendingWhatsApp(true)
        try {
            fabricCanvas.discardActiveObject()
            fabricCanvas.requestRenderAll()

            const dataUrl = fabricCanvas.toDataURL({
                format: "png",
                quality: 1,
                multiplier: 2,
            })

            const res = await fetch(dataUrl)
            const blob = await res.blob()

            const formData = new FormData()
            formData.append("telefone", phone)
            formData.append("file", blob, "imagem-editada.png")

            await api.post("/api/whatsapp/enviar-midia", formData)
            toast.success(`Imagem enviada para ${phone}!`)
            setIsContactPickerOpen(false)
        } catch (err: any) {
            console.error("[ImageEditorModal] WhatsApp error:", err)
            toast.error("Erro ao enviar via WhatsApp")
        } finally {
            setSendingWhatsApp(false)
        }
    }

    const handleInitialUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        
        const reader = new FileReader()
        reader.onload = (event) => {
            setCurrentImageUrl(event.target?.result as string)
        }
        reader.readAsDataURL(file)
    }

    // ---------------------------------------------------------------
    // 8) Ferramentas Avançadas: Estúdio, Selos, IA, Medidas
    // ---------------------------------------------------------------
    const handleSetStudioBackground = (type: string) => {
        if (!fabricCanvas) return
        if (type === "picker") {
            setIsStudioPickerOpen(true)
            return
        }

        // Se for um gradiente ou cor
        if (type === "grad-blue") {
            fabricCanvas.setBackgroundColor(new fabric.Gradient({
                type: 'linear',
                gradientUnits: 'pixels',
                coords: { x1: 0, y1: 0, x2: 0, y2: fabricCanvas.height! },
                colorStops: [
                    { offset: 0, color: '#1e3a8a' },
                    { offset: 1, color: '#3b82f6' }
                ]
            }), fabricCanvas.renderAll.bind(fabricCanvas))
        } else if (type === "grad-gray") {
            fabricCanvas.setBackgroundColor(new fabric.Gradient({
                type: 'linear',
                gradientUnits: 'pixels',
                coords: { x1: 0, y1: 0, x2: 0, y2: fabricCanvas.height! },
                colorStops: [
                    { offset: 0, color: '#334155' },
                    { offset: 1, color: '#94a3b8' }
                ]
            }), fabricCanvas.renderAll.bind(fabricCanvas))
        } else if (type === "white") {
            fabricCanvas.setBackgroundColor("#ffffff", fabricCanvas.renderAll.bind(fabricCanvas))
        } else if (type === "studio-floor") {
            // Placeholder: Em produção usaria uma imagem real de estúdio
            fabricCanvas.backgroundColor = "#e5e7eb"
        }

        setIsStudioPickerOpen(false)
        fabricCanvas.requestRenderAll()
        history.pushSnapshot()
    }

    const handleAddBadge = (type: string) => {
        if (!fabricCanvas) return
        if (type === "picker") {
            setIsBadgePickerOpen(true)
            return
        }

        let badge: any
        const centerX = 150
        const centerY = 150

        if (type === "garantia") {
            // Escudo Vermelho Premium
            const shieldPath = "M 50 10 L 90 20 L 90 50 C 90 75 50 90 50 90 C 50 90 10 75 10 50 L 10 20 Z"
            const shield = new fabric.Path(shieldPath, {
                scaleX: 1.5, scaleY: 1.5,
                stroke: '#fff', strokeWidth: 2,
                shadow: 'rgba(0,0,0,0.3) 5px 5px 10px'
            })
            shield.set('fill', new fabric.Gradient({
                type: 'linear',
                coords: { x1: 0, y1: 0, x2: 0, y2: shield.height },
                colorStops: [{ offset: 0, color: '#ef4444' }, { offset: 1, color: '#991b1b' }]
            }))
            const text = new fabric.IText("90\nDIAS", {
                fontSize: 18, fill: "#fff", fontWeight: "black", textAlign: "center", originX: "center", originY: "center", left: 75, top: 75
            })
            const label = new fabric.IText("GARANTIA", {
                fontSize: 10, fill: "#fff", fontWeight: "bold", originX: "center", left: 75, top: 45
            })
            badge = new fabric.Group([shield, label, text], { left: 50, top: 50 })
        } else if (type === "original") {
            // Selo Azul Hexagonal
            const hexPath = "M 50 10 L 85 25 L 85 65 L 50 80 L 15 65 L 15 25 Z"
            const hex = new fabric.Path(hexPath, {
                scaleX: 1.8, scaleY: 1.8,
                stroke: '#fff', strokeWidth: 2,
                shadow: 'rgba(0,0,0,0.3) 5px 5px 10px'
            })
            hex.set('fill', new fabric.Gradient({
                type: 'linear',
                coords: { x1: 0, y1: 0, x2: 0, y2: hex.height },
                colorStops: [{ offset: 0, color: '#3b82f6' }, { offset: 1, color: '#1d4ed8' }]
            }))
            const text = new fabric.IText("PEÇA\nORIGINAL", {
                fontSize: 14, fill: "#fff", fontWeight: "black", textAlign: "center", originX: "center", originY: "center", left: 90, top: 85
            })
            badge = new fabric.Group([hex, text], { left: 50, top: 50 })
        } else if (type === "testado") {
            // Escudo Verde de Qualidade
            const shieldPath = "M 50 10 L 90 20 L 90 50 C 90 75 50 90 50 90 C 50 90 10 75 10 50 L 10 20 Z"
            const shield = new fabric.Path(shieldPath, {
                scaleX: 1.5, scaleY: 1.5,
                stroke: '#fff', strokeWidth: 2,
                shadow: 'rgba(0,0,0,0.3) 5px 5px 10px'
            })
            shield.set('fill', new fabric.Gradient({
                type: 'linear',
                coords: { x1: 0, y1: 0, x2: 0, y2: shield.height },
                colorStops: [{ offset: 0, color: '#22c55e' }, { offset: 1, color: '#166534' }]
            }))
            const text = new fabric.IText("TESTADO\nE APROVADO", {
                fontSize: 11, fill: "#fff", fontWeight: "black", textAlign: "center", originX: "center", originY: "center", left: 75, top: 75
            })
            badge = new fabric.Group([shield, text], { left: 50, top: 50 })
        }

        if (badge) {
            badge.set({
                perPixelTargetFind: true,
                transparentCorners: false,
                cornerColor: '#3b82f6',
                cornerStyle: 'circle'
            })
            fabricCanvas.add(badge)
            fabricCanvas.bringToFront(badge)
            fabricCanvas.setActiveObject(badge)
            setIsBadgePickerOpen(false)
            fabricCanvas.requestRenderAll()
            history.pushSnapshot()
        }
    }

    /** Melhora a imagem usando a IA do backend (Refina traços, melhora pixels). */
    const handleIAEnhance = async () => {
        if (!imageObject || !fabricCanvas) return
        
        const toastId = toast.loading("Refinando traços e melhorando pixels via IA...")
        setLoading(true)

        try {
            // Pegamos a imagem atual do objeto em alta resolução
            const multiplier = 1 / (imageObject.scaleX || 1);
            const dataUrl = imageObject.toDataURL({ 
                format: 'jpeg', 
                quality: 0.95,
                multiplier: Math.min(multiplier, 3) // Limita a 3x para não estourar memória
            })
            const blob = await (await fetch(dataUrl)).blob()
            
            const formData = new FormData()
            formData.append('file', blob, 'image.jpg')

            const baseUrl = getApiBaseUrl()
            const token = getAuthToken();
            const res = await fetch(`${baseUrl}/api/admin/melhorar-imagem-blob`, {
                method: 'POST',
                body: formData,
                headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            })

            if (!res.ok) throw new Error("Falha ao processar melhoramento via IA")

            const improvedBlob = await res.blob()
            const improvedUrl = URL.createObjectURL(improvedBlob)

            fabric.Image.fromURL(improvedUrl, (newImg: any) => {
                // Preservamos posição e escala
                newImg.set({
                    left: imageObject.left,
                    top: imageObject.top,
                    scaleX: imageObject.scaleX,
                    scaleY: imageObject.scaleY,
                    angle: imageObject.angle,
                    flipX: imageObject.flipX,
                    flipY: imageObject.flipY,
                    perPixelTargetFind: true,
                    transparentCorners: false,
                    cornerColor: '#3b82f6',
                    cornerStyle: 'circle'
                })

                // Substituímos o objeto antigo
                fabricCanvas.remove(imageObject)
                fabricCanvas.add(newImg)
                setImageObject(newImg)
                imageObjectRef.current = newImg
                
                fabricCanvas.setActiveObject(newImg)
                fabricCanvas.requestRenderAll()
                
                setLoading(false)
                toast.dismiss(toastId)
                toast.success("Imagem aprimorada com sucesso!")
                history.pushSnapshot()
            })
        } catch (error) {
            console.error(error)
            setLoading(false)
            toast.dismiss(toastId)
            toast.error("Erro ao aprimorar imagem via IA.")
        }
    }

    const handleAddMeasurement = () => {
        if (!fabricCanvas) return
        
        const line = new fabric.Line([0, 0, 150, 0], { stroke: "#000", strokeWidth: 2 })
        const arrowL = new fabric.Triangle({ width: 10, height: 10, fill: "#000", left: 0, top: 0, angle: -90, originX: "center", originY: "center" })
        const arrowR = new fabric.Triangle({ width: 10, height: 10, fill: "#000", left: 150, top: 0, angle: 90, originX: "center", originY: "center" })
        const text = new fabric.IText("45 cm", { fontSize: 16, fontWeight: "bold", top: -20, left: 75, originX: "center" })
        
        const group = new fabric.Group([line, arrowL, arrowR, text], { 
            left: 100, 
            top: 100,
            subTargetCheck: true, // Crucial para permitir cliques nos itens internos
            perPixelTargetFind: true,
            transparentCorners: false,
            cornerColor: '#3b82f6',
            cornerStyle: 'circle'
        }) as fabric.Group & { interactive?: boolean }
        
        group.interactive = true;

        // Permite editar o texto ao clicar diretamente nele dentro do grupo
        group.on('mousedblclick', (e: any) => {
            if (e.subTargets && e.subTargets[0] === text) {
                text.enterEditing();
                fabricCanvas.setActiveObject(text);
            }
        });

        fabricCanvas.add(group)
        fabricCanvas.bringToFront(group)
        fabricCanvas.setActiveObject(group)
        fabricCanvas.requestRenderAll()
        history.pushSnapshot()
    }

    /** Aplica o Logotipo oficial Dourados Auto Peças no rodapé. */
    const handleApplyOfficialLogo = async () => {
        if (!fabricCanvas) return
        const trimmedUrl = await trimImage('/assets/logo-dourados.png').catch(() => '/assets/logo-dourados.png')
        fabric.Image.fromURL(trimmedUrl, (img: any) => {
            img.scaleToWidth(250)
            img.set({
                left: 20,
                top: fabricCanvas.height - (img.height * img.scaleY) - 20,
                isWatermark: true, // Trata como marca d'água para ficar no topo
                perPixelTargetFind: true,
                transparentCorners: false,
                cornerColor: '#3b82f6',
                cornerStyle: 'circle'
            })
            fabricCanvas.add(img)
            fabricCanvas.setActiveObject(img)
            fabricCanvas.requestRenderAll()
            history.pushSnapshot()
        })
    }

    /** Cria uma 'Lupa de Detalhes' funcional. */
    const handleAddMagnifier = () => {
        if (!fabricCanvas || !imageObjectRef.current) return
        
        const imgElement = imageObjectRef.current._element
        const zoom = 2
        const radius = 80

        // Criamos um padrão usando o elemento da imagem principal
        const pattern = new fabric.Pattern({
            source: imgElement,
            repeat: 'no-repeat'
        })

        const circle = new fabric.Circle({
            radius: radius,
            fill: pattern,
            stroke: '#fbbf24',
            strokeWidth: 2, // Borda mínima solicitada
            originX: 'center',
            originY: 'center'
        })

        const group = new fabric.Group([circle], {
            left: 200,
            top: 200,
            subTargetCheck: false
        }) as fabric.Group & { isMagnifier?: boolean; magnifierZoom?: number; }
        
        group.isMagnifier = true;
        group.magnifierZoom = zoom;

        // Ajusta a escala inicial do padrão
        pattern.patternTransform = [zoom, 0, 0, zoom, 0, 0]

        fabricCanvas.add(group)
        fabricCanvas.setActiveObject(group)
        
        // Força atualização inicial
        updateMagnifiers()
        
        fabricCanvas.requestRenderAll()
        history.pushSnapshot()
        toast.info("Arraste a lupa para ver os detalhes com zoom.")
    }

    /** Centraliza o objeto selecionado ou todos os objetos no canvas. */
    const handleSmartCenter = () => {
        if (!fabricCanvas) return
        const activeObject = fabricCanvas.getActiveObject()
        if (activeObject) {
            activeObject.center()
            activeObject.setCoords()
        } else {
            fabricCanvas.centerObject(fabricCanvas.getObjects()[0])
        }
        fabricCanvas.requestRenderAll()
        history.pushSnapshot()
    }

    const handleApplyTemplate = (type: string) => {
        if (!fabricCanvas) return
        
        if (type === 'flash_sale') {
            // Faixa Superior Vermelha com Gradiente
            const rect = new fabric.Rect({
                width: fabricCanvas.width, height: 100, top: 0, left: 0, selectable: false,
                shadow: 'rgba(0,0,0,0.5) 0px 5px 15px'
            })
            rect.set('fill', new fabric.Gradient({
                type: 'linear',
                coords: { x1: 0, y1: 0, x2: fabricCanvas.width!, y2: 0 },
                colorStops: [{ offset: 0, color: '#991b1b' }, { offset: 0.5, color: '#ef4444' }, { offset: 1, color: '#991b1b' }]
            }))
            const text = new fabric.IText("OFERTA RELÂMPAGO ⚡", {
                fontSize: 32, fill: '#fff', fontWeight: "900", top: 34, left: fabricCanvas.width! / 2, originX: "center", selectable: false, shadow: 'rgba(0,0,0,0.5) 2px 2px 4px'
            })
            fabricCanvas.add(rect, text)
        } else if (type === 'today_only') {
            // Selo Circular Dourado Premium
            const circle = new fabric.Circle({
                radius: 80, left: fabricCanvas.width! - 100, top: 100, originX: "center", originY: "center",
                stroke: '#fef3c7', strokeWidth: 3, shadow: 'rgba(0,0,0,0.4) 5px 5px 15px'
            })
            circle.set('fill', new fabric.Gradient({
                type: 'linear',
                coords: { x1: 0, y1: 0, x2: 160, y2: 160 },
                colorStops: [{ offset: 0, color: '#f59e0b' }, { offset: 0.5, color: '#fbbf24' }, { offset: 1, color: '#b45309' }]
            }))
            const text = new fabric.IText("SÓ HOJE!", {
                fontSize: 24, fill: '#451a03', fontWeight: "bold", left: fabricCanvas.width! - 100, top: 100, originX: "center", originY: "center"
            })
            fabricCanvas.add(circle, text)
        } else if (type === 'discount') {
            // Selo de Desconto Octogonal
            const octPath = "M 30 0 L 70 0 L 100 30 L 100 70 L 70 100 L 30 100 L 0 70 L 0 30 Z"
            const oct = new fabric.Path(octPath, {
                left: 100, top: 100, scaleX: 1.5, scaleY: 1.5, stroke: '#fff', strokeWidth: 3, shadow: 'rgba(0,0,0,0.3) 5px 5px 10px'
            })
            oct.set('fill', new fabric.Gradient({
                type: 'linear',
                coords: { x1: 0, y1: 0, x2: 100, y2: 100 },
                colorStops: [{ offset: 0, color: '#0ea5e9' }, { offset: 1, color: '#2563eb' }]
            }))
            const text = new fabric.IText("30%\nOFF", {
                fontSize: 28, fill: '#fff', fontWeight: "black", textAlign: "center", left: 175, top: 175, originX: "center", originY: "center"
            })
            fabricCanvas.add(oct, text)
        } else if (type === 'highlight') {
            // Faixa de Destaque (Ribbon)
            const ribPath = "M 0 0 L 300 0 L 320 25 L 300 50 L 0 50 L 20 25 Z"
            const ribbon = new fabric.Path(ribPath, {
                left: 50, top: fabricCanvas.height! - 100, stroke: '#fff', strokeWidth: 1, shadow: 'rgba(0,0,0,0.3) 0px 4px 8px'
            })
            ribbon.set('fill', new fabric.Gradient({
                type: 'linear',
                coords: { x1: 0, y1: 0, x2: 320, y2: 0 },
                colorStops: [{ offset: 0, color: '#065f46' }, { offset: 0.5, color: '#10b981' }, { offset: 1, color: '#065f46' }]
            }))
            const text = new fabric.IText("SUPER OFERTA EM DESTAQUE 🏆", {
                fontSize: 14, fill: '#fff', fontWeight: "bold", left: 210, top: fabricCanvas.height! - 75, originX: "center", originY: "center"
            })
            fabricCanvas.add(ribbon, text)
        }

        setIsTemplatePickerOpen(false)
        fabricCanvas.requestRenderAll()
        history.pushSnapshot()
        toast.success("Template aplicado!")
    }

    return (
        <>
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Editor de Imagens Pro"
            className="max-w-[98vw] sm:max-w-[98vw] !p-0 overflow-hidden"
            contentClassName="p-0 !max-h-[95vh]"
        >
            <div className="flex flex-col h-[88vh]">
                {/* ─── Header Pro (escuro, status, ações) ─────────────────── */}
                <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="flex items-center gap-1 bg-slate-800/60 rounded-lg p-1 border border-slate-700">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 hover:bg-slate-700 text-slate-200 disabled:opacity-30"
                                onClick={history.undo}
                                disabled={!history.canUndo}
                                title="Desfazer (Ctrl+Z)"
                            >
                                <Undo2 className="h-3.5 w-3.5" />
                            </Button>
                            <div className="h-5 w-px bg-slate-700" />
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 hover:bg-slate-700 text-slate-200 disabled:opacity-30"
                                onClick={history.redo}
                                disabled={!history.canRedo}
                                title="Refazer (Ctrl+Y)"
                            >
                                <Redo2 className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                        <span
                            className={cn(
                                "text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md border",
                                mode === "draw" && "bg-amber-500/20 text-amber-300 border-amber-500/30",
                                mode === "crop" && "bg-blue-500/20 text-blue-300 border-blue-500/30",
                                mode === "eraser" && "bg-rose-500/20 text-rose-300 border-rose-500/30",
                                mode === "select" && "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
                            )}
                        >
                            {mode === "draw" && "🖌 Pincel"}
                            {mode === "crop" && "✂ Recorte"}
                            {mode === "eraser" && "🩹 Borracha"}
                            {mode === "select" && "✓ Seleção"}
                        </span>
                        <span className="hidden md:inline text-[11px] text-slate-400 truncate max-w-md">
                            {mode === "draw" && "Desenhe livre no canvas — escolha cor e espessura no painel"}
                            {mode === "crop" && "Arraste sobre a imagem para selecionar a área de corte"}
                            {mode === "eraser" && "Pinte sobre o que quer apagar"}
                            {mode === "select" && "Clique em qualquer objeto para editar suas propriedades"}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-slate-700 text-slate-300"
                            onClick={() => setIsShortcutsOpen(true)}
                            title="Atalhos do teclado (?)"
                        >
                            <Keyboard className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-slate-700 text-slate-300"
                            onClick={onClose}
                            title="Fechar editor"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </header>

                {/* Conteúdo principal: 3 colunas */}
                <div className="flex flex-1 overflow-hidden bg-muted/30">
                    {/* Toolbar esquerda — categorizada com cores */}
                    <aside className="shrink-0 z-10 flex flex-col">
                        <Toolbar
                            canvas={fabricCanvas}
                            imageObject={imageObject}
                            onBackgroundRemoved={handleBackgroundRemoved}
                            mode={mode}
                            onModeChange={setMode}
                            onRotate={handleRotate}
                            onFlip={handleFlip}
                            onAddWatermark={handleAddWatermark}
                            onAddImage={handleAddImage}
                            cropRatio={cropRatio}
                            onCropRatioChange={setCropRatio}
                            isTransparent={isTransparent}
                            onSetStudioBackground={handleSetStudioBackground}
                            onAddBadge={handleAddBadge}
                            onIAEnhance={handleIAEnhance}
                            onAddMeasurement={handleAddMeasurement}
                            onApplyLogo={handleApplyOfficialLogo}
                            onAddMagnifier={handleAddMagnifier}
                            onSmartCenter={handleSmartCenter}
                            onOpenTemplates={() => setIsTemplatePickerOpen(true)}
                            onSmartCutout={handleSmartCutout}
                            onOpenTextStyles={() => setIsTextPickerOpen(true)}
                            onOpenShapeTemplates={(tab) => setShapePickerTab(tab)}
                        />
                    </aside>

                    {/* Canvas Area */}
                    <main className="relative flex-1 flex items-center justify-center p-4 sm:p-8 overflow-auto">
                        {/* Pro: toolbar flutuante de zoom */}
                        {currentImageUrl && !loading && (
                            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 bg-slate-900/85 backdrop-blur-sm rounded-full shadow-2xl border border-slate-700 flex items-center gap-0.5 p-1 text-white">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 rounded-full hover:bg-slate-700 text-slate-200"
                                    onClick={zoomOut}
                                    title="Diminuir zoom (Ctrl+Scroll)"
                                >
                                    <ZoomOut className="h-3.5 w-3.5" />
                                </Button>
                                <button
                                    onClick={resetZoom}
                                    className="text-[11px] font-bold tabular-nums px-2 min-w-[52px] text-center hover:text-primary transition-colors"
                                    title="Resetar zoom (100%)"
                                >
                                    {Math.round(zoom * 100)}%
                                </button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 rounded-full hover:bg-slate-700 text-slate-200"
                                    onClick={zoomIn}
                                    title="Aumentar zoom (Ctrl+Scroll)"
                                >
                                    <ZoomIn className="h-3.5 w-3.5" />
                                </Button>
                                <div className="h-5 w-px bg-slate-700 mx-0.5" />
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 rounded-full hover:bg-slate-700 text-slate-200"
                                    onClick={resetZoom}
                                    title="Ajustar à tela"
                                >
                                    <Maximize2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        )}
                        {loading && currentImageUrl && (
                            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-muted/50 backdrop-blur-sm gap-3">
                                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                                <p className="text-sm text-muted-foreground animate-pulse font-medium">
                                    Carregando editor...
                                </p>
                            </div>
                        )}

                        {!currentImageUrl ? (
                            <div className="flex flex-col items-center justify-center gap-6 p-12 border-4 border-dashed border-muted-foreground/20 rounded-3xl bg-background/50 hover:bg-background hover:border-primary/40 transition-all cursor-pointer group"
                                onClick={() => document.getElementById('initial-upload')?.click()}
                            >
                                <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <UploadCloud className="w-12 h-12 text-primary" />
                                </div>
                                <div className="text-center">
                                    <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Carregar Imagem</h3>
                                    <p className="text-muted-foreground font-medium">Arraste uma foto ou clique para buscar no seu dispositivo</p>
                                </div>
                                <input 
                                    id="initial-upload"
                                    type="file" 
                                    className="hidden" 
                                    accept="image/*"
                                    onChange={handleInitialUpload}
                                />
                                <Button size="lg" className="rounded-2xl px-12 font-bold uppercase tracking-widest">Selecionar do PC/Celular</Button>
                            </div>
                        ) : (
                            <div
                                ref={canvasWrapperRef}
                                onDragOver={handleCanvasDragOver}
                                onDragLeave={handleCanvasDragLeave}
                                onDrop={handleCanvasDrop}
                                onWheel={handleCanvasWheel}
                                className={cn(
                                    "relative shadow-2xl border-4 border-white rounded-sm overflow-hidden mx-auto transition-all bg-checkerboard",
                                    loading ? "opacity-0" : "opacity-100",
                                    isDraggingFile && "ring-4 ring-primary/60 border-primary scale-[1.01]"
                                )}
                            >
                                {/* Camada branca por trás do canvas — só aparece se !isTransparent.
                                    Mantém o xadrez visível como "papel" do editor sempre. */}
                                {!isTransparent && (
                                    <div className="absolute inset-0 bg-white pointer-events-none" />
                                )}
                                <canvas ref={handleCanvasRef} className="relative" />

                                {/* Zoom badge */}
                                {zoom !== 1 && (
                                    <div className="absolute bottom-2 right-2 bg-slate-900/80 text-white text-[11px] font-bold px-2 py-1 rounded-md backdrop-blur-sm tabular-nums pointer-events-none">
                                        {Math.round(zoom * 100)}%
                                    </div>
                                )}

                                {/* Drag-overlay */}
                                {isDraggingFile && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-primary/10 backdrop-blur-sm pointer-events-none">
                                        <div className="bg-white/90 text-primary px-6 py-3 rounded-2xl shadow-lg font-black uppercase tracking-widest text-sm">
                                            Solte a imagem aqui
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </main>

                    {/* ─── Painel direito com Tabs (Ajustes / Filtros / Camadas) ─── */}
                    <aside className="w-[300px] shrink-0 border-l bg-background flex flex-col overflow-hidden">
                        <div className="flex items-stretch border-b bg-slate-50 shrink-0">
                            {([
                                { id: "ajustes", label: "Ajustes", icon: Sliders },
                                { id: "filtros", label: "Filtros", icon: Sparkles },
                                { id: "camadas", label: "Camadas", icon: Layers },
                            ] as const).map((tab) => {
                                const TabIcon = tab.icon
                                const isActive = rightTab === tab.id
                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setRightTab(tab.id)}
                                        className={cn(
                                            "flex-1 flex flex-col items-center gap-0.5 py-2.5 px-1 text-[10px] font-black uppercase tracking-wide transition-all border-b-2",
                                            isActive
                                                ? "bg-background text-primary border-primary"
                                                : "text-slate-500 border-transparent hover:text-slate-700 hover:bg-slate-100"
                                        )}
                                    >
                                        <TabIcon className="h-4 w-4" />
                                        {tab.label}
                                    </button>
                                )
                            })}
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            {rightTab === "ajustes" && (
                                <PropertiesPanel
                                    canvas={fabricCanvas}
                                    imageObject={imageObject}
                                    onCommit={() => history.pushSnapshot()}
                                    mode={mode}
                                    eraserSize={eraserSize}
                                    onEraserSizeChange={setEraserSize}
                                />
                            )}
                            {rightTab === "filtros" && (
                                <div className="p-3 space-y-5">
                                    <FilterPresets
                                        imageObject={imageObject}
                                        onCommit={() => history.pushSnapshot()}
                                    />
                                    <div className="border-t border-slate-200 pt-4">
                                        <AdjustmentsPro
                                            imageObject={imageObject}
                                            onCommit={() => history.pushSnapshot()}
                                        />
                                    </div>
                                </div>
                            )}
                            {rightTab === "camadas" && (
                                <div className="p-3">
                                    <LayersPanel
                                        canvas={fabricCanvas}
                                        onCommit={() => history.pushSnapshot()}
                                    />
                                </div>
                            )}
                        </div>
                    </aside>
                </div>

                {/* Thumbnails */}
                {allUrls && allUrls.length > 1 && (
                    <div className="flex gap-2 p-3 border-t bg-muted/20 overflow-x-auto shrink-0 no-scrollbar">
                        {allUrls.map((u, i) => (
                            <button
                                key={i}
                                onClick={() => {
                                    if (u === currentImageUrl) return;
                                    if (window.confirm("Descartar alterações não salvas e editar esta foto?")) {
                                        setCurrentImageUrl(u)
                                    }
                                }}
                                className={`relative h-14 w-14 sm:h-16 sm:w-16 shrink-0 rounded-md overflow-hidden border-2 transition-all ${
                                    u === currentImageUrl ? "border-primary ring-2 ring-primary/30" : "border-transparent opacity-60 hover:opacity-100"
                                }`}
                                title="Editar esta imagem"
                            >
                                <img src={u} alt={`thumbnail-${i}`} className="w-full h-full object-cover" />
                            </button>
                        ))}
                    </div>
                )}

                {/* Rodapé */}
                <footer className="p-3 border-t bg-background flex flex-wrap justify-between items-center shrink-0 gap-3">
                    <div className="flex items-center gap-3 text-[10px] sm:text-xs text-muted-foreground">
                        <kbd className="px-2 py-1 bg-muted rounded border">DEL</kbd> excluir
                        <kbd className="px-2 py-1 bg-muted rounded border">Ctrl+Z</kbd> desfazer
                        <kbd className="px-2 py-1 bg-muted rounded border">Ctrl+Y</kbd> refazer
                    </div>
                    <div className="flex gap-4 items-center">
                        <label className="flex items-center gap-2 text-sm cursor-pointer text-muted-foreground hover:text-foreground">
                            <input
                                type="checkbox"
                                checked={replaceOriginal}
                                onChange={(e) => setReplaceOriginal(e.target.checked)}
                                className="rounded border-input"
                            />
                            Substituir foto original
                        </label>
                        <label
                            className={cn(
                                "flex items-center gap-2 text-sm font-bold cursor-pointer transition-colors",
                                autoRemovingBg ? "text-purple-600" : "text-slate-700 hover:text-emerald-600",
                                autoRemovingBg && "cursor-wait pointer-events-none"
                            )}
                            title="Marcar para remover fundo automaticamente via IA e deixar a imagem transparente"
                        >
                            <input
                                type="checkbox"
                                checked={isTransparent}
                                onChange={(e) => handleToggleTransparentBackground(e.target.checked)}
                                disabled={autoRemovingBg}
                                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                            />
                            {autoRemovingBg ? (
                                <span className="flex items-center gap-1.5">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Removendo fundo via IA...
                                </span>
                            ) : (
                                <>Fundo Transparente <span className="text-[10px] font-normal text-slate-500 ml-0.5">(IA)</span></>
                            )}
                        </label>

                        <div className="h-8 w-px bg-border mx-1" />

                        <Button
                            variant="outline"
                            onClick={() => setIsExportMenuOpen(true)}
                            disabled={!currentImageUrl || loading}
                            className="border-blue-200 text-blue-700 hover:bg-blue-50"
                        >
                            <Download className="h-4 w-4 mr-2" />
                            Exportar
                        </Button>

                        <Button 
                            variant="outline" 
                            onClick={() => handleShareWhatsApp()} 
                            disabled={!currentImageUrl || loading || sendingWhatsApp}
                            className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                        >
                            {sendingWhatsApp ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                            Enviar WhatsApp
                        </Button>

                        <div className="h-8 w-px bg-border mx-1" />

                        {produtoId && (
                            <Button 
                                variant="outline" 
                                onClick={handleRevertFundo} 
                                disabled={saving}
                                className="text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200"
                            >
                                <Undo2 className="h-4 w-4 mr-2 text-red-600" />
                                Reverter Fundo IA
                            </Button>
                        )}

                        <Button variant="outline" onClick={onClose} disabled={saving}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={saving || loading || !currentImageUrl}
                            className="min-w-[160px]"
                        >
                            {saving ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Salvando...
                                </>
                            ) : (
                                <>
                                    <Save className="h-4 w-4 mr-2" />
                                    {produtoId ? (replaceOriginal ? "Substituir foto" : "Salvar nova foto") : "Salvar no Produto"}
                                </>
                            )}
                        </Button>
                    </div>
                </footer>
            </div>
        </Modal>

        <WhatsAppContactPicker
            isOpen={isContactPickerOpen}
            onClose={() => setIsContactPickerOpen(false)}
            onSelect={(contact) => handleShareWhatsApp(contact.telefone)}
        />

        {/* Pro: Menu de Exportação avançado (formato + qualidade + resolução) */}
        <ExportMenu
            isOpen={isExportMenuOpen}
            onClose={() => setIsExportMenuOpen(false)}
            onExport={async ({ format, quality, multiplier }) => {
                if (!fabricCanvas) return
                try {
                    const dataUrl = fabricCanvas.toDataURL({
                        format,
                        quality,
                        multiplier,
                    })
                    const a = document.createElement('a')
                    a.href = dataUrl
                    a.download = `imagem-editada.${format === 'jpeg' ? 'jpg' : format}`
                    document.body.appendChild(a)
                    a.click()
                    document.body.removeChild(a)
                    toast.success('Download iniciado!')
                } catch (e) {
                    toast.error('Erro ao gerar imagem')
                    console.error(e)
                }
            }}
        />

        {/* Pro: Atalhos do teclado */}
        <KeyboardShortcutsHelp
            isOpen={isShortcutsOpen}
            onClose={() => setIsShortcutsOpen(false)}
        />

        {/* Pro: Galeria de estilos de texto + 30 fontes Google */}
        <TextStylesPicker
            isOpen={isTextPickerOpen}
            onClose={() => setIsTextPickerOpen(false)}
            canvas={fabricCanvas}
        />

        {/* Pro: Galeria de setas/formas/linhas profissionais */}
        <ShapeTemplatesPicker
            isOpen={shapePickerTab !== null}
            onClose={() => setShapePickerTab(null)}
            canvas={fabricCanvas}
            initialTab={shapePickerTab || "arrows"}
        />

        {/* Picker de Cenários */}
        <Modal isOpen={isStudioPickerOpen} onClose={() => setIsStudioPickerOpen(false)} title="Estúdio Virtual" className="max-w-md">
            <div className="grid grid-cols-2 gap-4">
                <button onClick={() => handleSetStudioBackground("white")} className="p-4 border rounded-xl hover:bg-muted flex flex-col items-center gap-2">
                    <div className="w-full h-12 bg-white border rounded shadow-inner" />
                    <span className="text-xs font-bold">Fundo Branco</span>
                </button>
                <button onClick={() => handleSetStudioBackground("grad-blue")} className="p-4 border rounded-xl hover:bg-muted flex flex-col items-center gap-2">
                    <div className="w-full h-12 bg-gradient-to-b from-blue-900 to-blue-500 border rounded shadow-inner" />
                    <span className="text-xs font-bold">Gradiente Azul</span>
                </button>
                <button onClick={() => handleSetStudioBackground("grad-gray")} className="p-4 border rounded-xl hover:bg-muted flex flex-col items-center gap-2">
                    <div className="w-full h-12 bg-gradient-to-b from-slate-700 to-slate-400 border rounded shadow-inner" />
                    <span className="text-xs font-bold">Estúdio Cinza</span>
                </button>
                <button onClick={() => handleSetStudioBackground("studio-floor")} className="p-4 border rounded-xl hover:bg-muted flex flex-col items-center gap-2">
                    <div className="w-full h-12 bg-slate-200 border rounded shadow-inner" />
                    <span className="text-xs font-bold">Piso de Estúdio</span>
                </button>
            </div>
        </Modal>

        {/* Picker de Selos */}
        <Modal isOpen={isBadgePickerOpen} onClose={() => setIsBadgePickerOpen(false)} title="Selos de Venda Premium" className="max-w-md">
            <div className="grid grid-cols-1 gap-3 p-1">
                <button onClick={() => handleAddBadge("garantia")} className="group flex items-center gap-4 p-4 border-2 border-slate-100 rounded-2xl hover:border-red-200 hover:bg-red-50/50 transition-all">
                    <div className="w-12 h-14 bg-gradient-to-b from-red-500 to-red-800 rounded-lg flex flex-col items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
                        <span className="text-[7px] text-white font-bold opacity-80">GARANTIA</span>
                        <span className="text-sm text-white font-black leading-tight">90</span>
                        <span className="text-[8px] text-white font-bold">DIAS</span>
                    </div>
                    <div className="text-left">
                        <p className="font-bold text-slate-800">Garantia de 90 Dias Total</p>
                        <p className="text-xs text-slate-500">Design Minimalista Premium</p>
                    </div>
                </button>

                <button onClick={() => handleAddBadge("original")} className="group flex items-center gap-4 p-4 border-2 border-slate-100 rounded-2xl hover:border-blue-200 hover:bg-blue-50/50 transition-all">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-700 rounded-xl rotate-45 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
                        <span className="-rotate-45 text-[7px] text-white font-black text-center leading-none">PEÇA<br/>ORIGINAL</span>
                    </div>
                    <div className="text-left">
                        <p className="font-bold text-slate-800">Certificado de Procedência</p>
                        <p className="text-xs text-slate-500">Design Vetorial Vibrante</p>
                    </div>
                </button>

                <button onClick={() => handleAddBadge("testado")} className="group flex items-center gap-4 p-4 border-2 border-slate-100 rounded-2xl hover:border-emerald-200 hover:bg-emerald-50/50 transition-all">
                    <div className="w-12 h-14 bg-gradient-to-b from-emerald-400 to-emerald-700 rounded-lg flex flex-col items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
                        <span className="text-[7px] text-white font-bold opacity-80 leading-none">TESTADO</span>
                        <span className="text-[14px] text-white">✅</span>
                        <span className="text-[7px] text-white font-bold opacity-80 leading-none">APROVADO</span>
                    </div>
                    <div className="text-left">
                        <p className="font-bold text-slate-800">Garantia de Funcionamento</p>
                        <p className="text-xs text-slate-500">Exemplo Suporte Original</p>
                    </div>
                </button>
            </div>
        </Modal>

        {/* Modal de Escolha de Templates */}
        <Modal isOpen={isTemplatePickerOpen} onClose={() => setIsTemplatePickerOpen(false)} title="Escolher Template Moderno" className="max-w-2xl">
            <div className="grid grid-cols-2 gap-4 p-1">
                <button onClick={() => handleApplyTemplate('flash_sale')} className="flex flex-col items-center gap-3 p-4 border-2 border-slate-100 rounded-2xl hover:border-rose-200 hover:bg-rose-50/30 transition-all group">
                    <div className="w-full h-24 bg-gradient-to-r from-rose-800 via-rose-500 to-rose-800 rounded-xl flex items-center justify-center shadow-md group-hover:scale-102 transition-transform">
                        <span className="text-white font-black text-sm tracking-tighter">OFERTA RELÂMPAGO ⚡</span>
                    </div>
                    <span className="text-sm font-bold text-slate-700">Faixa Superior Premium</span>
                </button>
                
                <button onClick={() => handleApplyTemplate('today_only')} className="flex flex-col items-center gap-3 p-4 border-2 border-slate-100 rounded-2xl hover:border-amber-200 hover:bg-amber-50/30 transition-all group">
                    <div className="w-20 h-20 bg-gradient-to-br from-amber-400 via-yellow-300 to-amber-600 rounded-full flex items-center justify-center shadow-md border-2 border-white group-hover:scale-105 transition-transform">
                        <span className="text-amber-950 font-black text-[10px] text-center leading-tight">SÓ<br/>HOJE!</span>
                    </div>
                    <span className="text-sm font-bold text-slate-700">Selo Circular Gold</span>
                </button>

                <button onClick={() => handleApplyTemplate('discount')} className="flex flex-col items-center gap-3 p-4 border-2 border-slate-100 rounded-2xl hover:border-blue-200 hover:bg-blue-50/30 transition-all group">
                    <div className="w-20 h-20 bg-gradient-to-br from-blue-400 to-blue-700 rounded-lg rotate-45 flex items-center justify-center shadow-md border-2 border-white group-hover:scale-105 transition-transform">
                        <span className="-rotate-45 text-white font-black text-sm">30% OFF</span>
                    </div>
                    <span className="text-sm font-bold text-slate-700">Selo de Desconto</span>
                </button>

                <button onClick={() => handleApplyTemplate('highlight')} className="flex flex-col items-center gap-3 p-4 border-2 border-slate-100 rounded-2xl hover:border-emerald-200 hover:bg-emerald-50/30 transition-all group">
                    <div className="w-full h-20 bg-gradient-to-r from-emerald-900 via-emerald-500 to-emerald-900 rounded-lg flex items-center justify-center shadow-md group-hover:scale-102 transition-transform relative overflow-hidden">
                        <div className="absolute left-0 w-4 h-full bg-emerald-700 -skew-x-12" />
                        <span className="text-white font-bold text-[10px] text-center px-4">SUPER OFERTA EM DESTAQUE 🏆</span>
                    </div>
                    <span className="text-sm font-bold text-slate-700">Faixa de Destaque</span>
                </button>
            </div>
        </Modal>
        </>
    )
}
