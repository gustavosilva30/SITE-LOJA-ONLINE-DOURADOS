import React, { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Search, Package, CheckCircle2, AlertCircle } from 'lucide-react'
import { buscaPartNumberMaster, type BuscaPartNumberMasterOk } from '@/lib/pecasMasterBuscaApi'
import { collectPecaCatalogImageCandidates } from '@/lib/pecaCatalogImageUrls'
import { PecaMasterImageGallery } from '@/components/PecaMasterImageGallery'

function fmtBrl(n: unknown): string {
    if (n === null || n === undefined || n === '') return '—'
    const x = typeof n === 'number' ? n : parseFloat(String(n))
    if (Number.isNaN(x)) return '—'
    return x.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function uniqCompatValues(rows: Record<string, unknown>[], key: string): string {
    const s = new Set<string>()
    for (const r of rows) {
        const v = r[key]
        if (v != null && String(v).trim() !== '') s.add(String(v).trim())
    }
    return [...s].join(', ') || '—'
}

function PecaCard({
    peca,
    compatibilidades,
    title,
}: {
    peca: Record<string, unknown>
    compatibilidades: Record<string, unknown>[]
    title: string
}) {
    const fotoUrls = collectPecaCatalogImageCandidates({
        imagem_url: typeof peca.imagem_url === 'string' ? peca.imagem_url : null,
        imagem_urls: peca.imagem_urls,
    })
    const versoesResumo = uniqCompatValues(compatibilidades, 'versao')
    const familiasResumo = uniqCompatValues(compatibilidades, 'familia')
    const motoresCompat = uniqCompatValues(compatibilidades, 'motorizacao')

    const flags: string[] = []
    if (peca.lado_esquerdo === true) flags.push('LH')
    if (peca.lado_direito === true) flags.push('RH')
    if (peca.liso_para_pintura === true) flags.push('Pintura')
    if (peca.com_furo_milha === true) flags.push('Milha')
    if (peca.item_seguranca === true) flags.push('Segurança')

    const infoAd = peca.informacoes_adicionais
    const infoAdStr =
        infoAd != null
            ? typeof infoAd === 'string'
                ? infoAd
                : JSON.stringify(infoAd, null, 2)
            : ''

    return (
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex items-center gap-2 text-sm font-black text-primary">
                <Package className="w-4 h-4" />
                {title}
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="w-full sm:max-w-[min(100%,280px)] shrink-0 rounded-lg border bg-background overflow-hidden p-2">
                    {fotoUrls.length > 0 ? (
                        <PecaMasterImageGallery urls={fotoUrls} layout="hero" mainImgClassName="max-h-48 object-contain" maxThumbs={40} />
                    ) : (
                        <div className="flex h-36 items-center justify-center">
                            <span className="text-[10px] text-muted-foreground">Sem imagem</span>
                        </div>
                    )}
                </div>
                <div className="flex-1 space-y-2 text-sm min-w-0">
                    <div>
                        <span className="text-[10px] font-bold uppercase text-muted-foreground">Nome</span>
                        <p className="font-semibold break-words">{String(peca.nome ?? '—')}</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2 text-xs">
                        <div>
                            <span className="text-muted-foreground">Part number</span>
                            <p className="font-mono">{String(peca.part_number ?? '—')}</p>
                        </div>
                        <div>
                            <span className="text-muted-foreground">Variação</span>
                            <p className="break-words">{String(peca.variacao ?? '—')}</p>
                        </div>
                        <div>
                            <span className="text-muted-foreground">Marca / modelo (peça)</span>
                            <p className="break-words">
                                {String(peca.marca_veiculo ?? '—')}
                                {peca.modelo_veiculo != null && String(peca.modelo_veiculo).trim() !== ''
                                    ? ` · ${String(peca.modelo_veiculo)}`
                                    : ''}
                            </p>
                        </div>
                        <div>
                            <span className="text-muted-foreground">Anos (peça)</span>
                            <p>
                                {peca.ano_inicio != null && peca.ano_fim != null
                                    ? `${peca.ano_inicio} – ${peca.ano_fim}`
                                    : '—'}
                            </p>
                        </div>
                        <div>
                            <span className="text-muted-foreground">Motorização (peça)</span>
                            <p>{String(peca.motorizacao ?? '—')}</p>
                        </div>
                        <div>
                            <span className="text-muted-foreground">Família/geração (peça)</span>
                            <p>
                                {peca.familia != null && String(peca.familia).trim() !== ''
                                    ? String(peca.familia)
                                    : '—'}
                            </p>
                        </div>
                        <div>
                            <span className="text-muted-foreground">Preço padrão / Custo padrão</span>
                            <p>
                                {fmtBrl(peca.preco_padrao)} <span className="text-muted-foreground">/</span>{' '}
                                {fmtBrl(peca.custo_padrao)}
                            </p>
                        </div>
                        <div className="sm:col-span-2">
                            <span className="text-muted-foreground">Versões / famílias (compat.)</span>
                            <p className="break-words">
                                <span className="font-medium text-foreground/90">Versão:</span> {versoesResumo}{' '}
                                <span className="text-muted-foreground">·</span>{' '}
                                <span className="font-medium text-foreground/90">Família/geração:</span> {familiasResumo}
                            </p>
                            {motoresCompat !== '—' && (
                                <p className="mt-0.5">
                                    <span className="font-medium text-foreground/90">Motor (compat.):</span> {motoresCompat}
                                </p>
                            )}
                        </div>
                        {peca.categoria_id != null && String(peca.categoria_id).trim() !== '' && (
                            <div className="sm:col-span-2">
                                <span className="text-muted-foreground">Categoria (id)</span>
                                <p className="font-mono text-[11px] break-all">{String(peca.categoria_id)}</p>
                            </div>
                        )}
                        {flags.length > 0 && (
                            <div className="sm:col-span-2 flex flex-wrap gap-1">
                                {flags.map((f) => (
                                    <span
                                        key={f}
                                        className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-primary/15 text-primary"
                                    >
                                        {f}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                    <div>
                        <span className="text-[10px] font-bold uppercase text-muted-foreground">Descrição</span>
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words max-h-32 overflow-y-auto mt-0.5">
                            {peca.descricao != null && String(peca.descricao).trim() !== ''
                                ? String(peca.descricao)
                                : '—'}
                        </p>
                    </div>
                    {infoAdStr.trim() !== '' && (
                        <details className="text-xs border-t border-border pt-2">
                            <summary className="cursor-pointer font-bold text-muted-foreground">Informações adicionais</summary>
                            <pre className="mt-2 max-h-36 overflow-auto rounded bg-background/80 p-2 text-[10px] leading-relaxed border">
                                {infoAdStr.length > 4000 ? `${infoAdStr.slice(0, 4000)}…` : infoAdStr}
                            </pre>
                        </details>
                    )}
                </div>
            </div>
            {compatibilidades.length > 0 && (
                <div className="text-xs border-t border-border pt-3 space-y-2">
                    <span className="font-bold text-muted-foreground">Compatibilidades ({compatibilidades.length})</span>
                    <div className="rounded-lg border bg-background/50 overflow-hidden shadow-inner">
                        <div className="max-h-[500px] overflow-y-auto divide-y divide-border/60">
                            {compatibilidades.map((c, i) => (
                                <div key={i} className="px-2 py-1.5 grid grid-cols-1 gap-0.5 text-[11px]">
                                    <div className="font-medium text-foreground">
                                        {String(c.marca ?? '—')} · {String(c.modelo ?? '—')}
                                        {c.ano != null && String(c.ano).trim() !== '' ? ` · ${String(c.ano)}` : ''}
                                    </div>
                                    <div className="text-muted-foreground grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
                                        {c.versao != null && String(c.versao).trim() !== '' && (
                                            <span className="col-span-full">
                                                <span className="font-semibold text-foreground/80">Versão:</span>{' '}
                                                <span className="text-foreground">{String(c.versao)}</span>
                                            </span>
                                        )}
                                        {c.familia != null && String(c.familia).trim() !== '' && (
                                            <span>
                                                <span className="font-semibold text-foreground/80">Família:</span>{' '}
                                                <span className="text-foreground">{String(c.familia)}</span>
                                            </span>
                                        )}
                                        {c.motorizacao != null && String(c.motorizacao).trim() !== '' && (
                                            <span>
                                                <span className="font-semibold text-foreground/80">Motor:</span>{' '}
                                                <span className="text-foreground">{String(c.motorizacao)}</span>
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export type PartNumberMasterBuscaDialogProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    initialPartNumber: string
    /** Chamado quando há dados de peça para copiar ao produto de estoque */
    onApplyToProduto?: (peca: Record<string, unknown>) => void
}

export function PartNumberMasterBuscaDialog({
    open,
    onOpenChange,
    initialPartNumber,
    onApplyToProduto,
}: PartNumberMasterBuscaDialogProps) {
    const [pn, setPn] = useState(initialPartNumber)
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState<BuscaPartNumberMasterOk | null>(null)
    const [fail, setFail] = useState<string | null>(null)

    const runWithQuery = async (qRaw: string) => {
        const q = String(qRaw).trim()
        if (q.length < 2) {
            setFail('Informe um part number com pelo menos 2 caracteres.')
            return
        }
        setLoading(true)
        setFail(null)
        setResult(null)
        try {
            const r = await buscaPartNumberMaster(q)
            if (r.ok === false) {
                setFail(r.error + (r.n8n_raw_text ? `\n\n${r.n8n_raw_text.slice(0, 500)}` : ''))
                return
            }
            setResult(r)
        } catch (e) {
            setFail(e instanceof Error ? e.message : String(e))
        } finally {
            setLoading(false)
        }
    }

    const run = () => void runWithQuery(pn)

    useEffect(() => {
        if (!open) return
        setPn(initialPartNumber)
        setResult(null)
        setFail(null)
        const q = String(initialPartNumber).trim()
        if (q.length < 2) return
        let cancelled = false
        setLoading(true)
        setFail(null)
        setResult(null)
        void buscaPartNumberMaster(q)
            .then((r) => {
                if (cancelled) return
                if (r.ok === false) {
                    setFail(r.error + (r.n8n_raw_text ? `\n\n${r.n8n_raw_text.slice(0, 500)}` : ''))
                    return
                }
                setResult(r)
            })
            .catch((e) => {
                if (!cancelled) setFail(e instanceof Error ? e.message : String(e))
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [open, initialPartNumber])

    const pecaParaExibir =
        result?.source === 'database'
            ? { peca: result.peca, compat: result.compatibilidades, title: 'Dados do catálogo master (já cadastrado)' }
            : result?.source === 'n8n' && result.peca
              ? { peca: result.peca, compat: result.compatibilidades ?? [], title: 'Dados retornados pelo n8n (visualização)' }
              : null

    const n8nJson =
        result?.source === 'n8n' && result.n8n_response !== undefined
            ? JSON.stringify(result.n8n_response, null, 2)
            : null

    return (
        <Modal
            title="Busca por Part Number (catálogo master)"
            isOpen={open}
            onClose={() => onOpenChange(false)}
            className="max-w-5xl max-h-[90vh] overflow-y-auto"
        >
            <div className="space-y-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                    Consulta primeiro o cadastro master. Se não existir, o sistema chama o fluxo n8n e exibe o resultado
                    para visualização (sem gravar no catálogo).
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex-1 space-y-1">
                        <Label className="text-xs">Part number</Label>
                        <Input
                            value={pn}
                            onChange={(e) => setPn(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault()
                                    void run()
                                }
                            }}
                            placeholder="Ex.: 5U0903025H"
                            className="font-mono"
                        />
                    </div>
                    <div className="flex items-end">
                        <Button type="button" className="gap-2 w-full sm:w-auto" disabled={loading} onClick={() => void run()}>
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                            Buscar
                        </Button>
                    </div>
                </div>

                {fail && (
                    <div className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <pre className="whitespace-pre-wrap break-words text-xs font-sans">{fail}</pre>
                    </div>
                )}

                {loading && (
                    <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground py-6 text-center px-2">
                        <div className="flex items-center gap-2 justify-center">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Consultando catálogo e n8n…
                        </div>
                    </div>
                )}

                {!loading && result?.source === 'n8n' && result.empty && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
                        {result.message ?? 'Nenhum dado retornado pelo n8n.'}
                    </div>
                )}

                {!loading && result?.source === 'n8n' && !result.empty && !result.peca && (result.message || result.error) && (
                    <div className="space-y-2 rounded-lg border p-4 text-sm">
                        {result.message && <p className="text-amber-700 dark:text-amber-400">{result.message}</p>}
                        {result.error && <p className="text-destructive text-xs">{result.error}</p>}
                        {n8nJson && (
                            <details className="text-xs">
                                <summary className="cursor-pointer font-bold">Resposta bruta (JSON)</summary>
                                <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted p-2 text-[10px] leading-relaxed">
                                    {n8nJson}
                                </pre>
                            </details>
                        )}
                    </div>
                )}

                {!loading && pecaParaExibir && (
                    <>
                        <PecaCard peca={pecaParaExibir.peca} compatibilidades={pecaParaExibir.compat} title={pecaParaExibir.title} />
                        {onApplyToProduto && (
                            <Button
                                type="button"
                                className="w-full"
                                onClick={() => {
                                    onApplyToProduto(pecaParaExibir.peca)
                                    onOpenChange(false)
                                }}
                            >
                                Aplicar dados ao produto de estoque
                            </Button>
                        )}
                    </>
                )}

                {!loading && result?.source === 'n8n' && n8nJson && pecaParaExibir && (
                    <details className="text-xs">
                        <summary className="cursor-pointer font-bold text-muted-foreground">Ver JSON retornado pelo n8n</summary>
                        <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 text-[10px] leading-relaxed">{n8nJson}</pre>
                    </details>
                )}
            </div>
        </Modal>
    )
}
