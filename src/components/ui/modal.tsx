import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { getPortalRoot } from "@/lib/portalRoot"

interface ModalProps {
    isOpen: boolean
    onClose: () => void
    title: string
    children: React.ReactNode
    className?: string
    contentClassName?: string
    /** Alinha o diálogo ao topo (útil para modais altos). */
    alignTop?: boolean
}

export function Modal({ isOpen, onClose, title, children, className, contentClassName, alignTop }: ModalProps) {
    const [isMounted, setIsMounted] = useState(false)
    
    useEffect(() => {
        setIsMounted(true)
    }, [])
    
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose()
        }
        if (isOpen) {
            document.body.style.overflow = "hidden"
            window.addEventListener("keydown", handleEscape)
        }
        return () => {
            document.body.style.overflow = "unset"
            window.removeEventListener("keydown", handleEscape)
        }
    }, [isOpen, onClose])

    if (!isMounted || typeof document === "undefined") return null
    
    const portalRoot = getPortalRoot("portal-modal-root")
    if (!portalRoot) return null

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <div
                    className={cn(
                        'fixed inset-0 z-50 flex justify-center p-3 sm:p-6 overflow-y-auto',
                        alignTop ? 'items-start pt-6 sm:pt-10' : 'items-center'
                    )}
                    role="dialog"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-background/80 backdrop-blur-sm modal-backdrop"
                    />

                    {/* Content */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        className={cn(
                            "relative bg-card border border-border w-full rounded-xl shadow-2xl overflow-x-hidden modal-container print:border-none print:shadow-none print:rounded-none",
                            !className?.includes('max-w-') && "max-w-full sm:max-w-lg",
                            className
                        )}
                    >
                        <div className="flex items-center justify-between px-6 py-4 sm:px-8 sm:py-5 border-b border-border bg-muted/40 no-print">
                            <h2 className="text-lg sm:text-xl font-bold tracking-tight pr-4">{title}</h2>
                            <button
                                onClick={onClose}
                                className="p-1 hover:bg-muted rounded-full transition-colors"
                                aria-label="Fechar"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className={cn("p-6 md:p-8 max-h-[80vh] overflow-y-auto modal-body print:p-0", contentClassName)}>
                            {children}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        portalRoot
    )
}
