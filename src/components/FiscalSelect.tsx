import { useState, useRef, useEffect } from "react"
import { ChevronDown, Search, Check } from "lucide-react"

export interface FiscalOption {
  value: string
  label: string
}

interface FiscalSelectProps {
  value: string
  onChange: (value: string) => void
  options: FiscalOption[]
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function FiscalSelect({
  value,
  onChange,
  options,
  placeholder,
  className,
  disabled,
}: FiscalSelectProps) {
  const [search, setSearch] = useState("")
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const filtered = options.filter(
    (o) =>
      o.value.includes(search) ||
      o.label.toLowerCase().includes(search.toLowerCase())
  )

  const selected = options.find((o) => o.value === value)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  return (
    <div ref={ref} className={`relative ${className || ""}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen((o) => !o)
          if (!open) setSearch("")
        }}
        className="w-full flex items-center justify-between px-3 py-2 text-sm border rounded-md bg-background hover:bg-muted/50 text-left"
      >
        <span className="truncate">
          {selected
            ? `${selected.value} — ${selected.label}`
            : value
              ? `${value}`
              : placeholder || "Selecionar..."}
        </span>
        <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-background border rounded-md shadow-lg max-h-72 flex flex-col">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 text-sm border rounded bg-muted/30 outline-none"
                placeholder="Buscar código ou descrição..."
              />
            </div>
          </div>
          <div className="overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground text-center">
                Nenhum resultado
              </div>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    onChange(o.value)
                    setOpen(false)
                    setSearch("")
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-start gap-2 ${
                    o.value === value ? "bg-primary/10 font-medium" : ""
                  }`}
                >
                  {o.value === value ? (
                    <Check className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" />
                  ) : (
                    <span className="w-3.5" />
                  )}
                  <span>
                    <span className="font-mono">{o.value}</span>
                    <span className="text-muted-foreground ml-1">— {o.label}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
