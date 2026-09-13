import type { ComponentType } from "react"
import {
  SquaresFour,
  ChatCircle,
  Truck,
  Bell,
  ChatCircleDots,
  Package,
  Handbag,
  FileText,
  MapPinLine,
  CarProfile,
  Car,
  QrCode,
  FolderOpen,
  ClipboardText,
  MagnifyingGlass,
  Image as ImageIcon,
  CurrencyDollar,
  CheckCircle,
  ArrowCounterClockwise,
  ChartBar,
  ChartLineUp,
  Wallet,
  Users,
  CalendarBlank,
  Scroll,
  Target,
  UsersThree,
  Megaphone,
  ShoppingBag,
  Sparkle,
  UploadSimple,
  ShoppingCart,
  Gear,
  FilePlus,
  Wrench,
  Gavel,
  MapTrifold
} from "@phosphor-icons/react"

/** E-mails com acesso de gerência (igual ao restante do CRM). */
export const MANAGER_EMAILS = new Set(["pecasdourados@hotmail.com", "pecasdourados2@gmail.com"])

export type RlsFlagKey =
  | "perm_vendas"
  | "perm_produtos"
  | "perm_financeiro"
  | "perm_fiscal"
  | "perm_caixa"
  | "perm_config"
  | "perm_admin"
  | "perm_logs"
  | "perm_relatorios"
  | "perm_metas"
  | "perm_devolucoes"
  | "perm_vendas_concluidas"
  | "perm_edicao_venda_finalizada"

export type RlsPartial = Partial<Record<RlsFlagKey, boolean>>

export type NavGroup = "principal" | "cadastros" | "financeiro" | "logistica" | "administracao" | "online" | "extra"

export const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  principal: "Principal",
  cadastros: "Cadastros",
  financeiro: "Financeiro",
  logistica: "Logística",
  administracao: "Administração",
  online: "Online",
  extra: "Outras rotas / técnicas",
}

export const NAV_GROUP_ORDER: NavGroup[] = [
  "principal",
  "cadastros",
  "financeiro",
  "logistica",
  "administracao",
  "online",
  "extra",
]

export type CrmNavItemDef = {
  icon: ComponentType<any>
  label: string
  href: string
  /** Onde aparece na sidebar; `extra` = só permissões / URL direta. */
  navGroup: NavGroup
  /** Quando `perm_menu[path] === true`, estes flags passam a true no registo (RLS + compat). */
  rls: RlsPartial
  colorClass?: string
}

/** Rotas do CRM (menu + rotas só em App). Ordem = ordem na UI de permissões por grupo. */
export const CRM_NAV_ITEMS: CrmNavItemDef[] = [
  { icon: SquaresFour, label: "Dashboard", href: "/", navGroup: "principal", rls: {}, colorClass: "text-indigo-500 group-hover:text-indigo-600" },
  // { icon: ChatCircleDots, label: "Atendimento WhatsApp", href: "/atendimento", navGroup: "principal", rls: { perm_vendas: true }, colorClass: "text-emerald-500 group-hover:text-emerald-600" },
  { icon: Truck, label: "Entregas", href: "/entregas", navGroup: "principal", rls: { perm_vendas: true }, colorClass: "text-teal-500 group-hover:text-teal-600" },
  { icon: Bell, label: "Lembretes", href: "/lembretes", navGroup: "principal", rls: {}, colorClass: "text-blue-500 group-hover:text-blue-600" },
  { icon: ChatCircleDots, label: "Recados", href: "/recados", navGroup: "principal", rls: {}, colorClass: "text-blue-500 group-hover:text-blue-600" },
  { icon: Package, label: "Estoque", href: "/produtos", navGroup: "principal", rls: { perm_produtos: true }, colorClass: "text-teal-500 group-hover:text-teal-600" },
  { icon: Wrench, label: "Manutenções", href: "/manutencoes", navGroup: "principal", rls: { perm_produtos: true }, colorClass: "text-orange-500 group-hover:text-orange-600" },
  { icon: Handbag, label: "Vendas", href: "/vendas", navGroup: "principal", rls: { perm_vendas: true }, colorClass: "text-amber-500 group-hover:text-amber-600" },
  { icon: Handbag, label: "Editar Venda", href: "/vendas/editar", navGroup: "extra", rls: { perm_vendas: true, perm_edicao_venda_finalizada: true }, colorClass: "text-amber-500 group-hover:text-amber-600" },
  { icon: FileText, label: "Orçamentos", href: "/orcamentos", navGroup: "principal", rls: { perm_vendas: true }, colorClass: "text-amber-500 group-hover:text-amber-600" },
  { icon: ClipboardText, label: "Pedidos de Clientes", href: "/pedidos-clientes", navGroup: "principal", rls: { perm_vendas: true }, colorClass: "text-amber-500 group-hover:text-amber-600" },

  { icon: FilePlus, label: "Conversor de Arquivos", href: "/conversor", navGroup: "cadastros", rls: {}, colorClass: "text-violet-500 group-hover:text-violet-600" },
  { icon: ClipboardText, label: "Conferência de Estoque", href: "/conferencia-estoque", navGroup: "cadastros", rls: {}, colorClass: "text-teal-500 group-hover:text-teal-600" },
  { icon: Truck, label: "Cotação de frete", href: "/cotacao-frete", navGroup: "cadastros", rls: { perm_produtos: true }, colorClass: "text-slate-500 group-hover:text-slate-600" },
  { icon: MapPinLine, label: "Transportadoras", href: "/transportadoras", navGroup: "cadastros", rls: {}, colorClass: "text-slate-500 group-hover:text-slate-600" },
  { icon: CarProfile, label: "Catálogo", href: "/catalogo", navGroup: "cadastros", rls: { perm_produtos: true }, colorClass: "text-slate-500 group-hover:text-slate-600" },
  { icon: Car, label: "Explorador de Veículos ML", href: "/explorador-ml", navGroup: "cadastros", rls: { perm_produtos: true }, colorClass: "text-blue-500 group-hover:text-blue-600" },
  { icon: QrCode, label: "QR Code", href: "/qrcode", navGroup: "cadastros", rls: { perm_produtos: true }, colorClass: "text-slate-500 group-hover:text-slate-600" },
  { icon: FolderOpen, label: "Localizações", href: "/localizacoes", navGroup: "cadastros", rls: { perm_produtos: true }, colorClass: "text-slate-500 group-hover:text-slate-600" },
  { icon: ClipboardText, label: "Uso Interno & Faltas", href: "/produtos-uso", navGroup: "cadastros", rls: { perm_produtos: true }, colorClass: "text-slate-500 group-hover:text-slate-600" },
  { icon: ClipboardText, label: "Pedidos de compra", href: "/pedidos-compra", navGroup: "cadastros", rls: { perm_produtos: true }, colorClass: "text-slate-500 group-hover:text-slate-600" },
  { icon: Car, label: "Sucatas", href: "/sucatas", navGroup: "cadastros", rls: { perm_produtos: true }, colorClass: "text-slate-500 group-hover:text-slate-600" },

  { icon: MagnifyingGlass, label: "Busca Placa — R$ 0,10", href: "/busca-placa", navGroup: "cadastros", rls: { perm_produtos: true }, colorClass: "text-slate-500 group-hover:text-slate-600" },
  { icon: ImageIcon, label: "Editor de Imagens", href: "/admin/processar-fotos", navGroup: "cadastros", rls: { perm_produtos: true }, colorClass: "text-slate-500 group-hover:text-slate-600" },

  { icon: CurrencyDollar, label: "Financeiro", href: "/financeiro", navGroup: "financeiro", rls: { perm_financeiro: true }, colorClass: "text-emerald-500 group-hover:text-emerald-600" },
  { icon: CheckCircle, label: "Vendas Concluídas", href: "/vendas-concluidas", navGroup: "financeiro", rls: { perm_vendas: true, perm_vendas_concluidas: true }, colorClass: "text-emerald-500 group-hover:text-emerald-600" },
  { icon: ArrowCounterClockwise, label: "Devoluções", href: "/devolucoes", navGroup: "financeiro", rls: { perm_vendas: true, perm_devolucoes: true }, colorClass: "text-emerald-500 group-hover:text-emerald-600" },
  { icon: ChartBar, label: "Relatórios", href: "/relatorios", navGroup: "financeiro", rls: { perm_relatorios: true }, colorClass: "text-emerald-500 group-hover:text-emerald-600" },
  { icon: Wallet, label: "Controle de Caixa", href: "/caixa", navGroup: "financeiro", rls: { perm_caixa: true }, colorClass: "text-emerald-500 group-hover:text-emerald-600" },
  { icon: FileText, label: "Fiscal", href: "/fiscal", navGroup: "financeiro", rls: { perm_fiscal: true }, colorClass: "text-emerald-500 group-hover:text-emerald-600" },
  { icon: Users, label: "Clientes", href: "/clientes", navGroup: "financeiro", rls: { perm_vendas: true }, colorClass: "text-emerald-500 group-hover:text-emerald-600" },
  { icon: CalendarBlank, label: "Agenda", href: "/agenda", navGroup: "financeiro", rls: { perm_financeiro: true }, colorClass: "text-emerald-500 group-hover:text-emerald-600" },
  { icon: Scroll, label: "Controle de Boletos", href: "/controle-boletos", navGroup: "financeiro", rls: { perm_financeiro: true }, colorClass: "text-emerald-500 group-hover:text-emerald-600" },


  { icon: SquaresFour, label: "Dashboard Logística", href: "/logistica/dashboard", navGroup: "logistica", rls: { perm_vendas: true }, colorClass: "text-teal-500 group-hover:text-teal-600" },
  { icon: MapTrifold, label: "Rotas de Entrega", href: "/logistica/rotas", navGroup: "logistica", rls: { perm_vendas: true }, colorClass: "text-teal-500 group-hover:text-teal-600" },
  { icon: MapPinLine, label: "Rastreamento", href: "/logistica/rastreamento", navGroup: "logistica", rls: { perm_vendas: true }, colorClass: "text-teal-500 group-hover:text-teal-600" },
  { icon: Car, label: "Veículos e Motoristas", href: "/logistica/motoristas", navGroup: "logistica", rls: { perm_vendas: true }, colorClass: "text-teal-500 group-hover:text-teal-600" },
  { icon: Scroll, label: "Histórico Logístico", href: "/logistica/historico", navGroup: "logistica", rls: { perm_vendas: true }, colorClass: "text-teal-500 group-hover:text-teal-600" },


  { icon: Scroll, label: "Registro de atividades", href: "/logs", navGroup: "administracao", rls: { perm_logs: true }, colorClass: "text-slate-500 group-hover:text-slate-600" },
  { icon: Target, label: "Metas", href: "/metas", navGroup: "administracao", rls: { perm_metas: true }, colorClass: "text-slate-500 group-hover:text-slate-600" },
  { icon: UsersThree, label: "Indicações", href: "/indicacoes", navGroup: "administracao", rls: { perm_vendas: true }, colorClass: "text-slate-500 group-hover:text-slate-600" },
  {
    icon: MagnifyingGlass,
    label: "Consultas",
    href: "/admin/consultas",
    navGroup: "administracao",
    rls: { perm_admin: true },
    colorClass: "text-slate-500 group-hover:text-slate-600"
  },
  { icon: ArrowCounterClockwise, label: "Trocas", href: "/trocas", navGroup: "administracao", rls: { perm_vendas: true }, colorClass: "text-slate-500 group-hover:text-slate-600" },
  { icon: ShoppingBag, label: "Loja de Aplicativos", href: "/loja-aplicativos", navGroup: "administracao", rls: {}, colorClass: "text-slate-500 group-hover:text-slate-600" },

  { icon: Megaphone, label: "Marketing (site)", href: "/admin/marketing", navGroup: "online", rls: {}, colorClass: "text-slate-500 group-hover:text-slate-600" },
  { icon: ShoppingBag, label: "Pedidos da Loja", href: "/admin/store/orders", navGroup: "online", rls: { perm_vendas: true }, colorClass: "text-slate-500 group-hover:text-slate-600" },
  { icon: Users, label: "Clientes da Loja", href: "/admin/store/customers", navGroup: "online", rls: { perm_vendas: true }, colorClass: "text-slate-500 group-hover:text-slate-600" },
  { icon: ChartLineUp, label: "Analytics da Loja", href: "/admin/store/analytics", navGroup: "online", rls: { perm_relatorios: true }, colorClass: "text-slate-500 group-hover:text-slate-600" },
  { icon: ShoppingBag, label: "Mercado Livre", href: "/mercadolivre", navGroup: "online", rls: { perm_vendas: true }, colorClass: "text-slate-500 group-hover:text-slate-600" },
  { icon: ChatCircle, label: "Vendas ML", href: "/vendas-ml", navGroup: "online", rls: { perm_vendas: true }, colorClass: "text-slate-500 group-hover:text-slate-600" },
  { icon: ChatCircle, label: "Redes Sociais", href: "/redes-sociais", navGroup: "online", rls: { perm_vendas: true }, colorClass: "text-slate-500 group-hover:text-slate-600" },

  { icon: Package, label: "Alteração em massa (estoque)", href: "/produtos/alteracao-massa", navGroup: "extra", rls: { perm_produtos: true }, colorClass: "text-slate-500 group-hover:text-slate-600" },
  { icon: Package, label: "Debug estoque", href: "/produtos-debug", navGroup: "extra", rls: { perm_produtos: true }, colorClass: "text-slate-500 group-hover:text-slate-600" },
  { icon: Sparkle, label: "Sales AI", href: "/sales-ai", navGroup: "extra", rls: { perm_vendas: true }, colorClass: "text-slate-500 group-hover:text-slate-600" },
  { icon: UploadSimple, label: "Importador", href: "/importador", navGroup: "extra", rls: { perm_produtos: true }, colorClass: "text-slate-500 group-hover:text-slate-600" },
  { icon: ShoppingCart, label: "Pedidos (admin)", href: "/admin/pedidos", navGroup: "extra", rls: { perm_vendas: true }, colorClass: "text-slate-500 group-hover:text-slate-600" },

  { icon: Gear, label: "Configurações", href: "/configuracoes", navGroup: "extra", rls: {}, colorClass: "text-slate-500 group-hover:text-slate-600" },
]

/** Índice por path (primeira ocorrência). Rotas duplicadas no array acima são removidas. */
const ITEM_BY_PATH = (() => {
  const m = new Map<string, CrmNavItemDef>()
  for (const it of CRM_NAV_ITEMS) {
    if (!m.has(it.href)) m.set(it.href, it)
  }
  return m
})()

/** Todos os paths únicos permitidos no CRM (para migração e presets “tudo”). */
export const ALL_CRM_PATHS: string[] = [...ITEM_BY_PATH.keys()].sort((a, b) => {
  if (a === "/") return -1
  if (b === "/") return 1
  return a.localeCompare(b)
})

/** Ordem na sidebar (submenus). */
export const SIDEBAR_CADASTROS_HREF_ORDER: string[] = [
  "/cotacao-frete",
  "/transportadoras",
  "/catalogo",
  "/produtos-uso",
  "/pedidos-compra",
  "/qrcode",
  "/localizacoes",
  "/sucatas",

  "/busca-placa",
  "/admin/processar-fotos",
]

export const SIDEBAR_FINANCEIRO_HREF_ORDER: string[] = [
  "/financeiro",
  "/vendas-concluidas",
  "/devolucoes",
  "/relatorios",
  "/caixa",
  "/fiscal",
  "/clientes",
  "/agenda",
  "/controle-boletos",
]

export const SIDEBAR_LOGISTICA_HREF_ORDER: string[] = [
  "/logistica/dashboard",
  "/logistica/rotas",
  "/logistica/rastreamento",
  "/logistica/motoristas",
  "/logistica/historico",
]

export const SIDEBAR_ADMIN_HREF_ORDER: string[] = [
  "/logs",
  "/pedidos-compra",
  "/metas",
  "/indicacoes",
  "/trocas",
  "/admin/consultas",
  "/loja-aplicativos",
]

export const SIDEBAR_ONLINE_HREF_ORDER: string[] = [
  "/admin/marketing",
  "/admin/store/orders",
  "/admin/store/customers",
  "/admin/store/analytics",
  "/mercadolivre",
  "/vendas-ml",
  "/redes-sociais",
]

export function sortNavByHrefOrder(items: CrmNavItemDef[], order: string[]): CrmNavItemDef[] {
  return [...items].sort((a, b) => {
    const ia = order.indexOf(a.href)
    const ib = order.indexOf(b.href)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  })
}

function normalizePathname(pathname: string): string {
  if (!pathname) return "/"
  const p = pathname.split("?")[0] || "/"
  if (p !== "/" && p.endsWith("/")) return p.slice(0, -1) || "/"
  return p
}

export type PermMenu = Record<string, boolean>

export function parsePermMenu(raw: unknown): PermMenu {
  // jsonb vindo da API Python pode chegar como string JSON.
  if (typeof raw === "string") {
    const t = raw.trim()
    if (!t) return {}
    try {
      return parsePermMenu(JSON.parse(t))
    } catch {
      return {}
    }
  }

  // legado: perm_menu booleano
  if (raw === true) return buildFullPermMenu()
  if (raw === false || raw == null) return {}

  if (typeof raw !== "object") return {}
  const out: PermMenu = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === true) out[k] = true
  }
  return out
}

export function isManagerAtendente(a: { perm_config?: boolean; email?: string | null } | null | undefined): boolean {
  if (!a) return false
  if (a.perm_config === true) return true
  const em = (a.email || "").toLowerCase()
  return MANAGER_EMAILS.has(em)
}

/** Allowlist: só paths com `true` explícito; gerentes ignoram. */
export function hasCrmPathAccess(
  pathname: string,
  atendente: {
    perm_menu?: unknown
    perm_config?: boolean
    perm_admin?: boolean
    email?: string | null
  } | null | undefined,
): boolean {
  if (!atendente) return false
  const path = normalizePathname(pathname)

  if (path === "/admin/bin-nacional" || path === "/admin/consultas") {
    if (atendente.perm_admin === true) return true
    if (isManagerAtendente(atendente)) return true
  } else {
    if (isManagerAtendente(atendente)) return true
  }

  const menu = parsePermMenu(atendente.perm_menu)

  if (menu[path] === true) return true

  if (ALL_CRM_PATHS.includes(path)) {
    return false
  }

  for (const [prefix, ok] of Object.entries(menu)) {
    if (!ok) continue
    const pref = normalizePathname(prefix)
    if (pref === "/" && path === "/") return true
    if (pref === "/") continue
    if (path.startsWith(`${pref}/`)) return true
  }
  return false
}

const RLS_KEYS: RlsFlagKey[] = [
  "perm_vendas",
  "perm_produtos",
  "perm_financeiro",
  "perm_fiscal",
  "perm_caixa",
  "perm_config",
  "perm_admin",
  "perm_logs",
  "perm_relatorios",
  "perm_metas",
  "perm_devolucoes",
  "perm_vendas_concluidas",
  "perm_edicao_venda_finalizada"
]

export function deriveRlsFlagsFromMenu(menu: PermMenu): Record<RlsFlagKey, boolean> {
  const out = Object.fromEntries(RLS_KEYS.map((k) => [k, false])) as Record<RlsFlagKey, boolean>
  for (const [path, ok] of Object.entries(menu)) {
    if (!ok) continue
    const def = ITEM_BY_PATH.get(normalizePathname(path))
    if (!def) continue
    for (const [k, v] of Object.entries(def.rls) as [RlsFlagKey, boolean][]) {
      if (v) out[k] = true
    }
  }
  return out
}

export function buildFullPermMenu(): PermMenu {
  const m: PermMenu = {}
  for (const p of ALL_CRM_PATHS) m[p] = true
  return m
}

export function emptyPermMenu(): PermMenu {
  return {}
}

/** Presets de cargo — conjunto explícito de rotas (allowlist). */
export function permMenuPresetForRole(role: string): PermMenu {
  const full = buildFullPermMenu()
  const vazio = emptyPermMenu()
  switch (role) {
    case "Administrador":
      return full
    case "Gerente":
      return full
    case "Vendedor": {
      const m = { ...vazio }
      for (const p of [
        "/",
        "/entregas",
        "/lembretes",
        "/recados",
        "/vendas",
        "/vendas/editar",
        "/orcamentos",
        "/trocas",
        "/clientes",
        "/vendas-concluidas",
        "/devolucoes",
        "/indicacoes",
        "/mercadolivre",
        "/vendas-ml",
        "/admin/store/orders",
        "/admin/store/customers",
        "/sales-ai",
        "/manutencoes",
      ]) {
        m[p] = true
      }
      return m
    }
    case "Caixa": {
      const m = { ...vazio }
      for (const p of ["/", "/lembretes", "/recados", "/financeiro", "/caixa", "/relatorios", "/clientes"]) {
        m[p] = true
      }
      return m
    }
    case "Cadastrador":
    case "Cadastrador / Estoquista": {
      const m = { ...vazio }
      for (const p of [
        "/",
        "/lembretes",
        "/recados",
        "/produtos",
        "/produtos-uso",
        "/pedidos-compra",
        "/produtos/alteracao-massa",
        "/catalogo",
        "/qrcode",
        "/localizacoes",
        "/sucatas",
        "/busca-placa",
        "/cotacao-frete",
        "/importador",
        "/admin/processar-fotos",
        "/logs",
        "/manutencoes",
      ]) {
        m[p] = true
      }
      return m
    }
    case "Entregador": {
      const m = { ...vazio }
      for (const p of [
        "/",
        "/entregas",
        "/lembretes",
        "/recados",
        "/clientes",
        "/logistica/dashboard",
        "/logistica/rotas",
        "/logistica/rastreamento",
        "/logistica/motoristas",
        "/logistica/historico",
      ]) {
        m[p] = true
      }
      return m
    }
    default:
      return vazio
  }
}

export function derivePayloadForSave(permMenu: PermMenu, cargo: string): Record<string, unknown> {
  const menu = { ...permMenu }
  const rls = deriveRlsFlagsFromMenu(menu)
  const isAdminRole = cargo === "Administrador"
  return {
    perm_menu: menu,
    perm_vendas: rls.perm_vendas,
    perm_produtos: rls.perm_produtos,
    perm_financeiro: rls.perm_financeiro,
    perm_fiscal: rls.perm_fiscal,
    perm_caixa: rls.perm_caixa,
    /** Só cargo Administrador é superusuário no CRM (bypass de allowlist + RLS amplo). */
    perm_config: isAdminRole,
    perm_admin: rls.perm_admin || isAdminRole,
    perm_logs: rls.perm_logs,
    perm_relatorios: rls.perm_relatorios,
    perm_metas: rls.perm_metas,
    perm_devolucoes: rls.perm_devolucoes,
    perm_vendas_concluidas: rls.perm_vendas_concluidas,
    perm_edicao_venda_finalizada: rls.perm_edicao_venda_finalizada,
  }
}
