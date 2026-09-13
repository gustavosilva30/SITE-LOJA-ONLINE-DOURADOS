import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { Download, FileImage, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface ExportMenuProps {
    isOpen: boolean
    onClose: () => void
    onExport: (opts: { format: "png" | "jpeg" | "webp"; quality: number; multiplier: number }) => Promise<void>
}

const FORMATS = [
    {
        id: "jpeg" as const,
        label: "JPG",
        desc: "Menor tamanho, ideal pra fotos e WhatsApp",
        recommended: true,
    },
    {
        id: "png" as const,
        label: "PNG",
        desc: "Suporta fundo transparente, qualidade máxima",
        recommended: false,
    },
    {
        id: "webp" as const,
        label: "WebP",
        desc: "Moderno, melhor compressão; alguns navegadores podem não abrir",
        recommended: false,
    },
]

const SIZE_PRESETS = [
    { id: 1, label: "1×", desc: "Tamanho original do canvas" },
    { id: 2, label: "2×", desc: "Alta resolução pra impressão" },
    { id: 3, label: "3×", desc: "Ultra HD" },
]

export const ExportMenu: React.FC<ExportMenuProps> = ({ isOpen, onClose, onExport }) => {
    const [format, setFormat] = useState<"png" | "jpeg" | "webp">("jpeg")
    const [quality, setQuality] = useState(90)
    const [multiplier, setMultiplier] = useState(1)
    const [exporting, setExporting] = useState(false)

    const handleConfirm = async () => {
        setExporting(true)
        try {
            await onExport({ format, quality: quality / 100, multiplier })
            onClose()
        } finally {
            setExporting(false)
        }
    }

    const supportsQuality = format !== "png"

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Exportar imagem" className="max-w-md">
            <div className="space-y-5 py-2">
                {/* Formato */}
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Formato
                    </label>
                    <div className="space-y-1.5">
                        {FORMATS.map((f) => (
                            <button
                                key={f.id}
                                type="button"
                                onClick={() => setFormat(f.id)}
                                className={cn(
                                    "w-full flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all",
                                    format === f.id
                                        ? "border-primary bg-primary/5"
                                        : "border-slate-200 hover:border-slate-300"
                                )}
                            >
                                <FileImage className={cn(
                                    "h-5 w-5 shrink-0 mt-0.5",
                                    format === f.id ? "text-primary" : "text-slate-400"
                                )} />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className={cn(
                                            "font-bold text-sm",
                                            format === f.id ? "text-primary" : "text-slate-800"
                                        )}>{f.label}</span>
                                        {f.recommended && (
                                            <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                                                Recomendado
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[11px] text-slate-500 mt-0.5">{f.desc}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Qualidade (só JPG/WebP) */}
                {supportsQuality && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                Qualidade
                            </label>
                            <span className="text-sm font-bold text-slate-700 tabular-nums">{quality}%</span>
                        </div>
                        <input
                            type="range"
                            min={50}
                            max={100}
                            step={5}
                            value={quality}
                            onChange={(e) => setQuality(parseInt(e.target.value))}
                            className="w-full"
                        />
                        <div className="flex justify-between text-[10px] text-slate-400">
                            <span>Menor (50%)</span>
                            <span>Padrão (90%)</span>
                            <span>Máxima (100%)</span>
                        </div>
                    </div>
                )}

                {/* Tamanho */}
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Resolução
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                        {SIZE_PRESETS.map((s) => (
                            <button
                                key={s.id}
                                type="button"
                                onClick={() => setMultiplier(s.id)}
                                className={cn(
                                    "py-2 px-3 rounded-xl border-2 text-center transition-all",
                                    multiplier === s.id
                                        ? "border-primary bg-primary/5 text-primary"
                                        : "border-slate-200 hover:border-slate-300 text-slate-700"
                                )}
                                title={s.desc}
                            >
                                <span className="font-black text-base">{s.label}</span>
                            </button>
                        ))}
                    </div>
                    <p className="text-[10px] text-slate-500 italic">
                        {SIZE_PRESETS.find(s => s.id === multiplier)?.desc}
                    </p>
                </div>

                {/* Ações */}
                <div className="flex gap-2 pt-2">
                    <Button variant="outline" onClick={onClose} disabled={exporting} className="flex-1">
                        Cancelar
                    </Button>
                    <Button onClick={handleConfirm} disabled={exporting} className="flex-1 gap-2">
                        {exporting ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Gerando...
                            </>
                        ) : (
                            <>
                                <Download className="h-4 w-4" />
                                Baixar
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </Modal>
    )
}
