import { useEffect, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { getPortalRoot } from "@/lib/portalRoot"

type SheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}

/** Painel lateral (estilo shadcn Sheet), sem @radix-ui/react-dialog. */
export function Sheet({ open, onOpenChange, children }: SheetProps) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false)
    }
    if (open) {
      document.body.style.overflow = "hidden"
      window.addEventListener("keydown", onEsc)
    }
    return () => {
      document.body.style.overflow = ""
      window.removeEventListener("keydown", onEsc)
    }
  }, [open, onOpenChange])

  const root = getPortalRoot("portal-modal-root")
  if (!root) return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
            onClick={() => onOpenChange(false)}
            aria-hidden
          />
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    root,
  )
}

type SheetContentProps = {
  side?: "right" | "left"
  className?: string
  children: ReactNode
}

export function SheetContent({ side = "right", className, children }: SheetContentProps) {
  return (
    <motion.div
      initial={{ x: side === "right" ? "100%" : "-100%" }}
      animate={{ x: 0 }}
      exit={{ x: side === "right" ? "100%" : "-100%" }}
      transition={{ type: "spring", damping: 30, stiffness: 320 }}
      className={cn(
        "absolute top-0 bottom-0 z-[101] flex w-full max-w-[min(100vw,480px)] flex-col bg-card shadow-2xl",
        side === "right" ? "right-0 border-l border-border" : "left-0 border-r border-border",
        className,
      )}
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
    >
      {children}
    </motion.div>
  )
}

type SheetSubProps = {
  className?: string
  children: ReactNode
}

export function SheetHeader({ className, children }: SheetSubProps) {
  return (
    <div className={`flex flex-col space-y-1.5 p-6 pb-2${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  )
}

export function SheetTitle({ className, children }: SheetSubProps) {
  return (
    <h2 className={`text-lg font-semibold leading-none tracking-tight${className ? ` ${className}` : ""}`}>
      {children}
    </h2>
  )
}

export function SheetDescription({ className, children }: SheetSubProps) {
  return (
    <p className={`text-sm text-muted-foreground${className ? ` ${className}` : ""}`}>
      {children}
    </p>
  )
}
