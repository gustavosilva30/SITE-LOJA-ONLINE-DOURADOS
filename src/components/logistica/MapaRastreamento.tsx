import { useState, useCallback, useEffect, useRef, type ReactNode } from "react"
import { GoogleMap, useJsApiLoader, Marker, InfoWindow, Polyline } from "@react-google-maps/api"
import { logisticaRastreamentoApi } from "@/lib/api"

const containerStyle = { width: "100%", height: "100%" }
const center = { lat: -20.4697, lng: -54.6201 } // Dourados, MS

// ─── SVG Pin Factory ──────────────────────────────────────────────────────────
// Generates a teardrop location pin (44×56) with a centered icon.
function pin(bgColor: string, iconSvg: string, glowColor = bgColor): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="56" viewBox="0 0 44 56">
  <defs>
    <radialGradient id="inner" cx="38%" cy="30%" r="55%">
      <stop offset="0%" stop-color="white" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="black" stop-opacity="0.08"/>
    </radialGradient>
    <filter id="dropshadow" x="-30%" y="-15%" width="160%" height="160%">
      <feDropShadow dx="0" dy="3" stdDeviation="3.5" flood-color="${glowColor}" flood-opacity="0.55"/>
    </filter>
  </defs>
  <!-- Ground glow -->
  <ellipse cx="22" cy="53" rx="7" ry="2.5" fill="${glowColor}" opacity="0.28"/>
  <!-- Pin body -->
  <path d="M22 2C11.5 2 3 10.5 3 21C3 34.5 22 54 22 54C22 54 41 34.5 41 21C41 10.5 32.5 2 22 2Z"
        fill="${bgColor}" filter="url(#dropshadow)"/>
  <!-- Gloss overlay -->
  <path d="M22 2C11.5 2 3 10.5 3 21C3 34.5 22 54 22 54C22 54 41 34.5 41 21C41 10.5 32.5 2 22 2Z"
        fill="url(#inner)"/>
  <!-- Icon -->
  ${iconSvg}
</svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

// ─── Icon Paths (centered ~22,20) ────────────────────────────────────────────
const ICON_BOX = `
  <rect x="12" y="15" width="20" height="16" rx="2" fill="none" stroke="white" stroke-width="2"/>
  <polyline points="12,19 22,23 32,19" fill="none" stroke="white" stroke-width="2"/>
  <line x1="22" y1="23" x2="22" y2="31" stroke="white" stroke-width="2"/>
  <polyline points="16,13 22,16 28,13" fill="none" stroke="white" stroke-width="1.5"/>`

const ICON_TRUCK = `
  <rect x="8" y="17" width="18" height="12" rx="1.5" fill="white" opacity="0.95"/>
  <path d="M26 20 L34 20 L34 29 L26 29 Z" fill="white" opacity="0.95"/>
  <path d="M26 20 L32 20 L34 23 L34 20 Z" fill="white" opacity="0.7"/>
  <rect x="26" y="20" width="8" height="9" rx="0" fill="white" opacity="0.95"/>
  <path d="M26 20 L30.5 20 L34 23.5 L34 29 L26 29 Z" fill="white" opacity="0.95"/>
  <circle cx="13" cy="29" r="2.5" fill="${"#2563eb"}" stroke="white" stroke-width="1.5"/>
  <circle cx="29.5" cy="29" r="2.5" fill="${"#2563eb"}" stroke="white" stroke-width="1.5"/>
  <rect x="8" y="21" width="5" height="4" rx="0.5" fill="#93c5fd"/>`

const ICON_CHECK = `
  <path d="M11 21 L18 28 L33 14" stroke="white" stroke-width="3.5"
        fill="none" stroke-linecap="round" stroke-linejoin="round"/>`

const ICON_PERSON = `
  <circle cx="22" cy="15" r="5.5" fill="white"/>
  <path d="M10 32 C10 25 34 25 34 32" fill="white" stroke="none"/>
  <path d="M10 30 Q10 26 22 25 Q34 26 34 30 L34 32 L10 32 Z" fill="white"/>`

const ICON_NAV = `
  <polygon points="22,10 34,32 22,27 10,32" fill="white"/>
  <polygon points="22,13 31,30 22,25.5 13,30" fill="white" opacity="0.6"/>`

const ICON_MINUS = `
  <rect x="11" y="19" width="22" height="4" rx="2" fill="white"/>
  <rect x="11" y="24" width="14" height="3" rx="1.5" fill="white" opacity="0.5"/>`

const ICON_POWER = `
  <path d="M22 11 L22 21" stroke="white" stroke-width="3" stroke-linecap="round"/>
  <path d="M14.5 16.2 A9.5 9.5 0 1 0 29.5 16.2"
        fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"/>`

// ─── Cached Pin URLs ──────────────────────────────────────────────────────────
// ─── Cached Pin URLs ──────────────────────────────────────────────────────────
const PINS = {
  // Entregas
  pendente:    pin("#f59e0b", ICON_BOX,    "#f59e0b"),   // Amber
  emTransito:  pin("#2563eb", ICON_TRUCK,  "#2563eb"),   // Blue
  entregue:    pin("#16a34a", ICON_CHECK,  "#16a34a"),   // Green

  // Motoristas
  online:      pin("#0ea5e9", ICON_PERSON, "#0ea5e9"),   // Sky blue
  emRota:      pin("#7c3aed", ICON_NAV,    "#7c3aed"),   // Purple
  parado:      pin("#dc2626", ICON_MINUS,  "#dc2626"),   // Red
  offline:     pin("#64748b", ICON_POWER,  "#64748b"),   // Slate
  semSinal:    pin("#94a3b8", ICON_POWER,  "#f43f5e"),   // Slate pin with red/glow warning
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function entregaPin(status: string) {
  const s = (status || "").toLowerCase()
  if (s.includes("entregue") || s.includes("concluí")) return PINS.entregue
  if (s.includes("trânsito") || s.includes("transit") || s.includes("saiu")) return PINS.emTransito
  return PINS.pendente
}

function motoristaPin(online: boolean, velocidade: number | null, em_turno?: boolean, sinal_ao_vivo?: boolean) {
  if (em_turno && !sinal_ao_vivo) return PINS.semSinal
  if (!online && !em_turno) return PINS.offline
  if (velocidade !== null && velocidade > 4) return PINS.emRota
  if (velocidade !== null && velocidade <= 4) return PINS.parado
  return PINS.online
}

// ─── Animated Marker Component ────────────────────────────────────────────────
function AnimatedMarker({
  lat,
  lng,
  icon,
  title,
  onClick,
  children
}: {
  lat: number
  lng: number
  icon: any
  title: string
  onClick: () => void
  children?: ReactNode
}) {
  const [currentPos, setCurrentPos] = useState({ lat, lng })
  const animationRef = useRef<any>(null)
  const targetPosRef = useRef({ lat, lng })

  useEffect(() => {
    targetPosRef.current = { lat, lng }
    const duration = 1500
    const startTime = performance.now()
    const startPos = { ...currentPos }

    const animate = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const t = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress

      const nextLat = startPos.lat + (targetPosRef.current.lat - startPos.lat) * t
      const nextLng = startPos.lng + (targetPosRef.current.lng - startPos.lng) * t
      
      setCurrentPos({ lat: nextLat, lng: nextLng })

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate)
      }
    }

    if (animationRef.current) cancelAnimationFrame(animationRef.current)
    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [lat, lng])

  return (
    <Marker
      position={currentPos}
      icon={icon}
      title={title}
      onClick={onClick}
    >
      {children}
    </Marker>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface PontoEntrega {
  id: string
  lat: number
  lng: number
  cliente: string
  endereco?: string
  status: string
}

interface MotoristaMapaProps {
  id: string
  nome: string
  lat: number
  lon: number
  velocidade?: number | null
  bateria?: number | null
  online: boolean
  em_turno?: boolean
  sinal_ao_vivo?: boolean
}

interface MapaRastreamentoProps {
  motoristas: MotoristaMapaProps[]
  rotas?: Array<{ id: string; caminho: Array<{ lat: number; lng: number }>; cor?: string }>
  pontosEntrega?: PontoEntrega[]
  // Trajetos em tempo real por motorista (motorista_id -> array de coordenadas)
  trajetos?: Map<string, { lat: number; lng: number }[]>
}

// ─── Component ────────────────────────────────────────────────────────────────
export function MapaRastreamento({ motoristas, rotas = [], pontosEntrega = [], trajetos = new Map() }: MapaRastreamentoProps) {
  const { isLoaded } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
  })

  const [map, setMap] = useState<google.maps.Map | null>(null)
  const [selectedMotorista, setSelectedMotorista] = useState<string | null>(null)
  const [selectedEntrega, setSelectedEntrega] = useState<string | null>(null)
  const [hasInitialFit, setHasInitialFit] = useState(false)

  // Estados para snap to roads (alinhar rota com as ruas)
  const snappedTrajetosRef = useRef<Map<string, { lat: number; lng: number }[]>>(new Map())
  const previousTrajetosRef = useRef<Map<string, number>>(new Map())
  const [renderTrajetos, setRenderTrajetos] = useState<Map<string, { lat: number; lng: number }[]>>(new Map())

  useEffect(() => {
    setRenderTrajetos(new Map(trajetos))
  }, [trajetos])

  const onLoad = useCallback((m: google.maps.Map) => setMap(m), [])
  const onUnmount = useCallback(() => setMap(null), [])

  // Snap-to-roads via backend (a Roads API REST rejeita chave restrita por
  // HTTP referrer, então isso passa pelo servidor — ver logistica_rastreamento.py)
  const fetchSnapToRoads = async (points: { lat: number; lng: number }[], motoristaId: string) => {
    if (points.length === 0) return

    try {
      const batch = points.slice(-100)
      const data = await logisticaRastreamentoApi.snapToRoads(batch)

      if (data?.pontos && data.pontos.length > 0) {
        const snappedPoints = data.pontos

        snappedTrajetosRef.current.set(motoristaId, snappedPoints)
        setRenderTrajetos(prev => {
          const m = new Map(prev)
          m.set(motoristaId, snappedPoints)
          return m
        })
      }
    } catch (e) {
      console.warn("[SnapToRoads] Error snapping points:", e)
    }
  }

  // Trigger snap to roads when 5 new points are loaded
  useEffect(() => {
    if (!selectedMotorista) return
    const rawPath = trajetos.get(selectedMotorista) || []
    if (rawPath.length === 0) return

    const previousCount = previousTrajetosRef.current.get(selectedMotorista) || 0
    const diff = rawPath.length - previousCount
    
    if (previousCount === 0 || diff >= 5) {
      previousTrajetosRef.current.set(selectedMotorista, rawPath.length)
      fetchSnapToRoads(rawPath, selectedMotorista)
    }
  }, [trajetos, selectedMotorista])

  // Auto-fit bounds to show all points
  useEffect(() => {
    if (!map || hasInitialFit) return
    const allPoints = [
      ...motoristas.filter(m => m.lat && m.lon).map(m => ({ lat: m.lat, lng: m.lon })),
      ...pontosEntrega.filter(p => p.lat && p.lng).map(p => ({ lat: p.lat, lng: p.lng })),
    ]
    if (allPoints.length === 0) return

    const bounds = new window.google.maps.LatLngBounds()
    allPoints.forEach(p => bounds.extend(p))
    map.fitBounds(bounds)

    const listener = window.google.maps.event.addListener(map, "idle", () => {
      if (map.getZoom()! > 16) map.setZoom(16)
      window.google.maps.event.removeListener(listener)
    })
    setHasInitialFit(true)
  }, [map, motoristas, pontosEntrega, hasInitialFit])

  if (!isLoaded) return (
    <div className="w-full h-full bg-slate-100 dark:bg-slate-800 animate-pulse flex items-center justify-center">
      <span className="text-muted-foreground font-medium">Carregando Mapa...</span>
    </div>
  )

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={center}
      zoom={12}
      onLoad={onLoad}
      onUnmount={onUnmount}
      options={{
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        styles: [
          { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
          { featureType: "transit", elementType: "labels", stylers: [{ visibility: "off" }] },
        ],
      }}
    >
      {/* ── ROTA PERCORRIDA (Histórico API) ── */}
      {rotas.map(rota => (
        <Polyline
          key={rota.id}
          path={rota.caminho}
          options={{
            strokeColor: rota.cor || "#7c3aed",
            strokeOpacity: 0.85,
            strokeWeight: 5,
            icons: [{
              icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 },
              offset: "0",
              repeat: "20px",
            }],
          }}
        />
      ))}

      {/* ── TRAJETOS EM TEMPO REAL (Snappados nas ruas) ── */}
      {Array.from(renderTrajetos.entries()).map(([motoristaId, caminho]) => (
        <Polyline
          key={`traj-${motoristaId}`}
          path={caminho}
          options={{
            strokeColor: "#7c3aed", // roxo
            strokeOpacity: 0.9,
            strokeWeight: 5,
            icons: [{
              icon: {
                path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                scale: 3,
                strokeColor: "#7c3aed",
                fillColor: "#7c3aed",
                fillOpacity: 1,
              },
              offset: "100%",
              repeat: "80px", // Seta a cada 80px do percurso
            }],
          }}
        />
      ))}

      {/* ── PINS DE ENTREGA ── */}
      {pontosEntrega.map(p => {
        if (!p.lat || !p.lng) return null
        const isSelected = selectedEntrega === p.id
        return (
          <Marker
            key={`e-${p.id}`}
            position={{ lat: p.lat, lng: p.lng }}
            onClick={() => setSelectedEntrega(isSelected ? null : p.id)}
            icon={{
              url: entregaPin(p.status),
              scaledSize: new window.google.maps.Size(isSelected ? 50 : 40, isSelected ? 64 : 51),
              anchor: new window.google.maps.Point(isSelected ? 25 : 20, isSelected ? 62 : 49),
            }}
            zIndex={isSelected ? 20 : 10}
          >
            {isSelected && (
              <InfoWindow onCloseClick={() => setSelectedEntrega(null)}>
                <div className="p-1 min-w-[160px] text-slate-800 font-sans">
                  <p className="font-bold text-sm mb-1 text-slate-900">{p.cliente}</p>
                  {p.endereco && <p className="text-xs text-slate-600 mb-1">{p.endereco}</p>}
                  <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    p.status.toLowerCase().includes("entregue")
                      ? "bg-green-100 text-green-700"
                      : p.status.toLowerCase().includes("trânsito") || p.status.toLowerCase().includes("transit")
                        ? "bg-blue-100 text-blue-700"
                        : "bg-amber-100 text-amber-700"
                  }`}>
                    {p.status}
                  </span>
                </div>
              </InfoWindow>
            )}
          </Marker>
        )
      })}

      {/* ── PINS DOS MOTORISTAS (Com Animação de Deslizamento) ── */}
      {motoristas.map(m => {
        if (!m.lat || !m.lon) return null
        const isSelected = selectedMotorista === m.id
        const pinUrl = motoristaPin(m.online, m.velocidade ?? null, m.em_turno, m.sinal_ao_vivo)

        return (
          <AnimatedMarker
            key={`m-${m.id}`}
            lat={m.lat}
            lng={m.lon}
            title={m.nome}
            onClick={() => setSelectedMotorista(isSelected ? null : m.id)}
            icon={{
              url: pinUrl,
              scaledSize: new window.google.maps.Size(isSelected ? 52 : 42, isSelected ? 66 : 53),
              anchor: new window.google.maps.Point(isSelected ? 26 : 21, isSelected ? 64 : 51),
            }}
          >
            {isSelected && (
              <InfoWindow onCloseClick={() => setSelectedMotorista(null)}>
                <div className="p-1 min-w-[140px] text-slate-800 font-sans">
                  <p className="font-bold text-sm mb-1 text-slate-900">{m.nome}</p>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`w-2 h-2 rounded-full ${m.em_turno && m.sinal_ao_vivo ? "bg-emerald-500" : m.em_turno && !m.sinal_ao_vivo ? "bg-amber-500" : "bg-slate-400"}`} />
                    <span className="text-xs">
                      {m.em_turno && m.sinal_ao_vivo ? "Online" : m.em_turno && !m.sinal_ao_vivo ? "Sem Sinal" : "Offline"}
                    </span>
                  </div>
                  {m.velocidade !== null && m.velocidade !== undefined && (
                    <p className="text-xs text-slate-600">⚡ {(m.velocidade || 0).toFixed(0)} km/h</p>
                  )}
                  {m.bateria !== null && m.bateria !== undefined && (
                    <p className="text-xs text-slate-600">🔋 {(m.bateria || 0).toFixed(0)}%</p>
                  )}
                </div>
              </InfoWindow>
            )}
          </AnimatedMarker>
        )
      })}
    </GoogleMap>
  )
}
