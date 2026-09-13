import React, { useEffect, useState, useRef } from "react"
import { cn } from "@/lib/utils"
import { Pipette, X } from "lucide-react"

interface ColorPickerProProps {
    value: string
    onChange: (color: string) => void
    label?: string
    showAlpha?: boolean
}

const RECENT_KEY = "imgeditor:recent-colors"
const MAX_RECENT = 8

const PRESETS = [
    "#000000", "#ffffff", "#6b7280", "#9ca3af",
    "#ef4444", "#f97316", "#fbbf24", "#eab308",
    "#22c55e", "#10b981", "#14b8a6", "#06b6d4",
    "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7",
    "#d946ef", "#ec4899", "#f43f5e", "#a3a3a3",
]

function loadRecent(): string[] {
    try {
        const raw = localStorage.getItem(RECENT_KEY)
        if (!raw) return []
        return JSON.parse(raw).slice(0, MAX_RECENT)
    } catch {
        return []
    }
}

function pushRecent(color: string) {
    if (!color) return
    try {
        const arr = loadRecent().filter(c => c.toLowerCase() !== color.toLowerCase())
        arr.unshift(color)
        localStorage.setItem(RECENT_KEY, JSON.stringify(arr.slice(0, MAX_RECENT)))
    } catch {}
}

export const ColorPickerPro: React.FC<ColorPickerProProps> = ({ value, onChange, label, showAlpha = false }) => {
    const [open, setOpen] = useState(false)
    const [recent, setRecent] = useState<string[]>(() => loadRecent())
    const popoverRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        const onClickOutside = (e: MouseEvent) => {
            if (!popoverRef.current?.contains(e.target as Node)) setOpen(false)
        }
        const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
        document.addEventListener("mousedown", onClickOutside)
        document.addEventListener("keydown", onEsc)
        return () => {
            document.removeEventListener("mousedown", onClickOutside)
            document.removeEventListener("keydown", onEsc)
        }
    }, [open])

    const handlePick = (c: string) => {
        onChange(c)
        pushRecent(c)
        setRecent(loadRecent())
    }

    const tryEyedropper = async () => {
        // EyeDropper API (Chrome/Edge desktop) — pega cor de qualquer pixel da tela
        const EyeDropper = (window as any).EyeDropper
        if (!EyeDropper) {
            alert("Conta-gotas não suportado neste navegador (use Chrome/Edge desktop)")
            return
        }
        try {
            const r = await new EyeDropper().open()
            if (r?.sRGBHex) handlePick(r.sRGBHex)
            setOpen(false)
        } catch { /* user cancelled */ }
    }

    return (
        <div className="relative">
            {label && (
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">
                    {label}
                </label>
            )}
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-full h-10 rounded-lg border-2 border-slate-200 bg-white p-1 flex items-center gap-2 hover:border-slate-300 transition-all"
            >
                <div
                    className="w-7 h-7 rounded-md border border-slate-300 shadow-inner shrink-0"
                    style={{ backgroundColor: value }}
                />
                <span className="text-xs font-mono font-bold text-slate-700 tabular-nums uppercase flex-1 text-left">
                    {value}
                </span>
            </button>

            {open && (
                <div
                    ref={popoverRef}
                    className="absolute z-50 mt-1.5 left-0 w-64 bg-white border border-slate-200 rounded-xl shadow-2xl p-3 space-y-3"
                >
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                            Selecionar cor
                        </span>
                        <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>

                    {/* Color picker nativo (com gradient + matiz) */}
                    <div className="flex items-stretch gap-2">
                        <input
                            type="color"
                            value={value}
                            onChange={(e) => handlePick(e.target.value)}
                            className="h-10 w-10 rounded border border-slate-300 cursor-pointer"
                        />
                        <input
                            type="text"
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            onBlur={(e) => pushRecent(e.target.value)}
                            placeholder="#ff0000"
                            className="flex-1 h-10 px-2 rounded border border-slate-300 text-sm font-mono uppercase focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                        />
                        <button
                            type="button"
                            onClick={tryEyedropper}
                            className="h-10 w-10 flex items-center justify-center rounded border border-slate-300 hover:bg-slate-50 hover:border-primary text-slate-600 hover:text-primary"
                            title="Conta-gotas (selecionar cor da tela)"
                        >
                            <Pipette className="h-4 w-4" />
                        </button>
                    </div>

                    {/* Presets */}
                    <div>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Padrão</p>
                        <div className="grid grid-cols-10 gap-1">
                            {PRESETS.map(c => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => handlePick(c)}
                                    className={cn(
                                        "w-5 h-5 rounded border transition-all hover:scale-110",
                                        value.toLowerCase() === c.toLowerCase()
                                            ? "border-slate-800 ring-2 ring-primary"
                                            : "border-slate-200"
                                    )}
                                    style={{ backgroundColor: c }}
                                    title={c}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Recentes */}
                    {recent.length > 0 && (
                        <div>
                            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                                Recentes
                            </p>
                            <div className="grid grid-cols-10 gap-1">
                                {recent.map(c => (
                                    <button
                                        key={c}
                                        type="button"
                                        onClick={() => handlePick(c)}
                                        className={cn(
                                            "w-5 h-5 rounded border transition-all hover:scale-110",
                                            value.toLowerCase() === c.toLowerCase()
                                                ? "border-slate-800 ring-2 ring-primary"
                                                : "border-slate-200"
                                        )}
                                        style={{ backgroundColor: c }}
                                        title={c}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
