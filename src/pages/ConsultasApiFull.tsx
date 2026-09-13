import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Modal } from "@/components/ui/modal"
import {
    Search,
    ShieldCheck,
    Wallet,
    RefreshCw,
    Loader2,
    FileText,
    AlertTriangle,
    ExternalLink,
    Building2,
    User,
    Car,
    CreditCard,
    UserPlus,
    History,
    Clock,
    CheckCircle2,
    XCircle,
} from "lucide-react"
import { BinNacionalPanel } from "@/components/BinNacionalPanel"
import { consultasApi, clientesApi } from "@/lib/api"
import { getApiBaseUrl } from "@/lib/apiBase"
import { fmtDateTime, fmtDateTimeShort } from "@/lib/format"
import { cn } from "@/lib/utils"

const fmtReais = (n: number) =>
    `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const CAMPOS_IGNORAR = new Set([
    "_consulta_from_history",
    "_raw",
    "status",
    "api_full",
    "aux",
    "type",
    "data",
    "resumoretorno",
    "token",
    "authorization",
])

function isBase64(v: unknown): boolean {
    if (typeof v !== "string") return false
    return v.length > 200 && /^[A-Za-z0-9+/=]+$/.test(v.replace(/\s/g, ""))
}

function isValorUtil(k: string, v: unknown): boolean {
    if (CAMPOS_IGNORAR.has(k.toLowerCase())) return false
    if (v === null || v === undefined) return false
    if (typeof v === "string" && ["", "null", "N/A", "n/a", "-", "0", "false"].includes(v.trim())) return false
    if (typeof v === "boolean" && v === false) return false
    if (typeof v === "number" && v === 0) return false
    if (Array.isArray(v) && v.length === 0) return false
    if (isBase64(v)) return false
    return true
}

/** Transforma objetos aninhados da API em texto útil para exibição. */
function flattenObj(v: unknown): string {
    if (typeof v !== "object" || v === null || Array.isArray(v)) return String(v ?? "")
    const o = v as Record<string, unknown>
    const desc = o.descricao ?? o.description ?? o.nome ?? o.name ?? o.label ?? o.value
    if (desc !== undefined && desc !== null) return String(desc)
    for (const [k, val] of Object.entries(o)) {
        if (k === "id" || k === "codigo" || k === "code") continue
        if (val !== null && val !== undefined && String(val).length < 100) return String(val)
    }
    return JSON.stringify(v)
}

function fmtData(v: unknown): string {
    if (!v) return ""
    const d = new Date(String(v))
    if (isNaN(d.getTime())) return String(v)
    return d.toLocaleDateString("pt-BR")
}

function fmtReaisCampo(v: unknown): string {
    const n = Number(v)
    if (isNaN(n)) return String(v ?? "")
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function fmtMesAnoRef(v: unknown): string {
    if (!v) return ""
    const d = new Date(String(v))
    if (isNaN(d.getTime())) return String(v)
    return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
}

function onlyDigits(s: string, max: number) {
    return s.replace(/\D/g, "").slice(0, max)
}

function formatCpfDisplay(raw: string) {
    const n = onlyDigits(raw, 11)
    if (n.length <= 3) return n
    if (n.length <= 6) return `${n.slice(0, 3)}.${n.slice(3)}`
    if (n.length <= 9) return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6)}`
    return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9, 11)}`
}

function formatCnpjDisplay(raw: string) {
    const n = onlyDigits(raw, 14)
    if (n.length <= 2) return n
    if (n.length <= 5) return `${n.slice(0, 2)}.${n.slice(2)}`
    if (n.length <= 8) return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5)}`
    if (n.length <= 12) return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8)}`
    return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12, 14)}`
}

/** Placa Mercosul ou antiga — até 7 caracteres alfanuméricos. */
function normalizePlaca(s: string) {
    return s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7)
}

function extractDados(payload: Record<string, unknown>): Record<string, unknown> | null {
    const d = payload?.dados ?? payload?.Dados ?? payload?.data
    if (d && typeof d === "object" && !Array.isArray(d)) return d as Record<string, unknown>
    return null
}

const flattenObjectConsultas = (obj: any, prefix = ''): Record<string, string> => {
    let result: Record<string, string> = {};
    if (!obj || typeof obj !== 'object') return result;
    
    for (const key in obj) {
        // Ignorar chaves de sistema, cabeçalhos de controle e status
        if (key === '_consulta_from_history' || key.startsWith('_')) continue;
        if (['HEADER', 'STATUS_RETORNO', 'CONTROLE', 'PARAMETROS', 'DADOS_RETORNADOS'].includes(key)) continue;
        
        const value = obj[key];
        
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            const nested = flattenObjectConsultas(value, `${prefix}${key}_`);
            result = { ...result, ...nested };
        } else if (value !== null && value !== undefined && !isValorVazio(value)) {
            if (['sintetico', 'fipeId', 'codigo', 'STATUS', 'FONTE'].includes(key)) continue;
            result[`${prefix}${key}`] = String(value);
        }
    }
    return result;
};

function findPdfUrl(obj: unknown): string | null {
    if (!obj || typeof obj !== "object") return null
    const o = obj as Record<string, unknown>
    const rr = o.resumoRetorno
    if (rr && typeof rr === "object") {
        const pdf = (rr as Record<string, unknown>).pdf
        if (typeof pdf === "string" && pdf.startsWith("http")) return pdf
    }
    for (const v of Object.values(o)) {
        if (typeof v === "string" && /^https?:\/\/.+\.pdf/i.test(v)) return v
        if (v && typeof v === "object") {
            const inner = findPdfUrl(v)
            if (inner) return inner
        }
    }
    return null
}

function isValorVazio(v: unknown): boolean {
    if (v === null || v === undefined) return true
    if (typeof v === "boolean" && v === false) return true
    if (typeof v === "string" && ["", "null", "N/A", "n/a", "-", "0"].includes(v.trim())) return true
    if (typeof v === "number" && v === 0) return true
    if (Array.isArray(v) && v.length === 0) return true
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
        const vals = Object.values(v as object)
        if (vals.length === 0) return true
        return vals.every(isValorVazio)
    }
    return false
}

function mergePayloadFlat(payload: Record<string, unknown>): Record<string, unknown> {
    const dados = extractDados(payload)
    const base = { ...payload }
    delete base.dados
    delete base.Dados
    delete base.data
    return { ...base, ...(dados ?? {}) }
}

function firstVal(flat: Record<string, unknown>, ...keys: string[]): unknown {
    for (const k of keys) {
        const x = flat[k]
        if (!isValorVazio(x)) return x
    }
    return undefined
}

/** Busca valor por lista de chaves possíveis no payload e em objetos aninhados (exceto arrays). */
function deepPick(obj: unknown, keys: string[]): string | number | boolean | null | undefined {
    const seen = new WeakSet<object>()

    function pickDirect(o: Record<string, unknown>): string | number | boolean | null | undefined {
        for (const k of keys) {
            const v = o[k]
            if (v !== undefined && v !== null) return v as never
            const cap = k.charAt(0).toUpperCase() + k.slice(1)
            const v2 = o[cap]
            if (v2 !== undefined && v2 !== null) return v2 as never
        }
        return undefined
    }

    function walk(node: unknown): string | number | boolean | null | undefined {
        if (!node || typeof node !== "object") return undefined
        if (Array.isArray(node)) {
            for (const item of node) {
                const hit = walk(item)
                if (hit !== undefined) return hit
            }
            return undefined
        }
        if (seen.has(node as object)) return undefined
        seen.add(node as object)

        const root = node as Record<string, unknown>
        const hit = pickDirect(root)
        if (hit !== undefined) return hit

        const dados = extractDados(root)
        if (dados) {
            const dh = pickDirect(dados)
            if (dh !== undefined) return dh
        }

        for (const v of Object.values(root)) {
            if (!v || typeof v !== "object") continue
            if (Array.isArray(v)) continue
            const inner = walk(v)
            if (inner !== undefined) return inner
        }
        return undefined
    }

    return walk(obj)
}

function inferBadgeClass(data: unknown): string {
    const blob = JSON.stringify(data || "").toLowerCase()
    if (/protesto|protestos|cheque sem fundo|cheques sem fundo|negativ|d[ií]vida|c[ií]vel|pend[eê]ncia/i.test(blob)) {
        return "bg-rose-600 hover:bg-rose-600 text-white border-0"
    }
    const score = Number(deepPick(data as object, ["score", "Score", "pontuacao", "pontuação"]))
    if (Number.isFinite(score) && score > 0 && score < 400) {
        return "bg-amber-500 hover:bg-amber-500 text-black border-0"
    }
    return "bg-emerald-600 hover:bg-emerald-600 text-white border-0"
}

function Campo({
    label,
    value,
    mono = false,
    destaque = false,
}: {
    label: string
    value: string | number
    mono?: boolean
    destaque?: boolean
}) {
    return (
        <div className="space-y-0.5">
            <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide">{label}</div>
            <div
                className={
                    destaque
                        ? "text-2xl font-black"
                        : mono
                          ? "font-mono text-sm"
                          : "text-sm font-medium"
                }
            >
                {String(value)}
            </div>
        </div>
    )
}

function BarraScore({ score }: { score: number }) {
    const max = score > 100 ? 1000 : score > 10 ? 100 : 10
    const pct = Math.min(100, Math.round((score / max) * 100))
    const cor = pct < 30 ? "#ef4444" : pct < 60 ? "#f59e0b" : "#22c55e"
    const label = pct < 30 ? "Alto risco" : pct < 60 ? "Atenção" : "Baixo risco"
    return (
        <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
                <span>{label}</span>
                <span>
                    {score} / {max}
                </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: cor }} />
            </div>
        </div>
    )
}

function formatPlacaMercosul(v: unknown): string {
    const raw = String(v ?? "").trim()
    const n = normalizePlaca(raw)
    if (n.length === 7) return `${n.slice(0, 3)}-${n.slice(3)}`
    return raw || n
}

function situacaoCadastralBadgeClass(situ: string): string {
    const u = situ.toUpperCase()
    if (u.includes("ATIV")) return "bg-emerald-600 hover:bg-emerald-600 text-white border-0"
    if (/INAPT|BAIXAD|SUSPENS/i.test(u)) return "bg-rose-600 hover:bg-rose-600 text-white border-0"
    return "bg-amber-500 hover:bg-amber-500 text-black border-0"
}

function getEnderecoMerged(payload: Record<string, unknown>): Partial<Record<string, string>> {
    const flat = mergePayloadFlat(payload)
    const pick = (...keys: string[]) => {
        const x = deepPick(payload, keys) ?? firstVal(flat, ...keys)
        if (x === undefined || x === null) return ""
        if (typeof x === "object" && !Array.isArray(x)) return ""
        return String(x).trim()
    }
    const out: Partial<Record<string, string>> = {
        logradouro: pick("logradouro", "endereco_logradouro", "Logradouro"),
        numero: pick("numero", "endereco_numero", "Numero"),
        complemento: pick("complemento", "endereco_complemento", "Complemento"),
        bairro: pick("bairro", "endereco_bairro", "Bairro"),
        cidade: pick("cidade", "endereco_cidade", "municipio", "Municipio"),
        uf: pick("uf", "endereco_uf", "UF"),
        cep: pick("cep", "CEP"),
    }
    const eo = deepPick(payload, ["endereco", "Endereco"])
    if (eo && typeof eo === "object" && !Array.isArray(eo)) {
        const e = eo as Record<string, unknown>
        if (!out.logradouro) out.logradouro = String(e.logradouro ?? e.Logradouro ?? "").trim()
        if (!out.numero) out.numero = String(e.numero ?? e.Numero ?? "").trim()
        if (!out.complemento) out.complemento = String(e.complemento ?? e.Complemento ?? "").trim()
        if (!out.bairro) out.bairro = String(e.bairro ?? e.Bairro ?? "").trim()
        if (!out.cidade) out.cidade = String(e.cidade ?? e.municipio ?? e.Municipio ?? "").trim()
        if (!out.uf) out.uf = String(e.uf ?? e.UF ?? "").trim()
        if (!out.cep) out.cep = String(e.cep ?? e.CEP ?? "").trim()
    }
    return out
}

function SecaoEndereco({ payload }: { payload: Record<string, unknown> }) {
    const m = getEnderecoMerged(payload)
    const rows = [
        ["Logradouro", m.logradouro],
        ["Número", m.numero],
        ["Complemento", m.complemento],
        ["Bairro", m.bairro],
        ["Cidade", m.cidade],
        ["UF", m.uf],
        ["CEP", m.cep],
    ] as const
    const filled = rows.filter(([, v]) => v && String(v).trim())
    if (!filled.length) return null
    return (
        <details className="rounded-lg border border-border/60 bg-muted/10 p-3 open:bg-muted/15">
            <summary className="text-[10px] uppercase font-black text-muted-foreground cursor-pointer select-none">
                Endereço
            </summary>
            <div className="grid sm:grid-cols-2 gap-3 mt-3">
                {filled.map(([label, value]) => (
                    <Campo key={label} label={label} value={value!} />
                ))}
            </div>
        </details>
    )
}

function restricaoOk(val: unknown): boolean {
    if (val === null || val === undefined) return true
    if (val === false) return true
    if (typeof val === "number") return val === 0
    if (typeof val === "boolean") return !val
    if (typeof val === "string") {
        const t = val.trim().toLowerCase()
        if (t === "" || t === "0" || t === "nenhuma" || t === "não" || t === "nao") return true
    }
    return false
}

function restricaoText(val: unknown): string {
    if (restricaoOk(val)) return "Nenhuma"
    if (typeof val === "number") return String(val)
    if (typeof val === "boolean") return val ? "Sim" : "Nenhuma"
    return String(val)
}

function RestricaoLinha({ label, val }: { label: string; val: unknown }) {
    const ok = restricaoOk(val)
    const text = restricaoText(val)
    return (
        <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/20 p-2">
            {ok ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            ) : (
                <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase font-black text-muted-foreground tracking-tight">{label}</div>
                <div className={`text-sm font-medium ${ok ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
                    {text}
                </div>
            </div>
        </div>
    )
}

function CardCnpj({ payload }: { payload: Record<string, unknown> }) {
    const flat = mergePayloadFlat(payload)
    const razao =
        deepPick(payload, ["razao_social", "razaoSocial", "nome_fantasia", "NomeFantasia"]) ??
        firstVal(flat, "razao_social", "nome_fantasia")
    const cnpjRaw = deepPick(payload, ["cnpj", "CNPJ"]) ?? firstVal(flat, "cnpj")
    const cnpjFmt =
        typeof cnpjRaw === "string" || typeof cnpjRaw === "number"
            ? formatCnpjDisplay(onlyDigits(String(cnpjRaw), 14))
            : ""
    const situRaw =
        String(deepPick(payload, ["situacao_cadastral", "situacaoCadastral", "situacao"]) ??
            firstVal(flat, "situacao_cadastral", "situacao") ??
            "")
    const dataAbertura =
        deepPick(payload, ["data_abertura", "dataAbertura"]) ?? firstVal(flat, "data_abertura")
    const tipo = deepPick(payload, ["tipo", "Tipo"]) ?? firstVal(flat, "tipo")
    const porte = deepPick(payload, ["porte", "Porte"]) ?? firstVal(flat, "porte")
    const natureza = deepPick(payload, ["natureza_juridica", "naturezaJuridica"]) ?? firstVal(flat, "natureza_juridica")
    const capital = deepPick(payload, ["capital_social", "capitalSocial"]) ?? firstVal(flat, "capital_social")
    const cnae =
        deepPick(payload, ["cnae_fiscal_descricao", "cnae_principal", "cnaePrincipal"]) ??
        firstVal(flat, "cnae_fiscal_descricao", "cnae_principal")
    const simplesRaw = deepPick(payload, ["simples", "Simples"])
    const dataOpcaoSimples = deepPick(payload, ["data_opcao_simples", "dataOpcaoSimples", "opcao_simples"])

    let simplesSimNao = ""
    if (simplesRaw && typeof simplesRaw === "object" && !Array.isArray(simplesRaw)) {
        const s = simplesRaw as Record<string, unknown>
        const sn = s.optante ?? s.situacao ?? s.descricao
        simplesSimNao = /sim|optante|ativo/i.test(String(sn ?? "")) ? "Sim" : "Não"
    } else if (typeof simplesRaw === "string" || typeof simplesRaw === "boolean") {
        simplesSimNao = String(simplesRaw)
    }

    const sociosRaw = deepPick(payload, ["socios", "Socios"]) ?? firstVal(flat, "socios")
    const sociosArr = Array.isArray(sociosRaw) ? sociosRaw : []

    const blocks: React.ReactNode[] = []
    if (razao && isValorUtil("razao", razao))
        blocks.push(<Campo key="rz" label="Razão social / fantasia" value={flattenObj(razao)} />)
    if (cnpjFmt) blocks.push(<Campo key="cnpj" label="CNPJ" value={cnpjFmt} mono />)
    if (situRaw && String(situRaw).trim()) {
        blocks.push(
            <div key="sit" className="space-y-1">
                <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide">Situação cadastral</div>
                <Badge className={situacaoCadastralBadgeClass(String(situRaw))}>{String(situRaw)}</Badge>
            </div>
        )
    }
    if (dataAbertura && !isValorVazio(dataAbertura)) blocks.push(<Campo key="dab" label="Data abertura" value={fmtData(dataAbertura)} />)
    if (tipo && !isValorVazio(tipo)) blocks.push(<Campo key="tipo" label="Tipo" value={flattenObj(tipo)} />)

    const empresa: React.ReactNode[] = []
    if (porte && !isValorVazio(porte)) empresa.push(<Campo key="porte" label="Porte" value={flattenObj(porte)} />)
    if (natureza && !isValorVazio(natureza)) empresa.push(<Campo key="nat" label="Natureza jurídica" value={flattenObj(natureza)} />)
    if (capital !== undefined && capital !== null && !isValorVazio(capital))
        empresa.push(<Campo key="cap" label="Capital social" value={fmtReaisCampo(capital)} />)
    if (cnae && !isValorVazio(cnae)) empresa.push(<Campo key="cnae" label="CNAE principal" value={flattenObj(cnae)} />)
    if (simplesSimNao || (dataOpcaoSimples && !isValorVazio(dataOpcaoSimples))) {
        empresa.push(
            <Campo
                key="simp"
                label="Simples Nacional"
                value={[simplesSimNao, dataOpcaoSimples ? fmtData(dataOpcaoSimples) : ""].filter(Boolean).join(" · ")}
            />
        )
    }

    const chips = sociosArr.slice(0, 5).map((s, i) => {
        const o = s && typeof s === "object" ? (s as Record<string, unknown>) : {}
        const nome = o.nome ?? o.Nome ?? o.name
        const tipoS = o.tipo ?? o.Tipo
        const qual = o.qualificacao_do_responsavel ?? o.qualificacao ?? o.Qualificacao
        const ent = o.data_entrada ?? o.dataEntrada
        const parts = [
            nome && String(nome),
            tipoS && String(tipoS),
            ent && fmtData(ent),
            qual && flattenObj(qual),
        ].filter(Boolean)
        return (
            <Badge key={i} variant="secondary" className="text-xs font-normal max-w-full whitespace-normal text-left h-auto py-1">
                {parts.join(" · ") || flattenObj(s)}
            </Badge>
        )
    })

    const hasId = blocks.length > 0
    const hasEmp = empresa.length > 0
    const endereco = <SecaoEndereco payload={payload} />

    if (!hasId && !hasEmp && !chips.length && !endereco) {
        return <p className="text-sm text-muted-foreground">Dados não disponíveis para esta consulta.</p>
    }

    return (
        <div className="space-y-4">
            {hasId && (
                <div>
                    <p className="text-[10px] uppercase font-black tracking-wider text-muted-foreground mb-2">Identificação</p>
                    <div className="grid sm:grid-cols-2 gap-3">{blocks}</div>
                </div>
            )}
            {endereco}
            {hasEmp && (
                <div>
                    <p className="text-[10px] uppercase font-black tracking-wider text-muted-foreground mb-2">Empresa</p>
                    <div className="grid sm:grid-cols-2 gap-3">{empresa}</div>
                </div>
            )}
            {chips.length > 0 && (
                <div>
                    <p className="text-[10px] uppercase font-black tracking-wider text-muted-foreground mb-2">Sócios</p>
                    <div className="flex flex-wrap gap-2">{chips}</div>
                </div>
            )}
        </div>
    )
}

function pickScoreFromPayload(payload: Record<string, unknown>): number | null {
    const raw = deepPick(payload, ["score", "Score", "pontuacao", "pontuação"])
    if (raw === undefined || raw === null) return null
    const n = typeof raw === "number" ? raw : Number(raw)
    return Number.isFinite(n) ? n : null
}

function CardCpfScore({ payload }: { payload: Record<string, unknown> }) {
    const flat = mergePayloadFlat(payload)
    const nome = deepPick(payload, ["nome", "Nome"]) ?? firstVal(flat, "nome")
    const cpfRaw = deepPick(payload, ["cpf", "CPF"]) ?? firstVal(flat, "cpf")
    const cpfFmt =
        cpfRaw !== undefined && cpfRaw !== null ? formatCpfDisplay(onlyDigits(String(cpfRaw), 11)) : ""
    const dn = deepPick(payload, ["data_nascimento", "dataNascimento"]) ?? firstVal(flat, "data_nascimento")
    const idade = deepPick(payload, ["idade", "age", "Age"]) ?? firstVal(flat, "idade")
    const scoreN = pickScoreFromPayload(payload)
    const renda =
        deepPick(payload, ["renda", "renda_presumida", "Renda", "rendaPresumida"]) ?? firstVal(flat, "renda", "renda_presumida")

    const pend = deepPick(payload, ["pendencias", "pendencias_financeiras", "Pendencias"]) ?? firstVal(flat, "pendencias")
    const divs = deepPick(payload, ["dividas", "Dividas"]) ?? firstVal(flat, "dividas")
    const prot = deepPick(payload, ["protestos", "Protestos"]) ?? firstVal(flat, "protestos")
    const chq = deepPick(payload, ["cheques_sem_fundo", "chequesSemFundo"]) ?? firstVal(flat, "cheques_sem_fundo")
    const acoes =
        deepPick(payload, ["acoes_civeis", "acoesCiveis", "AcoesCiveis"]) ?? firstVal(flat, "acoes_civeis")

    const head =
        nome || cpfFmt || dn || idade
            ? (
                  <div className="grid sm:grid-cols-2 gap-3">
                      {nome && !isValorVazio(nome) && <Campo label="Nome" value={flattenObj(nome)} />}
                      {cpfFmt && <Campo label="CPF" value={cpfFmt} mono />}
                      {dn && !isValorVazio(dn) && <Campo label="Data nascimento" value={fmtData(dn)} />}
                      {idade !== undefined && idade !== null && !isValorVazio(idade) && (
                          <Campo label="Idade" value={flattenObj(idade)} />
                      )}
                  </div>
              )
            : null

    const scoreBlock =
        scoreN !== null || (renda !== undefined && renda !== null && !isValorVazio(renda)) ? (
            <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 space-y-3">
                <p className="text-[10px] uppercase font-black tracking-wider text-muted-foreground">Score</p>
                {scoreN !== null && (
                    <>
                        <BarraScore score={scoreN} />
                        <Campo label="Pontuação" value={scoreN} destaque />
                    </>
                )}
                {renda !== undefined && renda !== null && !isValorVazio(renda) && (
                    <Campo
                        label="Renda presumida"
                        value={typeof renda === "number" ? fmtReaisCampo(renda) : flattenObj(renda)}
                    />
                )}
            </div>
        ) : null

    const restr = (
        <div className="grid sm:grid-cols-2 gap-2">
            <RestricaoLinha label="Pendências financeiras" val={pend} />
            <RestricaoLinha label="Dívidas" val={divs} />
            <RestricaoLinha label="Protestos" val={prot} />
            <RestricaoLinha label="Cheques sem fundo" val={chq} />
            <RestricaoLinha label="Ações cíveis" val={acoes} />
        </div>
    )

    const endereco = <SecaoEndereco payload={payload} />

    return (
        <div className="space-y-4">
            {head && (
                <div>
                    <p className="text-[10px] uppercase font-black tracking-wider text-muted-foreground mb-2">Identificação</p>
                    {head}
                </div>
            )}
            {scoreBlock}
            <div>
                <p className="text-[10px] uppercase font-black tracking-wider text-muted-foreground mb-2">Restrições</p>
                {restr}
            </div>
            {endereco}
        </div>
    )
}

function CardBoaVista({ payload, pdfUrl }: { payload: Record<string, unknown>; pdfUrl: string | null }) {
    const root = extractDados(payload) || payload
    const cred: any = root.CREDCADASTRAL || root.BOAVISTA || root

    const ident = cred?.IDENTIFICACAO_PESSOA_FISICA || cred?.IDENTIFICACAO_PESSOA_JURIDICA || {}
    const nome = ident?.NOME || ident?.RAZAO_SOCIAL || deepPick(payload, ["nome", "Nome", "razao_social"])
    const doc = ident?.CPF_NUMERO || ident?.CNPJ_NUMERO || deepPick(payload, ["cpf", "cnpj"])
    const docFmt =
        doc !== undefined && doc !== null
            ? onlyDigits(String(doc), 14).length >= 14
                ? formatCnpjDisplay(onlyDigits(String(doc), 14))
                : formatCpfDisplay(onlyDigits(String(doc), 11))
            : ""
    const nasc = ident?.NASCIMENTO || ident?.DATA_FUNDACAO || deepPick(payload, ["data_nascimento", "data_fundacao"])
    
    // Scores
    let scoreN: number | null = null
    const scores = cred?.SCORES?.OCORRENCIAS
    if (Array.isArray(scores) && scores.length > 0) {
        scoreN = Number(scores[0]?.SCORE) || null
    } else {
        scoreN = pickScoreFromPayload(payload)
    }

    // Pendências financeiras
    const pendCount = Number(cred?.PEND_FINANCEIRAS?.QUANTIDADE_OCORRENCIA || cred?.PENDENCIAS_FINANCEIRAS?.QUANTIDADE_OCORRENCIA || 0)
    const pendVal = cred?.PEND_FINANCEIRAS?.VALOR_TOTAL || cred?.PENDENCIAS_FINANCEIRAS?.VALOR_TOTAL
    const pend = pendCount > 0 ? `${pendCount} ocorrências (Total: R$ ${pendVal})` : null

    // Protestos
    const protCount = Number(cred?.PROTESTOS?.QUANTIDADE_OCORRENCIA || 0)
    const protVal = cred?.PROTESTOS?.VALOR_TOTAL
    const prot = protCount > 0 ? `${protCount} protestos (Total: R$ ${protVal})` : null

    // Cheques
    const chqVarejo = Number(cred?.CH_SEM_FUNDOS_VAREJO?.QUANTIDADE_OCORRENCIA || 0)
    const chqBacen = Number(cred?.CH_SEM_FUNDOS_BACEN?.QUANTIDADE_OCORRENCIA || 0)
    const chqTotal = chqVarejo + chqBacen
    const chq = chqTotal > 0 ? `${chqTotal} cheques sem fundo` : null

    // Ações
    const acoesCount = Number(cred?.ACOES_CIVEIS?.QUANTIDADE_OCORRENCIA || 0)
    const acoes = acoesCount > 0 ? `${acoesCount} ações cíveis` : null

    // Passagens
    const passagens = cred?.PASSAGENS_COMERCIAIS?.QUANTIDADE_OCORRENCIA
    
    // Renda presumida
    const renda = cred?.RENDA_PRESUMIDA?.FAIXA

    const head =
        nome || docFmt || nasc ? (
            <div className="grid sm:grid-cols-2 gap-3">
                {nome && !isValorVazio(nome) && <Campo label="Nome / razão" value={flattenObj(nome)} />}
                {docFmt && <Campo label="Documento" value={docFmt} mono />}
                {nasc && !isValorVazio(nasc) && <Campo label="Data nascimento/fundação" value={String(nasc)} />}
                {renda && !isValorVazio(renda) && <Campo label="Renda/Faturamento" value={String(renda)} />}
            </div>
        ) : null

    const scoreBlock =
        scoreN !== null ? (
            <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 space-y-3">
                <p className="text-[10px] uppercase font-black tracking-wider text-muted-foreground">Score</p>
                <BarraScore score={scoreN} />
                <Campo label="Pontuação" value={scoreN} destaque />
            </div>
        ) : null

    const hasAnySignal =
        Boolean(head) ||
        scoreN !== null ||
        pendCount > 0 ||
        protCount > 0 ||
        chqTotal > 0 ||
        acoesCount > 0 ||
        Number(passagens) > 0 ||
        Boolean(pdfUrl)

    if (!hasAnySignal) {
        return <p className="text-sm text-muted-foreground">Dados não disponíveis para esta consulta.</p>
    }

    return (
        <div className="space-y-4">
            {head && (
                <div>
                    <p className="text-[10px] uppercase font-black tracking-wider text-muted-foreground mb-2">Identificação</p>
                    {head}
                </div>
            )}
            {scoreBlock}
            <div>
                <p className="text-[10px] uppercase font-black tracking-wider text-muted-foreground mb-2">Indicadores (Boa Vista)</p>
                <div className="grid sm:grid-cols-2 gap-2">
                    <RestricaoLinha label="Pendências financeiras" val={pend} />
                    <RestricaoLinha label="Protestos" val={prot} />
                    <RestricaoLinha label="Cheques sem fundo" val={chq} />
                    <RestricaoLinha label="Ações Cíveis" val={acoes} />
                    {passagens && Number(passagens) > 0 && (
                        <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/20 p-2">
                            <User className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                            <div className="min-w-0 flex-1">
                                <div className="text-[10px] uppercase font-black text-muted-foreground tracking-tight">Passagens Comerciais</div>
                                <div className="text-sm font-medium text-amber-700 dark:text-amber-400">
                                    {passagens} consultas recentes
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            <SecaoEndereco payload={payload} />
            {pdfUrl && (
                <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium",
                        "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm h-10 px-4 py-2 w-full",
                        "ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    )}
                >
                    <ExternalLink className="w-4 h-4" />
                    Ver relatório completo (PDF)
                </a>
            )}
        </div>
    )
}

function CardAgregados({ payload }: { payload: Record<string, unknown> }) {
    const d = (payload.dados ?? payload.Dados ?? payload) as any
    if (!d || typeof d !== "object") return <CardFipe payload={payload} />

    const iden = d.identificacao || {}
    const marca = d.marca || {}
    const modelo = d.modelo || {}
    const motor = d.motor || {}
    const trans = d.transmissao || {}
    const classif = d.classificacao || {}
    const dim = d.dimensoes || {}
    const cor = d.cor || {}
    const loc = d.localizacao || {}
    const fat = d.faturado || {}

    const placa = iden.placaMercosul || iden.placa
    const chassi = iden.chassi
    const descMarca = marca.descricao
    const descModelo = modelo.descricao
    const versao = modelo.versao
    const anoFab = modelo.anoFabricacao
    const anoMod = modelo.anoModelo
    const corDesc = cor.descricao || cor.alternativa

    return (
        <div className="space-y-6">
            {/* Identificação Principal */}
            <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-3">
                    <p className="text-[10px] uppercase font-black tracking-wider text-muted-foreground">Identificação</p>
                    <div className="grid grid-cols-2 gap-2">
                        {placa && <Campo label="Placa" value={formatPlacaMercosul(placa)} mono />}
                        {chassi && <Campo label="Chassi" value={String(chassi)} mono />}
                        {anoFab && <Campo label="Ano Fab." value={String(anoFab)} />}
                        {anoMod && <Campo label="Ano Mod." value={String(anoMod)} />}
                    </div>
                </div>
                <div className="space-y-3">
                    <p className="text-[10px] uppercase font-black tracking-wider text-muted-foreground">Marca / Modelo</p>
                    <div className="space-y-2">
                        {(descMarca || descModelo) && (
                            <div className="text-sm font-bold text-primary uppercase">
                                {descMarca} {descModelo}
                            </div>
                        )}
                        {versao && <div className="text-[11px] font-medium leading-tight text-muted-foreground uppercase">{versao}</div>}
                        {corDesc && <Campo label="Cor" value={String(corDesc)} />}
                    </div>
                </div>
            </div>

            {/* Motor e Transmissão */}
            <div className="grid sm:grid-cols-2 gap-4 pt-4 border-t border-border/40">
                <div className="space-y-3">
                    <p className="text-[10px] uppercase font-black tracking-wider text-muted-foreground">Motorização</p>
                    <div className="grid grid-cols-2 gap-2">
                        {motor.numero && <Campo label="Número Motor" value={String(motor.numero)} mono />}
                        {motor.potencia && <Campo label="Potência" value={`${motor.potencia} CV`} />}
                        {motor.cilindradas && <Campo label="Cilindradas" value={String(motor.cilindradas)} />}
                        {classif.combustivel && <Campo label="Combustível" value={String(classif.combustivel)} />}
                    </div>
                </div>
                <div className="space-y-3">
                    <p className="text-[10px] uppercase font-black tracking-wider text-muted-foreground">Transmissão / Espécie</p>
                    <div className="grid grid-cols-2 gap-2">
                        {trans.caixaCambio && <Campo label="Câmbio" value={String(trans.caixaCambio)} />}
                        {classif.tipoVeiculo && <Campo label="Tipo" value={String(classif.tipoVeiculo)} />}
                        {classif.especie && <Campo label="Espécie" value={String(classif.especie)} />}
                    </div>
                </div>
            </div>

            {/* Dimensões e Localização */}
            <div className="grid sm:grid-cols-2 gap-4 pt-4 border-t border-border/40">
                <div className="space-y-3">
                    <p className="text-[10px] uppercase font-black tracking-wider text-muted-foreground">Capacidades / Dimensões</p>
                    <div className="grid grid-cols-2 gap-2">
                        {dim.quantidadeLugares && <Campo label="Lugares" value={String(dim.quantidadeLugares)} />}
                        {dim.quantidadeEixo && <Campo label="Eixos" value={String(dim.quantidadeEixo)} />}
                        {dim.pesoBrutoTotal && <Campo label="PBT" value={`${dim.pesoBrutoTotal} kg`} />}
                        {dim.capacidadeMaxTracao && <Campo label="CMT" value={`${dim.capacidadeMaxTracao} kg`} />}
                    </div>
                </div>
                <div className="space-y-3">
                    <p className="text-[10px] uppercase font-black tracking-wider text-muted-foreground">Registro / Faturamento</p>
                    <div className="grid grid-cols-2 gap-2">
                        {(loc.uf || loc.cidade) && <Campo label="Localidade" value={`${loc.cidade || ""} ${loc.uf || ""}`.trim()} />}
                        {fat.documento && <Campo label="Doc. Faturado" value={String(fat.documento)} mono />}
                        {fat.uf && <Campo label="UF Faturado" value={String(fat.uf)} />}
                        {marca.fipeId && <Campo label="FIPE ID" value={String(marca.fipeId)} />}
                    </div>
                </div>
            </div>
        </div>
    )
}

function CardFipe({ payload }: { payload: Record<string, unknown> }) {
    // Se detectarmos a estrutura de "Agregados", delegamos
    if (payload.dados && (payload.dados as any).identificacao) {
        return <CardAgregados payload={payload} />
    }

    const flat = mergePayloadFlat(payload)
    const placa = deepPick(payload, ["placa", "Placa"]) ?? firstVal(flat, "placa")
    const chassi = deepPick(payload, ["chassi", "vin", "Chassi"]) ?? firstVal(flat, "chassi")
    const renavam = deepPick(payload, ["renavam", "Renavam"]) ?? firstVal(flat, "renavam")
    const marca = deepPick(payload, ["marca", "Marca"]) ?? firstVal(flat, "marca")
    const modelo = deepPick(payload, ["modelo", "Modelo"]) ?? firstVal(flat, "modelo")
    const anoFab = deepPick(payload, ["ano_fabricacao", "anoFabricacao"]) ?? firstVal(flat, "ano_fabricacao")
    const anoMod = deepPick(payload, ["ano_modelo", "anoModelo"]) ?? firstVal(flat, "ano_modelo")
    const cor = deepPick(payload, ["cor", "Cor"]) ?? firstVal(flat, "cor")
    const comb = deepPick(payload, ["combustivel", "Combustivel"]) ?? firstVal(flat, "combustivel")
    const mun = deepPick(payload, ["municipio", "Municipio"]) ?? firstVal(flat, "municipio")
    const uf = deepPick(payload, ["uf", "UF"]) ?? firstVal(flat, "uf")
    const vfipe = deepPick(payload, ["valor_fipe", "valorFipe"]) ?? firstVal(flat, "valor_fipe")
    const codFipe = deepPick(payload, ["codigo_fipe", "codigoFipe"]) ?? firstVal(flat, "codigo_fipe")
    const ref = deepPick(payload, ["data_referencia", "dataReferencia"]) ?? firstVal(flat, "data_referencia")
    const prop = deepPick(payload, ["proprietario", "nome_proprietario", "Proprietario"]) ?? firstVal(flat, "proprietario")
    const cpfProp = deepPick(payload, ["cpf_proprietario", "cpf"]) ?? firstVal(flat, "cpf_proprietario")
    const cnpjProp = deepPick(payload, ["cnpj_proprietario", "cnpj"]) ?? firstVal(flat, "cnpj_proprietario")

    const veh = [
        placa && <Campo key="p" label="Placa" value={formatPlacaMercosul(placa)} mono />,
        chassi && !isValorVazio(chassi) && <Campo key="ch" label="Chassi" value={String(chassi)} mono />,
        renavam && !isValorVazio(renavam) && <Campo key="r" label="RENAVAM" value={String(renavam)} mono />,
        marca && !isValorVazio(marca) && <Campo key="m" label="Marca" value={flattenObj(marca)} />,
        modelo && !isValorVazio(modelo) && <Campo key="mo" label="Modelo" value={flattenObj(modelo)} />,
        anoFab && !isValorVazio(anoFab) && <Campo key="af" label="Ano fabricação" value={String(anoFab)} />,
        anoMod && !isValorVazio(anoMod) && <Campo key="am" label="Ano modelo" value={String(anoMod)} />,
        cor && !isValorVazio(cor) && <Campo key="c" label="Cor" value={flattenObj(cor)} />,
        comb && !isValorVazio(comb) && <Campo key="co" label="Combustível" value={flattenObj(comb)} />,
        (mun || uf) && (
            <Campo
                key="loc"
                label="Município / UF"
                value={[mun && String(flattenObj(mun)), uf && String(flattenObj(uf))].filter(Boolean).join(" / ")}
            />
        ),
    ].filter(Boolean)

    const propDoc =
        cpfProp && !isValorVazio(cpfProp)
            ? formatCpfDisplay(onlyDigits(String(cpfProp), 11))
            : cnpjProp && !isValorVazio(cnpjProp)
              ? formatCnpjDisplay(onlyDigits(String(cnpjProp), 14))
              : ""

    const hasFipe = vfipe !== undefined && vfipe !== null && !isValorVazio(vfipe)
    if (!veh.length && !hasFipe && !prop && !propDoc) {
        return <p className="text-sm text-muted-foreground">Dados não disponíveis para esta consulta.</p>
    }

    return (
        <div className="space-y-4">
            {veh.length > 0 && (
                <div>
                    <p className="text-[10px] uppercase font-black tracking-wider text-muted-foreground mb-2">Veículo</p>
                    <div className="grid sm:grid-cols-2 gap-3">{veh}</div>
                </div>
            )}
            {hasFipe && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-2">
                    <p className="text-[10px] uppercase font-black tracking-wider text-muted-foreground">FIPE</p>
                    <Campo label="Valor FIPE" value={fmtReaisCampo(vfipe)} destaque />
                    {codFipe && !isValorVazio(codFipe) && <Campo label="Código FIPE" value={String(codFipe)} mono />}
                    {ref && !isValorVazio(ref) && <Campo label="Referência" value={fmtMesAnoRef(ref)} />}
                </div>
            )}
            {(prop || propDoc) && (
                <div>
                    <p className="text-[10px] uppercase font-black tracking-wider text-muted-foreground mb-2">Proprietário</p>
                    <div className="grid sm:grid-cols-2 gap-3">
                        {prop && !isValorVazio(prop) && <Campo label="Nome" value={flattenObj(prop)} />}
                        {propDoc && <Campo label="Documento" value={propDoc} mono />}
                    </div>
                </div>
            )}
        </div>
    )
}

function rouboTemIndicio(payload: Record<string, unknown>): boolean {
    const occ = deepPick(payload, ["ocorrencias", "Ocorrencias"])
    if (Array.isArray(occ) && occ.length > 0) return true
    const hist = deepPick(payload, ["historico", "Historico"])
    if (Array.isArray(hist) && hist.length > 0) return true
    const dataOcc = deepPick(payload, ["data_ocorrencia", "dataOcorrencia"])
    if (dataOcc && String(dataOcc).length > 4) return true
    const bo = deepPick(payload, ["numero_bo", "boletim_ocorrencia", "NumeroBO"])
    if (bo && String(bo).trim()) return true
    const blob = JSON.stringify(payload).toLowerCase()
    if (/roubo|furto|restri/.test(blob) && /sim|true|positiv|constat/i.test(blob)) return true
    return false
}

function CardRoubo({ payload }: { payload: Record<string, unknown> }) {
    const restrito = rouboTemIndicio(payload)
    const tipoOc = deepPick(payload, ["tipo_ocorrencia", "tipoOcorrencia"])
    const dataOc = deepPick(payload, ["data_ocorrencia", "dataOcorrencia"])
    const bo = deepPick(payload, ["numero_bo", "boletim_ocorrencia"])
    const ufOc = deepPick(payload, ["uf_ocorrencia", "ufOcorrencia", "uf"])

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
                {restrito ? (
                    <Badge className="bg-rose-600 hover:bg-rose-600 text-white border-0 text-sm px-4 py-2">
                        RESTRIÇÃO DE ROUBO/FURTO
                    </Badge>
                ) : (
                    <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white border-0 text-sm px-4 py-2">
                        SEM RESTRIÇÕES
                    </Badge>
                )}
            </div>
            {restrito && (
                <div className="grid sm:grid-cols-2 gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                    {dataOc && !isValorVazio(dataOc) && <Campo label="Data ocorrência" value={fmtData(dataOc)} />}
                    {tipoOc && !isValorVazio(tipoOc) && <Campo label="Tipo" value={String(tipoOc)} />}
                    {bo && !isValorVazio(bo) && <Campo label="BO" value={String(bo)} mono />}
                    {ufOc && !isValorVazio(ufOc) && <Campo label="UF ocorrência" value={String(ufOc)} />}
                </div>
            )}
        </div>
    )
}

type ConsultKind =
    | "fipe"
    | "roubo"
    | "cpfScore"
    | "cred"
    | "bv"
    | "quod"
    | "cnpjCompleto"
    | "credCnpj"
    | "bvCnpj"
    | "quodCnpj"

interface PendingConsult {
    kind: ConsultKind
    label: string
    cost: number
    tipo: string
    chave: string
    run: () => Promise<unknown>
}

function runConsultWithForcar(p: PendingConsult): Promise<unknown> {
    switch (p.kind) {
        case "fipe":
            return consultasApi.fipe(p.chave, { forcar: true })
        case "roubo":
            return consultasApi.historicoRouboFurto(p.chave, { forcar: true })
        case "cpfScore":
            return consultasApi.cpfScoreDividas(p.chave, { forcar: true })
        case "cred":
            return consultasApi.credCompleta(p.chave, { forcar: true })
        case "bv":
            return consultasApi.boaVista(p.chave, { forcar: true })
        case "quod":
            return consultasApi.quod(p.chave, { forcar: true })
        case "cnpjCompleto":
            return consultasApi.cnpj(p.chave, { forcar: true })
        case "credCnpj":
            return consultasApi.credCompleta(p.chave, { forcar: true })
        case "bvCnpj":
            return consultasApi.boaVista(p.chave, { forcar: true })
        case "quodCnpj":
            return consultasApi.quod(p.chave, { forcar: true })
        default:
            return p.run()
    }
}

const CPF_RESULT_KINDS: ConsultKind[] = ["cpfScore", "cred", "bv", "quod"]

const TAB_VALUES = new Set(["veiculo", "cpf", "cnpj", "bin"])

/** Tipos gravados na BD (`consultas_apifull_historico.tipo`) → chave no estado `results`. */
const TIPO_TO_KIND: Record<string, ConsultKind | "bin"> = {
    fipe: "fipe",
    roubo: "roubo",
    cpf_score: "cpfScore",
    cred: "cred",
    cred_cnpj: "credCnpj",
    boa_vista: "bv",
    boa_vista_cnpj: "bvCnpj",
    quod: "quod",
    quod_cnpj: "quodCnpj",
    cnpj_completo: "cnpjCompleto",
    bin: "bin",
}

const TIPO_LABEL: Record<string, string> = {
    fipe: "FIPE",
    roubo: "Roubo/Furto",
    cpf_score: "Score + dívidas",
    cred: "Cred Completa",
    cred_cnpj: "Cred Completa (CNPJ)",
    boa_vista: "Boa Vista",
    boa_vista_cnpj: "Boa Vista (CNPJ)",
    quod: "QUOD",
    quod_cnpj: "QUOD (CNPJ)",
    cnpj_completo: "CNPJ completo",
    bin: "BIN Nacional",
    ncm_fiscal: "NCM (busca Fiscal / NF-e)",
}

function formatChaveHistorico(tipo: string, chave: string): string {
    if (tipo === "fipe" || tipo === "roubo") return chave.toUpperCase()
    if (tipo === "bin" || tipo === "ncm_fiscal") return chave
    const d = onlyDigits(chave, 14)
    if (d.length === 14) return formatCnpjDisplay(d)
    if (d.length >= 11) return formatCpfDisplay(d.slice(0, 11))
    return chave
}

interface HistoricoListaItem {
    id: string
    tipo: string
    chave_normalizada: string
    atendente_id?: string | null
    created_at: string
}

function strClean(v: unknown): string {
    if (v === null || v === undefined) return ""
    return String(v).trim()
}

/** Varre a árvore JSON em busca de telefone (API Full tem formatos variados). */
function collectPhoneFromTree(obj: unknown): string {
    let found = ""
    const walk = (o: unknown) => {
        if (!o || typeof o !== "object") return
        if (Array.isArray(o)) {
            for (const it of o) walk(it)
            return
        }
        for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
            const kl = k.toLowerCase()
            if (/telefone|celular|fone|whatsapp|mobile|ddd/i.test(kl) && (typeof v === "string" || typeof v === "number")) {
                const raw = String(v).trim()
                const digits = raw.replace(/\D/g, "")
                if (digits.length >= 10 && digits.length <= 13) found = raw
            }
            if (v && typeof v === "object") walk(v)
        }
    }
    walk(obj)
    return found
}

/** Monta payload para POST /api/clientes/ a partir das respostas de consulta por CPF. */
function buildClienteDraftFromCpfConsultas(
    results: Partial<Record<ConsultKind, unknown>>,
    cpfDigits: string
): Record<string, unknown> {
    let nome = ""
    let email = ""
    let telefone = ""
    let cep = ""
    let endereco_logradouro = ""
    let endereco_numero = ""
    let endereco_complemento = ""
    let endereco_bairro = ""
    let endereco_cidade = ""
    let endereco_uf = ""

    const merge = (payload: Record<string, unknown>) => {
        const dados = extractDados(payload) ?? payload
        const blob = dados as Record<string, unknown>
        if (!nome) {
            const n =
                deepPick(blob, ["nome", "Nome", "nomeCompleto", "nome_completo", "name", "nomeSocial"]) ??
                deepPick(payload, ["nome", "Nome"])
            if (n !== undefined && n !== null) nome = strClean(n)
        }
        if (!email) {
            const em =
                deepPick(blob, ["email", "Email", "e_mail", "e-mail"]) ?? deepPick(payload, ["email"])
            if (em !== undefined && em !== null) email = strClean(em)
        }
        if (!telefone) {
            const tel =
                deepPick(blob, ["telefone", "Telefone", "celular", "Celular", "fone"]) ??
                deepPick(payload, ["telefone"])
            if (tel !== undefined && tel !== null) telefone = strClean(tel)
        }
        if (!cep) {
            const c = deepPick(blob, ["cep", "CEP", "codigoPostal", "CodigoPostal"]) ?? deepPick(payload, ["cep"])
            if (c !== undefined && c !== null) cep = onlyDigits(strClean(c), 9)
        }
        if (!endereco_logradouro) {
            const lg =
                deepPick(blob, ["endereco", "logradouro", "rua", "Logradouro", "Endereco"]) ??
                deepPick(payload, ["endereco"])
            if (lg !== undefined && lg !== null) endereco_logradouro = strClean(lg)
        }
        if (!endereco_numero) {
            const n = deepPick(blob, ["numero", "Numero", "nro", "nr"])
            if (n !== undefined && n !== null) endereco_numero = strClean(n)
        }
        if (!endereco_complemento) {
            const n = deepPick(blob, ["complemento", "Complemento"])
            if (n !== undefined && n !== null) endereco_complemento = strClean(n)
        }
        if (!endereco_bairro) {
            const n = deepPick(blob, ["bairro", "Bairro"])
            if (n !== undefined && n !== null) endereco_bairro = strClean(n)
        }
        if (!endereco_cidade) {
            const n =
                deepPick(blob, ["cidade", "Cidade", "municipio", "Municipio", "nomeMunicipio"]) ??
                deepPick(payload, ["cidade"])
            if (n !== undefined && n !== null) endereco_cidade = strClean(n)
        }
        if (!endereco_uf) {
            const n = deepPick(blob, ["uf", "UF", "estado", "Estado"]) ?? deepPick(payload, ["uf"])
            if (n !== undefined && n !== null) endereco_uf = strClean(n).slice(0, 2).toUpperCase()
        }
    }

    for (const k of CPF_RESULT_KINDS) {
        const r = results[k]
        if (r && typeof r === "object") merge(r as Record<string, unknown>)
    }

    if (!telefone) {
        for (const k of CPF_RESULT_KINDS) {
            const r = results[k]
            if (r && typeof r === "object") {
                telefone = collectPhoneFromTree(r)
                if (telefone) break
            }
        }
    }

    const documento = onlyDigits(cpfDigits, 11)
    const out: Record<string, unknown> = {
        nome: nome || `Cliente CPF ${formatCpfDisplay(documento)}`,
        documento,
    }
    if (email) out.email = email
    if (telefone) out.telefone = telefone
    if (cep) out.cep = cep
    if (endereco_logradouro) out.endereco_logradouro = endereco_logradouro
    if (endereco_numero) out.endereco_numero = endereco_numero
    if (endereco_complemento) out.endereco_complemento = endereco_complemento
    if (endereco_bairro) out.endereco_bairro = endereco_bairro
    if (endereco_cidade) out.endereco_cidade = endereco_cidade
    if (endereco_uf) out.endereco_uf = endereco_uf

    const partesEnd = [endereco_logradouro, endereco_numero, endereco_bairro, endereco_cidade, endereco_uf]
        .filter(Boolean)
        .join(", ")
    if (partesEnd && !out.endereco) out.endereco = partesEnd

    return out
}

export function ConsultasApiFull() {
    const [searchParams, setSearchParams] = useSearchParams()
    const [placa, setPlaca] = useState("")
    const [cpf, setCpf] = useState("")
    const [cnpj, setCnpj] = useState("")

    const [balanceLoading, setBalanceLoading] = useState(false)
    const [saldoDisplay, setSaldoDisplay] = useState<number | string | null>(null)

    const [loadingKind, setLoadingKind] = useState<ConsultKind | null>(null)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)

    const [results, setResults] = useState<Partial<Record<ConsultKind, unknown>>>({})
    const [pending, setPending] = useState<PendingConsult | null>(null)
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [pendingForcar, setPendingForcar] = useState(false)
    const [historyCheck, setHistoryCheck] = useState<{
        open: boolean
        found: boolean
        created_at: string | null
        row_id: string | null
        pending: PendingConsult | null
    }>({ open: false, found: false, created_at: null, row_id: null, pending: null })

    const placaClean = useMemo(() => normalizePlaca(placa), [placa])
    const cpfClean = useMemo(() => onlyDigits(cpf, 11), [cpf])
    const cnpjClean = useMemo(() => onlyDigits(cnpj, 14), [cnpj])

    const tabFromUrl = searchParams.get("tab") || ""
    const activeTab = TAB_VALUES.has(tabFromUrl) ? tabFromUrl : "veiculo"

    const setActiveTab = useCallback(
        (v: string) => {
            if (v === "veiculo") {
                setSearchParams({}, { replace: true })
            } else {
                setSearchParams({ tab: v }, { replace: true })
            }
        },
        [setSearchParams]
    )

    const [clienteModalOpen, setClienteModalOpen] = useState(false)
    const [savingCliente, setSavingCliente] = useState(false)
    const [clienteForm, setClienteForm] = useState<Record<string, string>>({})

    const [historicoOpen, setHistoricoOpen] = useState(false)
    const [historicoLoading, setHistoricoLoading] = useState(false)
    const [historicoRows, setHistoricoRows] = useState<HistoricoListaItem[]>([])
    const [binReplay, setBinReplay] = useState<{ bin: string; payload: Record<string, unknown> } | null>(null)

    const fetchBalance = useCallback(async () => {
        setBalanceLoading(true)
        try {
            const data = await consultasApi.balance()
            const creditsVal =
                data?.credits ??
                data?.dados?.Saldo ??
                data?.dados?.credits ??
                data?.saldo ??
                data?.Saldo ??
                null
            setSaldoDisplay(creditsVal)
        } catch {
            setSaldoDisplay(null)
        } finally {
            setBalanceLoading(false)
        }
    }, [])

    useEffect(() => {
        void fetchBalance()
    }, [fetchBalance])

    useEffect(() => {
        if (!historicoOpen) return
        let cancelled = false
        ;(async () => {
            setHistoricoLoading(true)
            try {
                const rows = (await consultasApi.listarHistorico(100)) as HistoricoListaItem[]
                if (!cancelled && Array.isArray(rows)) setHistoricoRows(rows)
            } catch {
                if (!cancelled) setHistoricoRows([])
            } finally {
                if (!cancelled) setHistoricoLoading(false)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [historicoOpen])

    const aplicarHistorico = useCallback(
        async (row: HistoricoListaItem) => {
            try {
                const full = (await consultasApi.historicoDetalhe(row.id)) as {
                    tipo: string
                    chave_normalizada: string
                    resultado: unknown
                }
                const tipo = full.tipo
                const chave = full.chave_normalizada
                const rawRes = full.resultado
                const resultado =
                    typeof rawRes === "object" && rawRes !== null && !Array.isArray(rawRes)
                        ? (rawRes as Record<string, unknown>)
                        : { _raw: rawRes as unknown }

                const marcado = {
                    ...resultado,
                    _consulta_from_history: true,
                }

                if (tipo === "bin") {
                    setBinReplay({ bin: chave, payload: marcado })
                    setActiveTab("bin")
                    setHistoricoOpen(false)
                    toast.message("Consulta recuperada do histórico", {
                        description: "Mesmo resultado salvo anteriormente — sem nova cobrança.",
                    })
                    return
                }

                if (tipo === "ncm_fiscal") {
                    setHistoricoOpen(false)
                    toast.message("Busca NCM (módulo Fiscal)", {
                        description:
                            "Este registro veio da busca de NCM na emissão de NF-e. Abra Fiscal e use o mesmo termo para ver os códigos na lista.",
                    })
                    return
                }

                const kind = TIPO_TO_KIND[tipo]
                if (!kind || kind === "bin") {
                    toast.error("Tipo de consulta não reconhecido.")
                    return
                }

                setResults((prev) => ({ ...prev, [kind]: marcado }))

                if (tipo === "fipe" || tipo === "roubo") {
                    setPlaca(normalizePlaca(chave))
                    setActiveTab("veiculo")
                } else if (
                    tipo === "cpf_score" ||
                    tipo === "cred" ||
                    tipo === "boa_vista" ||
                    tipo === "quod"
                ) {
                    setCpf(onlyDigits(chave, 11))
                    setActiveTab("cpf")
                } else if (
                    tipo === "cnpj_completo" ||
                    tipo === "cred_cnpj" ||
                    tipo === "boa_vista_cnpj" ||
                    tipo === "quod_cnpj"
                ) {
                    setCnpj(onlyDigits(chave, 14))
                    setActiveTab("cnpj")
                }

                setHistoricoOpen(false)
                toast.message("Consulta recuperada do histórico", {
                    description: "Mesmo resultado salvo anteriormente — sem nova cobrança.",
                })
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : "Não foi possível carregar o registro.")
            }
        },
        [setActiveTab]
    )

    const openConsult = async (p: PendingConsult) => {
        setErrorMsg(null)
        setPendingForcar(false)
        setPending(p)
        try {
            const check = await consultasApi.checkHistorico(p.tipo, p.chave)
            if (check.found) {
                setHistoryCheck({
                    open: true,
                    found: true,
                    created_at: check.created_at ?? null,
                    row_id: check.id ?? null,
                    pending: p,
                })
                return
            }
        } catch {
            /* se check falhar, segue o fluxo normal */
        }
        setConfirmOpen(true)
    }

    const forceNewConsult = () => {
        setHistoryCheck({ open: false, found: false, created_at: null, row_id: null, pending: null })
        setPendingForcar(true)
        setConfirmOpen(true)
    }

    const closeHistoryCheckModal = () => {
        setHistoryCheck({ open: false, found: false, created_at: null, row_id: null, pending: null })
        setPending(null)
    }

    const useFromHistory = async () => {
        const id = historyCheck.row_id
        const p = historyCheck.pending
        if (!id || !p) return
        setHistoryCheck({ open: false, found: false, created_at: null, row_id: null, pending: null })
        setLoadingKind(p.kind)
        setErrorMsg(null)
        try {
            const full = (await consultasApi.historicoDetalhe(id)) as {
                tipo: string
                chave_normalizada: string
                resultado: unknown
            }
            const tipo = full.tipo
            const chave = full.chave_normalizada
            let rawRes = full.resultado
            
            if (typeof rawRes === "string") {
                try {
                    rawRes = JSON.parse(rawRes)
                } catch {
                    // ignore
                }
            }
            
            const resultado =
                typeof rawRes === "object" && rawRes !== null && !Array.isArray(rawRes)
                    ? (rawRes as Record<string, unknown>)
                    : { _raw: rawRes as unknown }

            const marcado = {
                ...resultado,
                _consulta_from_history: true,
            }

            const kind = TIPO_TO_KIND[tipo]
            if (!kind || kind === "bin") {
                toast.error("Tipo de consulta não reconhecido.")
                return
            }

            setResults((prev) => ({ ...prev, [kind]: marcado }))

            if (tipo === "fipe" || tipo === "roubo") {
                setPlaca(normalizePlaca(chave))
                setActiveTab("veiculo")
            } else if (
                tipo === "cpf_score" ||
                tipo === "cred" ||
                tipo === "boa_vista" ||
                tipo === "quod"
            ) {
                setCpf(onlyDigits(chave, 11))
                setActiveTab("cpf")
            } else if (
                tipo === "cnpj_completo" ||
                tipo === "cred_cnpj" ||
                tipo === "boa_vista_cnpj" ||
                tipo === "quod_cnpj"
            ) {
                setCnpj(onlyDigits(chave, 14))
                setActiveTab("cnpj")
            }

            toast.message("Consulta recuperada do histórico", {
                description: "Mesmo resultado salvo anteriormente — sem nova cobrança.",
            })
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Não foi possível carregar o registro.")
        } finally {
            setLoadingKind(null)
            setPending(null)
        }
    }

    const buildPendingForKind = useCallback(
        (kind: ConsultKind): PendingConsult | null => {
            switch (kind) {
                case "fipe":
                    if (placaClean.length < 7) return null
                    return {
                        kind,
                        label: "FIPE",
                        cost: 0.11,
                        tipo: "fipe",
                        chave: placaClean,
                        run: () => consultasApi.fipe(placaClean),
                    }
                case "roubo":
                    if (placaClean.length < 7) return null
                    return {
                        kind,
                        label: "Histórico Roubo/Furto",
                        cost: 3.6,
                        tipo: "roubo",
                        chave: placaClean,
                        run: () => consultasApi.historicoRouboFurto(placaClean),
                    }
                case "cpfScore":
                    if (cpfClean.length !== 11) return null
                    return {
                        kind,
                        label: "Dados + Score + Dívidas",
                        cost: 2.99,
                        tipo: "cpf_score",
                        chave: cpfClean,
                        run: () => consultasApi.cpfScoreDividas(cpfClean),
                    }
                case "cred":
                    if (cpfClean.length !== 11) return null
                    return {
                        kind,
                        label: "Cred Completa Plus",
                        cost: 2.49,
                        tipo: "cred",
                        chave: cpfClean,
                        run: () => consultasApi.credCompleta(cpfClean),
                    }
                case "bv":
                    if (cpfClean.length !== 11) return null
                    return {
                        kind,
                        label: "Boa Vista Essencial",
                        cost: 3.23,
                        tipo: "boa_vista",
                        chave: cpfClean,
                        run: () => consultasApi.boaVista(cpfClean),
                    }
                case "quod":
                    if (cpfClean.length !== 11) return null
                    return {
                        kind,
                        label: "QUOD",
                        cost: 4.78,
                        tipo: "quod",
                        chave: cpfClean,
                        run: () => consultasApi.quod(cpfClean),
                    }
                case "cnpjCompleto":
                    if (cnpjClean.length !== 14) return null
                    return {
                        kind,
                        label: "CNPJ Completo",
                        cost: 0.06,
                        tipo: "cnpj_completo",
                        chave: cnpjClean,
                        run: () => consultasApi.cnpj(cnpjClean),
                    }
                case "credCnpj":
                    if (cnpjClean.length !== 14) return null
                    return {
                        kind,
                        label: "Cred Completa Plus (CNPJ)",
                        cost: 2.49,
                        tipo: "cred_cnpj",
                        chave: cnpjClean,
                        run: () => consultasApi.credCompleta(cnpjClean),
                    }
                case "bvCnpj":
                    if (cnpjClean.length !== 14) return null
                    return {
                        kind,
                        label: "Boa Vista (CNPJ)",
                        cost: 3.23,
                        tipo: "boa_vista_cnpj",
                        chave: cnpjClean,
                        run: () => consultasApi.boaVista(cnpjClean),
                    }
                case "quodCnpj":
                    if (cnpjClean.length !== 14) return null
                    return {
                        kind,
                        label: "QUOD (CNPJ)",
                        cost: 4.78,
                        tipo: "quod_cnpj",
                        chave: cnpjClean,
                        run: () => consultasApi.quod(cnpjClean),
                    }
                default:
                    return null
            }
        },
        [placaClean, cpfClean, cnpjClean]
    )

    const openRefreshConsult = useCallback(
        (kind: ConsultKind) => {
            const p = buildPendingForKind(kind)
            if (!p) {
                toast.error("Preencha os dados válidos antes de atualizar.")
                return
            }
            setErrorMsg(null)
            setPending(p)
            setPendingForcar(true)
            setConfirmOpen(true)
        },
        [buildPendingForKind]
    )

    const execPending = async () => {
        if (!pending) return
        const kind = pending.kind
        const useForcar = pendingForcar
        setLoadingKind(kind)
        setConfirmOpen(false)
        setPendingForcar(false)
        setErrorMsg(null)
        try {
            const res = useForcar ? await runConsultWithForcar(pending) : await pending.run()
            setResults((prev) => ({ ...prev, [kind]: res }))
            void fetchBalance()
            if (
                res &&
                typeof res === "object" &&
                "_consulta_from_history" in res &&
                (res as Record<string, unknown>)._consulta_from_history
            ) {
                toast.message("Recuperado do histórico", {
                    description: "Sem nova cobrança na API Full.",
                })
            }
        } catch (e: unknown) {
            let msg = "Falha na consulta. Verifique os dados e o saldo API Full."
            if (e instanceof Error) msg = e.message
            setErrorMsg(msg)
        } finally {
            setLoadingKind(null)
            setPending(null)
        }
    }

    const temResultadoCpfConsulta = useMemo(
        () => CPF_RESULT_KINDS.some((k) => results[k] !== undefined),
        [results]
    )

    const openClienteModal = useCallback(() => {
        const draft = buildClienteDraftFromCpfConsultas(results, cpfClean)
        const str: Record<string, string> = {}
        for (const [k, v] of Object.entries(draft)) {
            str[k] = v === null || v === undefined ? "" : String(v)
        }
        setClienteForm(str)
        setClienteModalOpen(true)
    }, [results, cpfClean])

    const submitCliente = async () => {
        const nome = (clienteForm.nome || "").trim()
        if (!nome) {
            toast.error("Informe o nome do cliente.")
            return
        }
        const payload: Record<string, unknown> = { nome }
        const keys = [
            "documento",
            "email",
            "telefone",
            "cep",
            "endereco",
            "endereco_logradouro",
            "endereco_numero",
            "endereco_complemento",
            "endereco_bairro",
            "endereco_cidade",
            "endereco_uf",
        ] as const
        for (const k of keys) {
            const v = (clienteForm[k] || "").trim()
            if (v) payload[k] = k === "cep" ? onlyDigits(v, 9) : v
        }
        setSavingCliente(true)
        try {
            const criado = (await clientesApi.criar(payload)) as { id?: string }
            toast.success("Cliente cadastrado.", {
                description: criado?.id ? (
                    <Link className="underline font-semibold" to="/clientes">
                        Ir para Clientes
                    </Link>
                ) : undefined,
            })
            setClienteModalOpen(false)
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Não foi possível cadastrar."
            toast.error(msg)
        } finally {
            setSavingCliente(false)
        }
    }

    const ResultPanel = ({ kind, title }: { kind: ConsultKind; title: string }) => {
        const data = results[kind]
        if (data === undefined) return null
        const payload = data as Record<string, unknown>
        const fromHist = Boolean(payload._consulta_from_history)
        const dados = extractDados(payload) ?? payload
        const pdf = findPdfUrl(payload) || findPdfUrl(dados)
        const badgeCls = inferBadgeClass(payload)

        const header = (
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
                <CardTitle className="text-base flex items-center gap-2 flex-wrap min-w-0">
                    <FileText className="w-4 h-4 text-primary shrink-0" />
                    <span className="break-words">{title}</span>
                    {fromHist && (
                        <>
                            <Badge variant="secondary" className="text-[10px] shrink-0">
                                Histórico · sem cobrança
                            </Badge>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 px-2 text-muted-foreground shrink-0"
                                disabled={!!loadingKind}
                                title="Consultar novamente na API (cobrança)"
                                onClick={() => openRefreshConsult(kind)}
                            >
                                <RefreshCw className="w-4 h-4" />
                            </Button>
                        </>
                    )}
                </CardTitle>
                <div className="flex items-center gap-2 shrink-0">
                    {pdf && (
                        <a href={pdf} target="_blank" rel="noopener noreferrer">
                            <Badge variant="outline" className="gap-1 cursor-pointer hover:bg-primary/10">
                                <ExternalLink className="w-3 h-3" /> PDF
                            </Badge>
                        </a>
                    )}
                    <Badge className={badgeCls}>
                        {badgeCls.includes("rose") ? "Atenção" : badgeCls.includes("amber") ? "Score baixo" : "OK"}
                    </Badge>
                </div>
            </CardHeader>
        )

        return (
            <Card className="border-primary/20 shadow-lg overflow-hidden mt-4">
                <div
                    className={`h-1 w-full ${
                        badgeCls.includes("rose") ? "bg-rose-500" : badgeCls.includes("amber") ? "bg-amber-500" : "bg-emerald-500"
                    }`}
                />
                {header}
                <CardContent>
                    {kind === "cnpjCompleto" && <CardCnpj payload={payload} />}
                    {kind === "cpfScore" && <CardCpfScore payload={payload} />}
                    {(kind === "cred" || kind === "bv" || kind === "quod" || kind === "credCnpj" || kind === "bvCnpj" || kind === "quodCnpj") && (
                        <CardBoaVista payload={payload} pdfUrl={pdf} />
                    )}
                    {kind === "fipe" && <CardFipe payload={payload} />}
                    {kind === "roubo" && <CardRoubo payload={payload} />}

                    {/* Dados Detalhados (Garante que nada seja ocultado) */}
                    <div className="mt-6 pt-6 border-t border-border">
                        <p className="text-[10px] uppercase font-black tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                            <FileText className="w-3 h-3" />
                            Dados Detalhados (Retorno Bruto Mapeado)
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 bg-muted/20 p-4 rounded-xl border">
                            {Object.entries(flattenObjectConsultas(dados)).length > 0 ? (
                                Object.entries(flattenObjectConsultas(dados)).map(([k, v]) => {
                                    const displayKey = k.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim();
                                    return (
                                        <div key={k} className="space-y-0.5">
                                            <div className="text-[9px] uppercase font-black text-muted-foreground/60 leading-tight">
                                                {displayKey}
                                            </div>
                                            <div className="text-xs font-bold break-words">{String(v)}</div>
                                        </div>
                                    )
                                })
                            ) : (
                                <div className="col-span-full text-xs text-muted-foreground">Nenhum dado adicional retornado.</div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>
        )
    }

    const isBusy = (k: ConsultKind) => loadingKind === k

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                        Consultas
                    </h1>
                    <p className="text-muted-foreground text-sm flex items-center gap-2 mt-1">
                        <ShieldCheck className="w-4 h-4 text-emerald-500" />
                        Central API Full — placa, CPF, CNPJ e BIN — cobrança no saldo; confirme antes de cada consulta
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-card border rounded-xl shadow-sm">
                        <Wallet className="w-4 h-4 text-emerald-500" />
                        <div className="text-right">
                            <div className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Saldo API</div>
                            <div className="font-black text-xl leading-none">
                                {balanceLoading ? (
                                    <RefreshCw className="w-4 h-4 animate-spin inline" />
                                ) : saldoDisplay !== null ? (
                                    <span
                                        className={
                                            typeof saldoDisplay === "number" && saldoDisplay < 10
                                                ? "text-rose-500"
                                                : "text-emerald-600"
                                        }
                                    >
                                        {typeof saldoDisplay === "number" && saldoDisplay % 1 !== 0
                                            ? fmtReais(saldoDisplay)
                                            : String(saldoDisplay)}
                                    </span>
                                ) : (
                                    <span className="text-muted-foreground text-xs">—</span>
                                )}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => void fetchBalance()}
                            className="p-1 rounded hover:bg-muted transition-colors ml-1"
                            title="Atualizar saldo"
                        >
                            <RefreshCw className="w-3 h-3 text-muted-foreground" />
                        </button>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        className="gap-2 shrink-0"
                        onClick={() => setHistoricoOpen(true)}
                    >
                        <History className="w-4 h-4" />
                        Histórico
                    </Button>
                </div>
            </header>

            {errorMsg && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                </div>
            )}

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full max-w-3xl grid-cols-2 sm:grid-cols-4 h-auto p-1">
                    <TabsTrigger value="veiculo" className="gap-2 py-2">
                        <Car className="w-4 h-4" /> Veículo
                    </TabsTrigger>
                    <TabsTrigger value="cpf" className="gap-2 py-2">
                        <User className="w-4 h-4" /> Crédito (CPF)
                    </TabsTrigger>
                    <TabsTrigger value="cnpj" className="gap-2 py-2">
                        <Building2 className="w-4 h-4" /> Empresa
                    </TabsTrigger>
                    <TabsTrigger value="bin" className="gap-2 py-2">
                        <CreditCard className="w-4 h-4" /> BIN
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="veiculo" className="mt-6 space-y-4">
                    <Card className="border-primary/20 shadow-lg shadow-primary/5 overflow-hidden">
                        <div className="h-1 bg-primary w-full" />
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Search className="w-5 h-5 text-primary" /> Consultas de veículo
                            </CardTitle>
                            <p className="text-sm text-muted-foreground">
                                Informe a placa (Mercosul ou antiga), ex.: ABC1D23 ou ABC1234
                            </p>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Input
                                placeholder="ABC1D23"
                                value={placa}
                                onChange={(e) => setPlaca(normalizePlaca(e.target.value))}
                                className="uppercase font-mono text-lg tracking-widest h-12 max-w-xs"
                                maxLength={7}
                            />
                            <div className="flex flex-wrap gap-3">
                                <Button
                                    type="button"
                                    disabled={placaClean.length < 7 || !!loadingKind}
                                    onClick={() =>
                                        void openConsult({
                                            kind: "fipe",
                                            label: "FIPE",
                                            cost: 0.11,
                                            tipo: "fipe",
                                            chave: placaClean,
                                            run: () => consultasApi.fipe(placaClean),
                                        })
                                    }
                                    className="gap-2"
                                >
                                    {isBusy("fipe") ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                    FIPE — {fmtReais(0.11)}/consulta
                                </Button>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    disabled={placaClean.length < 7 || !!loadingKind}
                                    onClick={() =>
                                        void openConsult({
                                            kind: "roubo",
                                            label: "Histórico Roubo/Furto",
                                            cost: 3.6,
                                            tipo: "roubo",
                                            chave: placaClean,
                                            run: () => consultasApi.historicoRouboFurto(placaClean),
                                        })
                                    }
                                    className="gap-2"
                                >
                                    {isBusy("roubo") ? <Loader2 className="w-4 h-4 animate-spin" /> : <Car className="w-4 h-4" />}
                                    Roubo/Furto — {fmtReais(3.6)}/consulta
                                </Button>
                            </div>
                            <ResultPanel kind="fipe" title="Resultado — FIPE" />
                            <ResultPanel kind="roubo" title="Resultado — Histórico Roubo/Furto" />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="cpf" className="mt-6 space-y-4">
                    <Card className="border-primary/20 shadow-lg shadow-primary/5 overflow-hidden">
                        <div className="h-1 bg-primary w-full" />
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <User className="w-5 h-5 text-primary" /> Crédito pessoal (CPF)
                            </CardTitle>
                            <p className="text-sm text-muted-foreground">Digite o CPF completo</p>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Input
                                placeholder="000.000.000-00"
                                value={formatCpfDisplay(cpf)}
                                onChange={(e) => setCpf(onlyDigits(e.target.value, 11))}
                                className="font-mono text-lg h-12 max-w-xs"
                                maxLength={14}
                            />
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    disabled={cpfClean.length !== 11 || !!loadingKind}
                                    onClick={() =>
                                        void openConsult({
                                            kind: "cpfScore",
                                            label: "Dados + Score + Dívidas",
                                            cost: 2.99,
                                            tipo: "cpf_score",
                                            chave: cpfClean,
                                            run: () => consultasApi.cpfScoreDividas(cpfClean),
                                        })
                                    }
                                >
                                    Score + dívidas — {fmtReais(2.99)}
                                </Button>

                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={cpfClean.length !== 11 || !!loadingKind}
                                    onClick={() =>
                                        void openConsult({
                                            kind: "bv",
                                            label: "Boa Vista Essencial",
                                            cost: 3.23,
                                            tipo: "boa_vista",
                                            chave: cpfClean,
                                            run: () => consultasApi.boaVista(cpfClean),
                                        })
                                    }
                                >
                                    Boa Vista — {fmtReais(3.23)}
                                </Button>

                            </div>
                            {temResultadoCpfConsulta && cpfClean.length === 11 && (
                                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                    <p className="text-sm text-muted-foreground">
                                        Cadastre o cliente no CRM com os dados retornados pela API (nome, contato e endereço quando
                                        disponíveis).
                                    </p>
                                    <Button type="button" variant="default" className="gap-2 shrink-0" onClick={openClienteModal}>
                                        <UserPlus className="w-4 h-4" />
                                        Cadastrar cliente
                                    </Button>
                                </div>
                            )}
                            <ResultPanel kind="cpfScore" title="Resultado — Score e dívidas" />
                            <ResultPanel kind="bv" title="Resultado — Boa Vista" />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="cnpj" className="mt-6 space-y-4">
                    <Card className="border-primary/20 shadow-lg shadow-primary/5 overflow-hidden">
                        <div className="h-1 bg-primary w-full" />
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Building2 className="w-5 h-5 text-primary" /> Empresa (CNPJ)
                            </CardTitle>
                            <p className="text-sm text-muted-foreground">Digite o CNPJ completo</p>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Input
                                placeholder="00.000.000/0000-00"
                                value={formatCnpjDisplay(cnpj)}
                                onChange={(e) => setCnpj(onlyDigits(e.target.value, 14))}
                                className="font-mono text-lg h-12 max-w-sm"
                                maxLength={18}
                            />
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    disabled={cnpjClean.length !== 14 || !!loadingKind}
                                    onClick={() =>
                                        void openConsult({
                                            kind: "cnpjCompleto",
                                            label: "CNPJ Completo",
                                            cost: 0.06,
                                            tipo: "cnpj_completo",
                                            chave: cnpjClean,
                                            run: () => consultasApi.cnpj(cnpjClean),
                                        })
                                    }
                                >
                                    CNPJ completo — {fmtReais(0.06)}
                                </Button>

                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={cnpjClean.length !== 14 || !!loadingKind}
                                    onClick={() =>
                                        void openConsult({
                                            kind: "bvCnpj",
                                            label: "Boa Vista (CNPJ)",
                                            cost: 3.23,
                                            tipo: "boa_vista_cnpj",
                                            chave: cnpjClean,
                                            run: () => consultasApi.boaVista(cnpjClean),
                                        })
                                    }
                                >
                                    Boa Vista — {fmtReais(3.23)}
                                </Button>

                            </div>
                            <ResultPanel kind="cnpjCompleto" title="Resultado — CNPJ completo" />
                            <ResultPanel kind="bvCnpj" title="Resultado — Boa Vista (CNPJ)" />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="bin" className="mt-6">
                    <BinNacionalPanel
                        embedded
                        externalBinReplay={binReplay}
                        onExternalBinReplayConsumed={() => setBinReplay(null)}
                    />
                </TabsContent>
            </Tabs>

            <Modal
                isOpen={historicoOpen}
                onClose={() => setHistoricoOpen(false)}
                title="Histórico de consultas"
                alignTop
                contentClassName="max-w-lg w-full max-h-[min(520px,85vh)] flex flex-col"
            >
                <div className="flex flex-col gap-3 min-h-0 flex-1">
                    <p className="text-xs text-muted-foreground">
                        Ao repetir a mesma consulta (mesmo tipo e mesmo dado), o sistema reutiliza o resultado salvo e{" "}
                        <strong>não cobra de novo</strong> na API Full. Abra um registro para ver o mesmo painel da consulta.
                    </p>
                    <div className="overflow-y-auto flex-1 rounded-lg border divide-y max-h-[min(420px,60vh)]">
                        {historicoLoading ? (
                            <div className="p-8 flex justify-center text-muted-foreground">
                                <Loader2 className="w-6 h-6 animate-spin" />
                            </div>
                        ) : historicoRows.length === 0 ? (
                            <div className="p-8 text-center text-sm text-muted-foreground">
                                Nenhuma consulta gravada ainda.
                            </div>
                        ) : (
                            historicoRows.map((row) => (
                                <button
                                    key={row.id}
                                    type="button"
                                    onClick={() => void aplicarHistorico(row)}
                                    className="w-full text-left px-4 py-3 hover:bg-muted/80 transition-colors flex flex-col gap-1"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-bold text-sm">
                                            {TIPO_LABEL[row.tipo] ?? row.tipo}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground shrink-0">
                                            {fmtDateTimeShort(row.created_at)}
                                        </span>
                                    </div>
                                    <div className="font-mono text-xs text-primary break-all">
                                        {formatChaveHistorico(row.tipo, row.chave_normalizada)}
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={clienteModalOpen}
                onClose={() => setClienteModalOpen(false)}
                title="Cadastrar cliente (dados da consulta)"
            >
                <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
                    <p className="text-xs text-muted-foreground">
                        Revise e edite os campos antes de salvar. Campos vazios não são enviados (exceto nome e CPF).
                    </p>
                    <div className="grid gap-2">
                        <label className="text-[10px] uppercase font-bold text-muted-foreground">Nome *</label>
                        <Input
                            value={clienteForm.nome || ""}
                            onChange={(e) => setClienteForm((p) => ({ ...p, nome: e.target.value }))}
                            placeholder="Nome completo"
                        />
                    </div>
                    <div className="grid gap-2">
                        <label className="text-[10px] uppercase font-bold text-muted-foreground">CPF</label>
                        <Input className="font-mono" readOnly value={formatCpfDisplay(clienteForm.documento || "")} />
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                        <div className="grid gap-2">
                            <label className="text-[10px] uppercase font-bold text-muted-foreground">E-mail</label>
                            <Input
                                type="email"
                                value={clienteForm.email || ""}
                                onChange={(e) => setClienteForm((p) => ({ ...p, email: e.target.value }))}
                            />
                        </div>
                        <div className="grid gap-2">
                            <label className="text-[10px] uppercase font-bold text-muted-foreground">Telefone</label>
                            <Input
                                value={clienteForm.telefone || ""}
                                onChange={(e) => setClienteForm((p) => ({ ...p, telefone: e.target.value }))}
                            />
                        </div>
                    </div>
                    <div className="grid gap-2">
                        <label className="text-[10px] uppercase font-bold text-muted-foreground">CEP</label>
                        <Input
                            value={clienteForm.cep || ""}
                            onChange={(e) =>
                                setClienteForm((p) => ({ ...p, cep: onlyDigits(e.target.value, 9) }))
                            }
                            maxLength={9}
                            className="font-mono"
                        />
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                        <div className="grid gap-2 sm:col-span-2">
                            <label className="text-[10px] uppercase font-bold text-muted-foreground">Logradouro</label>
                            <Input
                                value={clienteForm.endereco_logradouro || ""}
                                onChange={(e) => setClienteForm((p) => ({ ...p, endereco_logradouro: e.target.value }))}
                            />
                        </div>
                        <div className="grid gap-2">
                            <label className="text-[10px] uppercase font-bold text-muted-foreground">Número</label>
                            <Input
                                value={clienteForm.endereco_numero || ""}
                                onChange={(e) => setClienteForm((p) => ({ ...p, endereco_numero: e.target.value }))}
                            />
                        </div>
                        <div className="grid gap-2">
                            <label className="text-[10px] uppercase font-bold text-muted-foreground">Complemento</label>
                            <Input
                                value={clienteForm.endereco_complemento || ""}
                                onChange={(e) => setClienteForm((p) => ({ ...p, endereco_complemento: e.target.value }))}
                            />
                        </div>
                        <div className="grid gap-2">
                            <label className="text-[10px] uppercase font-bold text-muted-foreground">Bairro</label>
                            <Input
                                value={clienteForm.endereco_bairro || ""}
                                onChange={(e) => setClienteForm((p) => ({ ...p, endereco_bairro: e.target.value }))}
                            />
                        </div>
                        <div className="grid gap-2">
                            <label className="text-[10px] uppercase font-bold text-muted-foreground">Cidade</label>
                            <Input
                                value={clienteForm.endereco_cidade || ""}
                                onChange={(e) => setClienteForm((p) => ({ ...p, endereco_cidade: e.target.value }))}
                            />
                        </div>
                        <div className="grid gap-2">
                            <label className="text-[10px] uppercase font-bold text-muted-foreground">UF</label>
                            <Input
                                value={clienteForm.endereco_uf || ""}
                                maxLength={2}
                                className="uppercase"
                                onChange={(e) =>
                                    setClienteForm((p) => ({
                                        ...p,
                                        endereco_uf: e.target.value.toUpperCase().replace(/[^A-Za-z]/g, "").slice(0, 2),
                                    }))
                                }
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2 border-t">
                        <Button type="button" variant="outline" onClick={() => setClienteModalOpen(false)}>
                            Cancelar
                        </Button>
                        <Button type="button" onClick={() => void submitCliente()} disabled={savingCliente}>
                            {savingCliente ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                            Salvar cliente
                        </Button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={historyCheck.open} onClose={closeHistoryCheckModal} title="Consulta já realizada">
                <div className="space-y-4">
                    <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                        <Clock className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-semibold text-sm">Já existe uma consulta no histórico</p>
                            <p className="text-sm text-muted-foreground mt-1">
                                {historyCheck.pending?.label} · salva em {fmtDateTime(historyCheck.created_at)}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Usar o resultado salvo não gera cobrança.
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 pt-1">
                        <Button className="flex-1" type="button" onClick={() => void useFromHistory()} disabled={!!loadingKind}>
                            {loadingKind ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                            Usar resultado salvo
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            className="flex-1 text-rose-600 border-rose-500/40 hover:bg-rose-500/10"
                            onClick={forceNewConsult}
                            disabled={!!loadingKind}
                        >
                            Consultar novamente (cobrança)
                        </Button>
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={confirmOpen}
                onClose={() => {
                    setConfirmOpen(false)
                    setPendingForcar(false)
                    setPending(null)
                }}
                title="Confirmar consulta"
            >
                <div className="space-y-4">
                    <div className="flex items-start gap-2 text-sm">
                        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                        <p>
                            Esta consulta <span className="font-black">{pending?.label}</span> custa{" "}
                            <span className="font-black text-primary">{pending ? fmtReais(pending.cost) : ""}</span> do seu saldo API
                            Full.
                        </p>
                    </div>
                    <p className="text-sm text-muted-foreground">Deseja continuar?</p>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
                            Cancelar
                        </Button>
                        <Button type="button" onClick={() => void execPending()}>
                            Confirmar e consultar
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    )
}
