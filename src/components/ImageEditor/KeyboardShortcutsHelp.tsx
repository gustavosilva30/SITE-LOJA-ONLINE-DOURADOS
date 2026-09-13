import React from "react"
import { Modal } from "@/components/ui/modal"
import { Keyboard } from "lucide-react"

interface KeyboardShortcutsHelpProps {
    isOpen: boolean
    onClose: () => void
}

const SHORTCUTS = [
    { keys: ["Del"], desc: "Excluir camada selecionada" },
    { keys: ["Ctrl", "Z"], desc: "Desfazer" },
    { keys: ["Ctrl", "Y"], desc: "Refazer" },
    { keys: ["Ctrl", "Shift", "Z"], desc: "Refazer (alternativo)" },
    { keys: ["V"], desc: "Modo Seleção" },
    { keys: ["B"], desc: "Modo Pincel" },
    { keys: ["C"], desc: "Modo Recorte" },
    { keys: ["E"], desc: "Modo Borracha" },
    { keys: ["T"], desc: "Adicionar Texto" },
    { keys: ["R"], desc: "Adicionar Retângulo" },
    { keys: ["Esc"], desc: "Cancelar / Voltar pra Seleção" },
    { keys: ["Ctrl", "S"], desc: "Salvar" },
    { keys: ["Ctrl", "D"], desc: "Duplicar camada" },
    { keys: ["Setas"], desc: "Mover objeto selecionado em 1px" },
    { keys: ["Shift", "Setas"], desc: "Mover em 10px" },
]

export const KeyboardShortcutsHelp: React.FC<KeyboardShortcutsHelpProps> = ({ isOpen, onClose }) => {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Atalhos do teclado" className="max-w-md">
            <div className="space-y-3 py-2">
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    <Keyboard className="h-4 w-4" />
                    <span>Use atalhos pra trabalhar mais rápido no editor.</span>
                </div>
                <div className="divide-y divide-slate-100 -mx-1">
                    {SHORTCUTS.map((s, i) => (
                        <div key={i} className="flex items-center justify-between py-2 px-1">
                            <span className="text-sm text-slate-700">{s.desc}</span>
                            <div className="flex items-center gap-1">
                                {s.keys.map((k, j) => (
                                    <React.Fragment key={j}>
                                        {j > 0 && <span className="text-slate-400 text-[11px]">+</span>}
                                        <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-300 rounded text-[10px] font-mono font-bold text-slate-700 shadow-sm min-w-[24px] text-center">
                                            {k}
                                        </kbd>
                                    </React.Fragment>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </Modal>
    )
}
