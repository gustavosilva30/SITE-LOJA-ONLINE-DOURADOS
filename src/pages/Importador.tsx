import { useState, useCallback, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Upload, FileJson, FileSpreadsheet, ArrowRight, Check, AlertCircle, Database, Package, Users, Wallet, Tags, FileCode, Clipboard, Info, Car, Receipt, Building2, ShoppingCart, BarChart2, FileText, Trash2, ChevronDown, ChevronRight, Sparkles, ClipboardList, Pencil, Camera, MessageCircle, X, Save, Play, Settings, CheckCircle, HelpCircle, Download, Hash } from "lucide-react"
import { api, estoqueApi, clientesApi, financeiroApi, localizacoesApi, sucatasApi, whatsappApi, catalogoApi, compraNotasEntradaApi, configuracoesApi, fiscalApi } from "@/lib/api"
import { useProdutosCache } from "@/store/produtosCache"
import { normalizeProdutoImagens, normalizeUrlForMatch } from "@/lib/imagemUrls"
import { normalizeBrazilianPhone } from "@/lib/format"
import {
    emptyMirrorStats,
    mirrorEstoquePayload,
    mirrorSucataPayload,
    type MirrorImportStats,
} from "@/lib/mirrorImportImages"
import { cn } from "@/lib/utils"
import { getAuthToken } from "@/lib/auth"

// ─── NF-e Types ──────────────────────────────────────────────────────────────
interface NFeItem {
    codigo: string
    descricao: string
    quantidade: number
    unidade: string
    valorUnitario: number
    valorTotal: number
    ncm: string
    cfop: string
}

interface NFeData {
    numero: string
    serie: string
    dataEmissao: string
    chaveAcesso: string
    naturezaOperacao: string
    tipoNF: 'entrada' | 'saida'
    emitente: { nome: string; cnpj: string }
    destinatario: { nome: string; documento: string }
    itens: NFeItem[]
    totalNF: number
    valorDesconto: number
    valorFrete: number
    rawXml?: string
    isPdf?: boolean
    pdfFile?: File
    pdfUrl?: string
    parsedWithLowConfidence?: boolean
}

interface NFeActions {
    salvar_documento: boolean
    criar_financeiro: boolean
    criar_venda: boolean
    atualizar_estoque: boolean
}

// ─── NF-e XML Parser ─────────────────────────────────────────────────────────
function parseNFeXML(xmlText: string): NFeData | null {
    try {
        const parser = new DOMParser()
        const doc = parser.parseFromString(xmlText, 'text/xml')
        const g = (parent: Element | Document, tag: string) =>
            parent.getElementsByTagName(tag)[0]?.textContent?.trim() || ''

        const infNFe = doc.getElementsByTagName('infNFe')[0]
        if (!infNFe) return null

        const chaveAcesso = (infNFe.getAttribute('Id') || '').replace('NFe', '')
        const ide = doc.getElementsByTagName('ide')[0]
        const emit = doc.getElementsByTagName('emit')[0]
        const dest = doc.getElementsByTagName('dest')[0]
        const total = doc.getElementsByTagName('ICMSTot')[0]
        const detEls = doc.getElementsByTagName('det')

        const itens: NFeItem[] = []
        for (let i = 0; i < detEls.length; i++) {
            const det = detEls[i]
            const prod = det.getElementsByTagName('prod')[0]
            if (!prod) continue
            itens.push({
                codigo: g(prod, 'cProd'),
                descricao: g(prod, 'xProd'),
                quantidade: parseFloat(g(prod, 'qCom')) || 0,
                unidade: g(prod, 'uCom'),
                valorUnitario: parseFloat(g(prod, 'vUnCom')) || 0,
                valorTotal: parseFloat(g(prod, 'vProd')) || 0,
                ncm: g(prod, 'NCM'),
                cfop: g(prod, 'CFOP'),
            })
        }

        const dhEmi = g(ide, 'dhEmi') || g(ide, 'dEmi')
        const dataEmissao = dhEmi ? dhEmi.split('T')[0] : new Date().toISOString().split('T')[0]

        return {
            numero: g(ide, 'nNF'),
            serie: g(ide, 'serie'),
            dataEmissao,
            chaveAcesso,
            naturezaOperacao: g(ide, 'natOp'),
            tipoNF: g(ide, 'tpNF') === '0' ? 'entrada' : 'saida',
            emitente: { nome: g(emit, 'xNome'), cnpj: g(emit, 'CNPJ') },
            destinatario: {
                nome: g(dest, 'xNome'),
                documento: g(dest, 'CNPJ') || g(dest, 'CPF')
            },
            itens,
            totalNF: parseFloat(g(total, 'vNF')) || parseFloat(doc.getElementsByTagName('vNF')[0]?.textContent || '') || 0,
            valorDesconto: parseFloat(g(total, 'vDesc')) || parseFloat(doc.getElementsByTagName('vDesc')[0]?.textContent || '') || 0,
            valorFrete: parseFloat(g(total, 'vFrete')) || parseFloat(doc.getElementsByTagName('vFrete')[0]?.textContent || '') || 0,
            rawXml: xmlText,
        }
    } catch { return null }
}

// ─── NF-e PDF Text Parser ──────────────────────────────────────────────────
function parseNFePDFText(text: string, file: File, companyCnpj?: string): NFeData | null {
    try {
        const cleanText = text.replace(/[ \t]+/g, ' ').replace(/[\r\n]+/g, '\n');

        // Descarta o canhoto de recebimento do topo da nota procurando o termo oficial de encerramento dele
        let workingText = cleanText;
        const receiptEndPos = cleanText.search(/identifica[cç][aã]o\s+e\s+assinatura\s+do\s+recebedor/i);
        if (receiptEndPos !== -1) {
            workingText = cleanText.substring(receiptEndPos + 38);
        }

        // Chave de acesso: Tenta achar espaçada (11 grupos de 4 dígitos) ou tudo junto (44 dígitos)
        let chaveAcesso = '';
        const keyMatchSpaced = cleanText.match(/\b\d{4}\s\d{4}\s\d{4}\s\d{4}\s\d{4}\s\d{4}\s\d{4}\s\d{4}\s\d{4}\s\d{4}\s\d{4}\b/);
        if (keyMatchSpaced) {
            chaveAcesso = keyMatchSpaced[0].replace(/\s/g, '');
        } else {
            const keyMatchJunta = cleanText.match(/\b\d{44}\b/);
            if (keyMatchJunta) {
                chaveAcesso = keyMatchJunta[0];
            }
        }

        // Se encontrou a chave, extrai os dados corretos garantidos por ela (Padrão SEFAZ)
        let numero = '';
        let serie = '1';
        let emitCnpj = '';

        if (chaveAcesso && chaveAcesso.length === 44) {
            emitCnpj = chaveAcesso.substring(6, 20);
            serie = chaveAcesso.substring(22, 25).replace(/^0+/, '') || '1';
            numero = chaveAcesso.substring(25, 34).replace(/^0+/, '');
        }

        // Fallback de número caso não tenha chave de acesso
        if (!numero) {
            const numRegexes = [
                /N[ºo°\.]\s*([0-9\.\-]{1,15})/i,
                /NÚMERO\s*\n?\s*([0-9\.\-]+)/i,
                /nf-e\s+n?[º°]?\s*([0-9\.\-]+)/i
            ];
            for (const regex of numRegexes) {
                const m = workingText.match(regex);
                if (m) {
                    numero = m[1].replace(/\D/g, '').replace(/^0+/, '');
                    break;
                }
            }
        }

        // Fallback de série caso não tenha chave
        if (serie === '1') {
            const serieMatch = workingText.match(/(?:s[eé]rie\s*:\s*|s[eé]rie\s*)(\d+)/i);
            if (serieMatch) {
                serie = serieMatch[1].replace(/^0+/, '') || '1';
            }
        }

        let totalNF = 0;
        const totalNotaMatch = workingText.match(/valor\s*total\s*da\s*nota[^\d]*([\d\.,]+)/i);
        if (totalNotaMatch) {
            totalNF = parseFloat(totalNotaMatch[1].replace(/\./g, '').replace(',', '.')) || 0;
        } else {
            const valMatch = workingText.match(/(?:total\s*da\s*nota|vlr\s*total|r\$\s*)([\d\.,]+)/i);
            if (valMatch) {
                totalNF = parseFloat(valMatch[1].replace(/\./g, '').replace(',', '.')) || 0;
            }
        }

        let dataEmissao = new Date().toISOString().split('T')[0];
        const dataMatch = workingText.match(/(?:emiss[aã]o|data|dt\s*emi)[^\d]*(\d{2})[\/\-](\d{2})[\/\-](\d{4})/i);
        if (dataMatch) {
            dataEmissao = `${dataMatch[3]}-${dataMatch[2]}-${dataMatch[1]}`;
        } else if (chaveAcesso && chaveAcesso.length === 44) {
            const aamm = chaveAcesso.substring(2, 6);
            const yy = aamm.substring(0, 2);
            const mm = aamm.substring(2, 4);
            const mNum = parseInt(mm, 10);
            if (mNum >= 1 && mNum <= 12) {
                dataEmissao = `20${yy}-${mm}-01`;
            }
        }

        let emitNome = 'Emitente Importado';
        const first500 = workingText.substring(0, 500);
        const uppercaseMatches = first500.match(/[A-ZÀ-Ý0-9][A-ZÀ-Ý0-9\s\-\.,\/&]{5,79}[A-ZÀ-Ý0-9]/g) || [];
        let bestEmit = '';
        for (const match of uppercaseMatches) {
            const trimmed = match.trim();
            const upperVal = trimmed.toUpperCase();
            if (
                upperVal === 'DANFE' ||
                upperVal === 'NOTA FISCAL' ||
                upperVal === 'NF-E' ||
                upperVal.includes('DANFE') ||
                upperVal.includes('NOTA FISCAL') ||
                upperVal.includes('NF-E') ||
                upperVal.includes('IDENTIFICA') ||
                upperVal.includes('EMITENTE') ||
                upperVal.includes('RECEBEMOS') ||
                upperVal.includes('CHAVE') ||
                upperVal.includes('ACESSO') ||
                upperVal.includes('FISCO') ||
                upperVal.includes('FOLHA') ||
                upperVal.includes('ESTADUAL') ||
                upperVal.includes('ENTRADA') ||
                upperVal.includes('SAIDA') ||
                upperVal.includes('SAÍDA') ||
                upperVal.includes('EMISS') ||
                upperVal.includes('DATA') ||
                upperVal.includes('VALOR') ||
                upperVal.includes('PRODUTO') ||
                upperVal.includes('REMETENTE') ||
                upperVal.includes('DESTINAT') ||
                (trimmed.match(/\d/g) || []).length > 2
            ) {
                continue;
            }
            bestEmit = trimmed;
            break;
        }
        if (bestEmit) {
            emitNome = bestEmit;
        }

        let destNome = 'Destinatário Importado';
        const destIndex = workingText.search(/destinat[aá]rio|remetente/i);
        if (destIndex !== -1) {
            const afterDest = workingText.substring(destIndex).substring(0, 400);
            const commonLabels = [
                'cnpj', 'cpf', 'inscricao', 'inscricão', 'inscrição', 'estadual', 'ie', 'rg', 'fone', 'telefone',
                'endereco', 'endereço', 'bairro', 'cep', 'data', 'hora', 'emissao', 'emissão', 'saida', 'saída',
                'municipio', 'uf', 'destinatario', 'destinatário', 'remetente', 'cliente', 'razao', 'razão', 'social',
                'valor', 'total', 'nota', 'fisco', 'chave', 'acesso', 'danfe'
            ];
            const candidates = afterDest.match(/[A-ZÀ-Ýa-zà-ý][A-ZÀ-Ýa-zà-ý\s\-\.,\/&]{5,78}[A-ZÀ-Ýa-zà-ý]/g) || [];
            for (const cand of candidates) {
                const cleanedCand = cand.trim().replace(/\s+/g, ' ');
                const upperCand = cleanedCand.toUpperCase();
                if (
                    upperCand.includes('DESTINAT') ||
                    upperCand.includes('REMETENTE') ||
                    upperCand.includes('CNPJ') ||
                    upperCand.includes('CPF') ||
                    upperCand.includes('ENDERE') ||
                    upperCand.includes('BAIRRO') ||
                    upperCand.includes('MUNICIPIO') ||
                    upperCand.includes('TELEFONE') ||
                    upperCand.includes('INSCRIC') ||
                    upperCand.includes('ESTADUAL') ||
                    upperCand.includes('SAIDA') ||
                    upperCand.includes('SAÍDA') ||
                    upperCand.includes('EMISS') ||
                    upperCand.includes('DATA') ||
                    (cleanedCand.match(/\d/g) || []).length > 2
                ) {
                    continue;
                }
                destNome = cleanedCand;
                break;
            }
        }
        if (destNome === 'Destinatário Importado' && emitNome !== 'Emitente Importado') {
            destNome = `${emitNome} (dest. não identificado)`;
        }

        // Extract CNPJ and CPF positions
        let destDocumento = '';

        const allCnpjs = [...workingText.matchAll(/\b(\d{2})\.?(\d{3})\.?(\d{3})\/?(\d{4})-?(\d{2})\b/g)];
        const allCpfs = [...workingText.matchAll(/\b(\d{3})\.?(\d{3})\.?(\d{3})-?(\d{2})\b/g)];

        if (!emitCnpj) {
            for (const match of allCnpjs) {
                const index = match.index || 0;
                const value = match[0].replace(/\D/g, '');
                if (destIndex === -1 || index < destIndex) {
                    if (!emitCnpj) emitCnpj = value;
                }
            }
        }

        for (const match of allCnpjs) {
            const value = match[0].replace(/\D/g, '');
            if (value !== emitCnpj) {
                destDocumento = value;
                break;
            }
        }

        if (!destDocumento) {
            for (const match of allCpfs) {
                const value = match[0].replace(/\D/g, '');
                destDocumento = value;
                break;
            }
        }

        // Extract items from PDF (CST/CSOSN pode ter de 2 a 4 dígitos como '0500')
        // Usamos [^\r\n]{5,150}? para limitar a descrição à mesma linha, impedindo cruzamento com cabeçalhos ou outros blocos
        const items: NFeItem[] = [];
        const itemRegex = /\b(\S+)\s+([^\r\n]{5,150}?)\s+(\d{4}\.?\d{2}\.?\d{2}|\d{8})\s+(\d{2,4})\s+(\d{4})\s+([A-Z]{2,3})\s+([\d\.,]+)\s+([\d\.,]+)\s+([\d\.,]+)/g;
        let itemMatch;
        while ((itemMatch = itemRegex.exec(workingText)) !== null) {
            let codigo = itemMatch[1];
            let descricao = itemMatch[2].trim();
            const ncm = itemMatch[3].replace(/\./g, '');
            const cfop = itemMatch[5];
            const unidade = itemMatch[6];
            const quantidade = parseFloat(itemMatch[7].replace(/\./g, '').replace(',', '.')) || 0;
            const valorUnitario = parseFloat(itemMatch[8].replace(/\./g, '').replace(',', '.')) || 0;
            const valorTotal = parseFloat(itemMatch[9].replace(/\./g, '').replace(',', '.')) || 0;

            // Correção para quando o código capturado é uma sigla de imposto (ex: IPI) e o código real ficou grudado na descrição
            const taxAcronyms = ['IPI', 'ICMS', 'ISSQN', 'PIS', 'COFINS', 'ST', 'IP'];
            if (taxAcronyms.includes(codigo.toUpperCase())) {
                const matchRealCode = descricao.match(/^([A-Za-z0-9\-_./]+)\s+(.+)$/);
                if (matchRealCode) {
                    const potentialCode = matchRealCode[1];
                    // Evita pegar palavras comuns da descrição como código (código real geralmente tem números ou é curto)
                    if (potentialCode.match(/\d/) || potentialCode.length <= 10) {
                        codigo = potentialCode;
                        descricao = matchRealCode[2].trim();
                    }
                }
            }
 
            items.push({
                codigo,
                descricao,
                quantidade,
                unidade,
                valorUnitario,
                valorTotal,
                ncm,
                cfop
            });
        }

        let tipoNF: 'entrada' | 'saida' = 'entrada';
        const cleanCompany = companyCnpj ? companyCnpj.replace(/\D/g, '') : '';
        const cleanEmit = emitCnpj ? emitCnpj.replace(/\D/g, '') : '';
        if (cleanCompany && cleanEmit && cleanCompany === cleanEmit) {
            tipoNF = 'saida';
        } else if (emitNome && (emitNome.toLowerCase().includes('leandro b. leal') || emitNome.toLowerCase().includes('leandro b leal'))) {
            tipoNF = 'saida';
        }

        const parsedWithLowConfidence = !numero || numero === '000000' || destNome === 'Destinatário Importado';

        return {
            numero: numero || '000000',
            serie: serie,
            dataEmissao: dataEmissao,
            chaveAcesso: chaveAcesso,
            naturezaOperacao: 'Importação PDF',
            tipoNF: tipoNF,
            emitente: { nome: emitNome, cnpj: emitCnpj },
            destinatario: { nome: destNome, documento: destDocumento },
            itens: items,
            totalNF: totalNF || items.reduce((acc, it) => acc + it.valorTotal, 0),
            valorDesconto: 0,
            valorFrete: 0,
            isPdf: true,
            pdfFile: file,
            parsedWithLowConfidence: parsedWithLowConfidence
        };
    } catch { return null }
}

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

/** Extrai todas as URLs http(s) de uma célula (vírgula, ponto-e-vírgula, pipe, quebra de linha, etc.). */
function parseHttpUrlsFromCell(raw: unknown): string[] {
    if (raw == null) return []
    const s = String(raw).trim()
    if (!s) return []

    // Célula é um array JSON stringificado? ex.: ["/IMG_123.png","/IMG_456.png"]
    if (s.startsWith("[") && s.endsWith("]")) {
        try {
            const parsed = JSON.parse(s)
            if (Array.isArray(parsed)) {
                const items = parsed.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
                if (items.length > 0) return resolveUrls(items)
            }
        } catch { /* não é JSON válido, segue para split manual */ }
    }

    // Split manual por separadores comuns
    const chunks = s.split(/[\n\r,;|]+/).map(p => p.trim()).filter(Boolean)
    return resolveUrls(chunks)
}

/** Limpa um chunk (aspas, colchetes, espaços) e resolve URLs. */
function cleanChunk(chunk: string): string {
    return chunk.replace(/^[\s"'\[\]]+|[\s"'\[\]]+$/g, "").trim()
}

function resolveUrls(chunks: string[]): string[] {
    const out: string[] = []
    for (let chunk of chunks) {
        chunk = cleanChunk(chunk)
        if (!chunk) continue
        if (/^https?:\/\//i.test(chunk)) {
            out.push(chunk)
            continue
        }
        const found = chunk.match(/https?:\/\/[^\s"'<>[\]()]+/gi)
        if (found) { out.push(...found); continue }
        // Caminhos relativos de origens conhecidas
        if (chunk.startsWith("/")) {
            out.push("https://driveparts.com.br/uploads/pecaAvulsas" + chunk)
            continue
        }
    }
    return [...new Set(out.map(u => u.replace(/[,;.)]+$/g, "")))]
}

/** Valores tipo 1.234,56 ou 1234,56 → número (sucatas / financeiro BR). */
function parseBrazilianMoney(raw: unknown): number {
    let s = String(raw ?? '').replace(/[^\d.,-]/g, '')
    if (!s) return 0
    const lastComma = s.lastIndexOf(',')
    const lastDot = s.lastIndexOf('.')
    if (lastComma > lastDot) {
        s = s.replace(/\./g, '').replace(',', '.')
    } else {
        s = s.replace(',', '.')
    }
    const v = parseFloat(s)
    return isNaN(v) ? 0 : Math.max(0, v)
}

async function pdfToImageBlob(file: File): Promise<Blob> {
    const arrayBuffer = await file.arrayBuffer()
    const pdfjs = await import('pdfjs-dist')
    // Configura worker dinamicamente se necessário
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
    }
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer })
    const pdf = await loadingTask.promise
    const page = await pdf.getPage(1)
    const viewport = page.getViewport({ scale: 2.0 })
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    canvas.height = viewport.height
    canvas.width = viewport.width
    // @ts-ignore - Depende da versão do pdfjs
    await page.render({ canvasContext: context!, viewport }).promise
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.85))
}

/** Extrai texto bruto de um PDF para processamento via regex. */
async function extractTextFromPDF(file: File): Promise<string> {
    try {
        const arrayBuffer = await file.arrayBuffer()
        const pdfjs = await import('pdfjs-dist')
        // Configura worker dinamicamente se necessário
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
            pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
        }
        const loadingTask = pdfjs.getDocument({ data: arrayBuffer })
        const pdf = await loadingTask.promise
        let fullText = ''
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i)
            const textContent = await page.getTextContent()
            
            const items = (textContent.items as any[]).map(item => ({
                str: item.str || '',
                x: item.transform ? item.transform[4] : 0,
                y: item.transform ? item.transform[5] : 0
            }));

            // Ordena por Y decrescente (topo para o rodapé) e por X crescente (esquerda para direita)
            items.sort((a, b) => {
                if (Math.abs(a.y - b.y) > 3) {
                    return b.y - a.y;
                }
                return a.x - b.x;
            });

            let pageText = '';
            if (items.length > 0) {
                let currentY = items[0].y;
                let currentLine: string[] = [];
                for (const item of items) {
                    if (Math.abs(item.y - currentY) > 3) {
                        pageText += currentLine.join(' ') + '\n';
                        currentLine = [item.str];
                        currentY = item.y;
                    } else {
                        currentLine.push(item.str);
                    }
                }
                if (currentLine.length > 0) {
                    pageText += currentLine.join(' ') + '\n';
                }
            }
            fullText += pageText + '\n';
        }
        return fullText
    } catch (err) {
        console.error('[PDF-Extract-Error]', err)
        throw new Error('Falha ao ler o PDF: ' + (err instanceof Error ? err.message : 'Erro desconhecido'))
    }
}

/** Data em DD/MM/YYYY ou DD/MM/YYYY HH:mm (comum em Excel BR). */
function parseBrazilianDateCell(raw: unknown): string | null {
    if (raw == null || raw === '') return null
    const s = String(raw).trim()
    const m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/)
    if (m) {
        const day = parseInt(m[1], 10)
        const month = parseInt(m[2], 10) - 1
        const year = parseInt(m[3], 10)
        const dt = new Date(year, month, day)
        if (!isNaN(dt.getTime()) && dt.getFullYear() === year && dt.getMonth() === month) {
            return dt.toISOString().split('T')[0]
        }
    }
    return null
}

function parseSucataYearFromCell(raw: unknown, target: 'ano_fabricacao' | 'ano_modelo'): number | null {
    if (raw == null || raw === '') return null
    if (typeof raw === 'number' && !isNaN(raw)) {
        const n = Math.round(raw)
        return n > 1950 && n < 2100 ? n : null
    }
    const str = String(raw).trim()
    if (!str) return null
    const years = str.match(/\d{4}/g)
    if (years && years.length > 0) {
        const y = parseInt(target === 'ano_fabricacao' ? years[0] : years[years.length - 1], 10)
        return y > 1950 && y < 2100 ? y : null
    }
    const num = parseInt(str.replace(/\D/g, '').slice(0, 4), 10)
    return !isNaN(num) && num > 1950 && num < 2100 ? num : null
}

/** PostgreSQL: upsert no mesmo request com o mesmo codigo 2x quebra o lote inteiro. */
function dedupeSucatasBatchByCodigo(batch: Record<string, unknown>[]): Record<string, unknown>[] {
    const semCodigo: Record<string, unknown>[] = []
    const map = new Map<string, Record<string, unknown>>()
    for (const r of batch) {
        const c = String(r.codigo ?? '').trim()
        if (!c) {
            semCodigo.push(r)
            continue
        }
        map.set(c, r)
    }
    return [...map.values(), ...semCodigo]
}

/** Remove campos de imagem do payload quando a planilha não traz URL (upsert não apaga fotos no BD). */
function aplicarImagensEstoqueParaUpsert(
    row: Record<string, unknown>,
    existente: { imagem_url?: string | null; imagem_urls?: unknown } | undefined,
    juntarComExistente: boolean
): Record<string, unknown> {
    const planilha = Array.isArray(row.imagem_urls) && (row.imagem_urls as unknown[]).length > 0
        ? (row.imagem_urls as string[])
        : typeof row.imagem_url === 'string' && row.imagem_url.trim()
            ? parseHttpUrlsFromCell(row.imagem_url)
            : []

    if (planilha.length === 0) {
        const { imagem_url: _a, imagem_urls: _b, ...rest } = row
        return rest
    }

    if (!juntarComExistente || !existente) {
        return { ...row, imagem_url: planilha[0], imagem_urls: planilha }
    }

    const { imagem_url: capaEx, imagem_urls: arrEx } = normalizeProdutoImagens(existente)
    const base: string[] = []
    const seen = new Set<string>()
    const pushU = (u: string) => {
        const k = normalizeUrlForMatch(u)
        if (!seen.has(k)) {
            seen.add(k)
            base.push(u)
        }
    }
    for (const u of arrEx) pushU(u)
    if (capaEx) pushU(capaEx)
    for (const u of planilha) pushU(u)

    return { ...row, imagem_url: base[0] ?? planilha[0], imagem_urls: base }
}

/** Sucatas: `fotos` é TEXT[]; célula vazia não envia o campo (não apaga fotos no BD). */
function aplicarFotosSucataParaUpsert(
    row: Record<string, unknown>,
    existente: { fotos?: unknown } | undefined,
    juntarComExistente: boolean
): Record<string, unknown> {
    const planilha = Array.isArray(row.fotos)
        ? (row.fotos as string[]).filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
        : []

    if (planilha.length === 0) {
        const { fotos: _f, ...rest } = row
        return rest
    }

    if (!juntarComExistente || !existente) {
        return { ...row, fotos: planilha }
    }

    const existing = Array.isArray(existente.fotos)
        ? (existente.fotos as unknown[]).filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
        : []
    const seen = new Set(existing.map(normalizeUrlForMatch))
    const merged = [...existing]
    for (const u of planilha) {
        const k = normalizeUrlForMatch(u)
        if (!seen.has(k)) {
            seen.add(k)
            merged.push(u)
        }
    }
    return { ...row, fotos: merged }
}

interface Mapping {
    target: string
    label: string
    required: boolean
    type?: 'number' | 'date' | 'string' | 'boolean'
    hints?: string[]
}

type TargetType = 'estoque' | 'catalogo' | 'clientes' | 'financeiro' | 'sucatas' | 'nfe' | 'doc_sucata' | 'whatsapp_contatos'

// ─── Documento Sucata Types ───────────────────────────────────────────────────
type DocSucataTipo = 'nfe_compra' | 'baixa_veiculo' | 'nota_compra' | 'laudo' | 'leilao_doc'

interface SucataExtraida {
    codigo?: string
    marca?: string
    modelo?: string
    versao?: string
    ano_fabricacao?: number
    ano_modelo?: number
    placa?: string
    chassi?: string
    cor?: string
    combustivel?: string
    km_entrada?: number
    valor_compra?: number
    data_compra?: string
    local_armazenagem?: string
    observacoes?: string
    fornecedor_nome?: string
    status: string
    condicao?: string
    numero_motor?: string
    renavam?: string
    modelo_grupo_peca?: string
}

const MARCAS_BR = ['Fiat', 'Volkswagen', 'VW', 'Ford', 'Chevrolet', 'GM', 'Toyota', 'Honda', 'Hyundai', 'Renault',
    'Peugeot', 'Citroën', 'Citroen', 'Mitsubishi', 'Nissan', 'Jeep', 'Dodge', 'Kia', 'BMW', 'Mercedes', 'Audi',
    'Volvo', 'Subaru', 'Suzuki', 'Land Rover', 'Lamborghini', 'Ferrari', 'Porsche', 'Yamaha', 'Kawasaki', 'Ram']

const CORES_BR = ['Branco', 'Preto', 'Prata', 'Cinza', 'Vermelho', 'Azul', 'Verde', 'Amarelo', 'Laranja', 'Marrom', 'Bege', 'Roxo', 'Rosa', 'Dourado']

function extractFromText(text: string): SucataExtraida {
    const r: SucataExtraida = { status: 'Aguardando' }
    const t = text

    // 1. Campos específicos de Notas de Leilão (Labels encontradas na imagem)

    // Placa: NRJ3919 ou ABC-1234
    const placaMatch = t.match(/PLACA:\s*([A-Z]{3}-?\d[A-Z0-9]\d{2})/i) || t.match(/\b([A-Z]{3}-?\d[A-Z0-9]\d{2})\b/i)
    if (placaMatch) r.placa = placaMatch[1].replace(/\s/g, '-').toUpperCase()

    // Chassi: 8AD2MKFWXBG063755
    const chassiMatch = t.match(/CHASSI:\s*([A-HJ-NPR-Z0-9]{17,18})/i) || t.match(/\b([A-HJ-NPR-Z0-9]{17,18})\b/i)
    if (chassiMatch) r.chassi = chassiMatch[1].toUpperCase()

    // Motor: 10DBSS0132129
    const motorMatch = t.match(/MOTOR:\s*([A-Z0-9]+)/i)
    if (motorMatch) r.numero_motor = motorMatch[1].toUpperCase()

    // Renavam: 283790865
    const renavamMatch = t.match(/RENAVAM:\s*(\d{8,11})/i)
    if (renavamMatch) r.renavam = renavamMatch[1]

    // Leiloeiro / Fornecedor
    const leiloeiroMatch = t.match(/LEILOEIRO:\s*([^\n\r]+)/i)
    if (leiloeiroMatch) r.fornecedor_nome = leiloeiroMatch[1].trim()

    // Valor da Arrematação
    const valorArrematacaoMatch = t.match(/VALOR DA ARREMATAÇÃO:\s*R\$\s*([\d.,]+)/i)
    if (valorArrematacaoMatch) r.valor_compra = parseFloat(valorArrematacaoMatch[1].replace(/\./g, '').replace(',', '.')) || 0
    else {
        const valorGen = t.match(/R\$\s*([\d.,]+)/i)
        if (valorGen) r.valor_compra = parseFloat(valorGen[1].replace(/\./g, '').replace(',', '.')) || 0
    }

    // Datas: 10/02/2026
    const dataMatch = t.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/)
    if (dataMatch) r.data_compra = `${dataMatch[3]}-${dataMatch[2]}-${dataMatch[1]}`

    // Anos: 2011/2011
    const anosString = t.match(/ANO\/MODELO:\s*(\d{4})\/(\d{4})/i)
    if (anosString) {
        r.ano_fabricacao = parseInt(anosString[1], 10)
        r.ano_modelo = parseInt(anosString[2], 10)
    } else {
        const anosExt = [...t.matchAll(/\b(19[5-9]\d|20[0-3]\d)\b/g)].map(m => parseInt(m[1], 10))
        if (anosExt.length === 1) { r.ano_fabricacao = anosExt[0]; r.ano_modelo = anosExt[0] }
        else if (anosExt.length >= 2) { r.ano_fabricacao = Math.min(...anosExt); r.ano_modelo = Math.max(...anosExt) }
    }

    // Marca (baseado no dicionário MARCAS_BR)
    for (const marca of MARCAS_BR) {
        if (new RegExp(`\\b${marca}\\b`, 'i').test(t)) {
            r.marca = marca === 'VW' ? 'Volkswagen' : marca === 'GM' ? 'Chevrolet' : marca; break
        }
    }

    // Modelo: se tiver "DESCRIÇÃO DO BEM: PEUGEOT 207HB XR"
    const descMatch = t.match(/DESCRIÇÃO DO BEM:\s*([^\n\r]+)/i)
    if (descMatch) {
        let textModelo = descMatch[1].trim()
        if (r.marca && textModelo.toUpperCase().includes(r.marca.toUpperCase())) {
            textModelo = textModelo.replace(new RegExp(r.marca, 'ig'), '').trim()
        }
        r.modelo = textModelo
    }

    // Cor
    for (const cor of CORES_BR) {
        if (new RegExp(`\\b${cor}\\b`, 'i').test(t)) { r.cor = cor; break }
    }

    // Combustível
    if (/flex|álcool|alcool/i.test(t)) r.combustivel = 'Flex'
    else if (/gasolina/i.test(t)) r.combustivel = 'Gasolina'
    else if (/diesel/i.test(t)) r.combustivel = 'Diesel'
    else if (/elétric|eletric/i.test(t)) r.combustivel = 'Elétrico'
    else if (/gnv|gás natural/i.test(t)) r.combustivel = 'GNV'
    else if (/híbrido|hibrido/i.test(t)) r.combustivel = 'Híbrido'

    // KM
    const kmMatch = t.match(/(\d[\d.]+)\s*km/i)
    if (kmMatch) r.km_entrada = parseInt(kmMatch[1].replace(/\./g, ''), 10)

    // Condição
    if (/batid|acident|colid/i.test(t)) r.condicao = 'Batida'
    else if (/alagad|inundad/i.test(t)) r.condicao = 'Alagada'
    else if (/incend/i.test(t)) r.condicao = 'Incêndio'
    else if (/conservad|boa estado/i.test(t)) r.condicao = 'Conservada'

    // Observações
    const comitente = t.match(/COMITENTE:\s*([^\n\r]+)/i)
    const lote = t.match(/LOTE:\s*(\d+)/i)
    r.observacoes = [
        comitente ? `Comitente: ${comitente[1].trim()}` : '',
        lote ? `Lote: ${lote[1]}` : ''
    ].filter(Boolean).join(' | ') || t.replace(/\s+/g, ' ').trim().slice(0, 300)

    return r
}

function extractFromNFeXML(xmlText: string): SucataExtraida {
    const nfe = parseNFeXML(xmlText)
    if (!nfe) return { status: 'Aguardando' }
    const r: SucataExtraida = { status: 'Aguardando' }
    r.valor_compra = nfe.totalNF
    r.data_compra = nfe.dataEmissao
    r.fornecedor_nome = nfe.emitente.nome
    // Tenta extrair dados do veículo da descrição dos itens
    const descricoes = nfe.itens.map(i => i.descricao).join(' ')
    const fromDesc = extractFromText(descricoes)
    return { ...fromDesc, ...r, observacoes: `NF-e ${nfe.numero}/${nfe.serie} — ${nfe.emitente.nome} (${nfe.emitente.cnpj})` }
}

const SCHEMAS: Record<TargetType, { label: string, table: string, icon: any, color: string, columns: Mapping[] }> = {
    estoque: {
        label: 'Estoque / Produtos',
        table: 'produtos',
        icon: Package,
        color: 'text-orange-500',
        columns: [
            { target: 'nome', label: 'Nome do Produto', required: true, type: 'string', hints: ['PRODUTO', 'DESCRIÇÃO', 'NOME', 'ITEM', 'TITLE', 'NAME', 'DESCRIPTION'] },
            { target: 'sku', label: 'SKU / Código', required: true, type: 'string', hints: ['SKU', 'CÓDIGO', 'REF', 'ID', 'CODE', 'PART NUMBER', 'PART_NUMBER'] },
            { target: 'part_number', label: 'Part Number', required: false, type: 'string', hints: ['PART NUMBER', 'PART_NUMBER', 'CÓDIGO FABRICANTE'] },
            { target: 'preco', label: 'Preço de Venda', required: true, type: 'number', hints: ['PREÇO', 'VALOR', 'VENDA', 'PRICE', 'AMOUNT', 'SALEVALUE'] },
            { target: 'custo', label: 'Preço de Custo', required: false, type: 'number', hints: ['CUSTO', 'COST', 'COMPRA', 'PREÇO CUSTO'] },
            { target: 'estoque_atual', label: 'Estoque Atual', required: true, type: 'number', hints: ['ESTOQUE', 'SALDO', 'QTY', 'QUANTIDADE', 'BALANCE', 'STOCK', 'QUANTITYINBOX'] },
            { target: 'unidade_medida', label: 'Unidade (UN, PC, m)', required: false, type: 'string', hints: ['UNIDADE', 'UND', 'UN', 'UNIT'] },
            { target: 'ncm', label: 'NCM', required: false, type: 'string', hints: ['NCM', 'HS CODE'] },
            { target: 'marca', label: 'Marca', required: false, type: 'string', hints: ['MARCA', 'FABRICANTE', 'BRAND'] },
            { target: 'modelo', label: 'Modelo', required: false, type: 'string', hints: ['MODELO', 'MODEL'] },
            { target: 'ano', label: 'Ano', required: false, type: 'number', hints: ['ANO', 'YEAR'] },
            { target: 'localizacao_id', label: 'Localização (ID ou nome cadastrado)', required: false, type: 'string', hints: ['POSTO', 'LOCAL', 'LOCALIZAÇÃO', 'DESCRIPTIONPATH'] },
            { target: 'localizacao', label: 'Local texto (caminho na peça)', required: false, type: 'string', hints: ['CAMINHO', 'PATH', 'SETOR', 'DESCRIPTIONPATH'] },
            { target: 'imagem_url', label: 'URLs das fotos (várias separadas por vírgula)', required: false, type: 'string', hints: ['IMAGEM', 'URL', 'FOTO', 'IMAGES', 'PICTURE', 'IMAGE'] },
        ]
    },
    catalogo: {
        label: 'Catálogo Master',
        table: 'pecas_catalogo',
        icon: Tags,
        color: 'text-blue-500',
        columns: [
            { target: 'nome', label: 'Nome do Catálogo', required: true, type: 'string', hints: ['PEÇA', 'CATÁLOGO', 'NOME'] },
            { target: 'sku', label: 'SKU Master', required: true, type: 'string', hints: ['SKU', 'CÓDIGO'] },
            { target: 'descricao', label: 'Descrição', required: false, type: 'string', hints: ['DESCRIÇÃO', 'INFO'] },
            { target: 'marca', label: 'Marca', required: false, type: 'string', hints: ['MARCA', 'BRAND'] },
        ]
    },
    clientes: {
        label: 'Clientes',
        table: 'clientes',
        icon: Users,
        color: 'text-emerald-500',
        columns: [
            { target: 'nome', label: 'Nome Completo', required: true, type: 'string', hints: ['NOME', 'CLIENTE', 'FULL NAME', 'NAME', 'CUSTOMER'] },
            { target: 'documento', label: 'CPF / CNPJ', required: true, type: 'string', hints: ['CPF', 'CNPJ', 'DOCUMENTO', 'DOC', 'TAX ID', 'DOCUMENT'] },
            { target: 'razao_social', label: 'Razão Social', required: false, type: 'string', hints: ['RAZÃO', 'EMPRESA', 'COMPANY'] },
            { target: 'email', label: 'E-mail', required: false, type: 'string', hints: ['EMAIL', 'E-MAIL', 'MAIL'] },
            { target: 'telefone', label: 'Telefone', required: false, type: 'string', hints: ['TEL', 'TELEFONE', 'CEL', 'PHONE', 'WHATSAPP'] },
            { target: 'endereco', label: 'Endereço', required: false, type: 'string', hints: ['ENDEREÇO', 'RUA', 'ADDRESS', 'STREET'] },
            { target: 'saldo_haver', label: 'Saldo/Crédito', required: false, type: 'number', hints: ['SALDO', 'HAVER', 'BALANCE', 'CREDIT_BALANCE'] },
            { target: 'limite_credito', label: 'Limite de Crédito', required: false, type: 'number', hints: ['LIMITE', 'LIMIT', 'CREDIT_LIMIT'] },
        ]
    },
    financeiro: {
        label: 'Financeiro',
        table: 'financeiro_lancamentos',
        icon: Wallet,
        color: 'text-purple-500',
        columns: [
            { target: 'descricao', label: 'Descrição', required: true, type: 'string', hints: ['HISTÓRICO', 'DESCRIÇÃO', 'DESCRIPTION'] },
            { target: 'valor', label: 'Valor (R$)', required: true, type: 'number', hints: ['VALOR', 'AMOUNT', 'VALUE'] },
            { target: 'data_vencimento', label: 'Vencimento', required: true, type: 'date', hints: ['VENCIMENTO', 'DUE DATE', 'DATA'] },
            { target: 'tipo', label: 'Tipo (Receita/Despesa)', required: true, type: 'string', hints: ['TIPO', 'OPER', 'MOV', 'CATEGORY'] },
            { target: 'status', label: 'Status (Pago/Pendente)', required: false, type: 'string', hints: ['STATUS', 'SITUAÇÃO', 'STATE'] },
        ]
    },
    nfe: {
        label: 'Nota Fiscal (NF-e)',
        table: 'nfe_documentos',
        icon: Receipt,
        color: 'text-indigo-500',
        columns: []
    },
    doc_sucata: {
        label: 'Documentos de Sucata',
        table: 'sucatas',
        icon: Sparkles,
        color: 'text-rose-500',
        columns: []
    },
    sucatas: {
        label: 'Sucatas',
        table: 'sucatas',
        icon: Car,
        color: 'text-amber-500',
        columns: [
            { target: 'codigo', label: 'Código da Sucata', required: true, type: 'string', hints: ['CÓDIGO', 'CODIGO', 'CODE', 'ID', 'REF'] },
            { target: 'marca', label: 'Marca', required: true, type: 'string', hints: ['MARCA', 'BRAND', 'FABRICANTE'] },
            { target: 'modelo', label: 'Modelo', required: true, type: 'string', hints: ['MODELO', 'MODEL', 'VEICULO', 'VEÍCULO'] },
            { target: 'versao', label: 'Versão (vai para observações)', required: false, type: 'string', hints: ['VERSÃO', 'VERSAO', 'VERSION', 'VERSAO VEICULO'] },
            { target: 'ano_fabricacao', label: 'Ano Fabricação', required: false, type: 'number', hints: ['ANO', 'YEAR', 'ANO FABRICACAO', 'ANO FABRICAÇÃO'] },
            { target: 'ano_modelo', label: 'Ano Modelo', required: false, type: 'number', hints: ['ANO MODELO', 'YEAR MODEL'] },
            { target: 'placa', label: 'Placa', required: false, type: 'string', hints: ['PLACA', 'PLATE', 'LICENSE'] },
            { target: 'cor', label: 'Cor', required: false, type: 'string', hints: ['COR', 'COLOR', 'COLOUR'] },
            { target: 'chassi', label: 'Chassi / VIN', required: false, type: 'string', hints: ['CHASSI', 'CHASSIS', 'VIN', 'RENAVAM'] },
            { target: 'local_armazenagem', label: 'Localização / Lote', required: false, type: 'string', hints: ['LOCALIZAÇÃO', 'LOCALIZACAO', 'LOCAL', 'LOTE', 'LOT', 'LOCATION', 'PÁTIO'] },
            { target: 'valor_compra', label: 'Valor de Compra (R$)', required: false, type: 'number', hints: ['VALOR DE COMPRA', 'VALOR COMPRA', 'PURCHASE', 'CUSTO', 'COST'] },
            { target: 'data_compra', label: 'Data de Compra / Criação', required: false, type: 'date', hints: ['DATA', 'DATA DE CRIAÇÃO', 'DATA CRIACAO', 'CRIAÇÃO', 'DATE', 'COMPRA'] },
            { target: 'status', label: 'Status', required: false, type: 'string', hints: ['STATUS', 'SITUAÇÃO', 'STATE', 'SITUACAO'] },
            { target: 'modelo_grupo_peca', label: 'Modelo de Grupo de Peça', required: false, type: 'string', hints: ['GRUPO', 'MODELO DE GRUPO'] },
            { target: 'fornecedor', label: 'Fornecedor', required: false, type: 'string', hints: ['FORNECEDOR', 'SUPPLIER'] },
            { target: 'certidao_baixa', label: 'Certidão de Baixa', required: false, type: 'string', hints: ['CERTIDÃO', 'CERTIDÃO DE BAIXA', 'BAIXA'] },
            { target: 'data_desmontagem', label: 'Em Desmontagem (Data)', required: false, type: 'date', hints: ['EM DESMONTAGEM', 'Dismantling Date'] },
            { target: 'valor_vendido', label: 'Valor Vendido (R$)', required: false, type: 'number', hints: ['VALOR VENDIDO', 'SOLD'] },
            { target: 'lucro_bruto', label: 'Lucro Bruto (R$)', required: false, type: 'number', hints: ['LUCRO', 'PROFIT'] },
            { target: 'margem_bruta', label: 'Margem Bruta (%)', required: false, type: 'number', hints: ['MARGEM', 'MARGIN', 'PERCENT'] },
            { target: 'fotos', label: 'URLs das fotos (várias por célula)', required: false, type: 'string', hints: ['IMAGEM', 'IMAGENS', 'FOTOS', 'URL', 'PHOTOS', 'IMAGE', 'LINK'] },
            { target: 'observacoes', label: 'Observações (Geral)', required: false, type: 'string', hints: ['OBSERVAÇÕES', 'OBSERVACOES', 'OBS'] },
        ]
    },
    whatsapp_contatos: {
        label: 'Contatos WhatsApp',
        table: 'whatsapp_contatos',
        icon: MessageCircle,
        color: 'text-emerald-500',
        columns: [
            { target: 'nome_personalizado', label: 'Nome do Contato', required: true, type: 'string', hints: ['NOME', 'NOME_PERSONALIZADO', 'PUSH_NAME', 'CONTATO', 'NOME COMPLETO', 'NAME'] },
            { target: 'telefone', label: 'Telefone (com DDD)', required: true, type: 'string', hints: ['TELEFONE', 'CELULAR', 'PHONE', 'WHATSAPP', 'TEL', 'CONTATO_TELEFONE', 'NUMBER'] },
            { target: 'categoria', label: 'Tipo / Categoria', required: false, type: 'string', hints: ['TIPO', 'CATEGORIA', 'TIPO_CONTATO', 'GRUPO_CONTATO', 'CATEGORY', 'TYPE'] },
        ]
    }
}

export function Importador() {
    const [targetType, setTargetType] = useState<TargetType>('estoque')
    const [rawData, setRawData] = useState<any[]>([])
    const [columns, setColumns] = useState<string[]>([])
    const [mappings, setMappings] = useState<Record<string, string>>({})
    const [preview, setPreview] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [step, setStep] = useState<1 | 2 | 3>(1)
    const [isDragging, setIsDragging] = useState(false)

    // NF-e specific state
    const [nfeList, setNfeList] = useState<NFeData[]>([])
    const [nfeActions, setNfeActions] = useState<NFeActions>({
        salvar_documento: true,
        criar_financeiro: false,
        criar_venda: false,
        atualizar_estoque: false,
    })
    const [nfeExpandedIdx, setNfeExpandedIdx] = useState<number | null>(0)
    const [nfeImportLog, setNfeImportLog] = useState<{ nf: string; status: 'ok' | 'erro'; msg: string }[]>([])
    const [companyCnpj, setCompanyCnpj] = useState<string>('')
    const [companyName, setCompanyName] = useState<string>('')

    useEffect(() => {
        configuracoesApi.obter()
            .then(data => {
                if (data?.cnpj) {
                    setCompanyCnpj(data.cnpj);
                }
                if (data?.nome_fantasia || data?.razao_social) {
                    setCompanyName(data.nome_fantasia || data.razao_social);
                }
            })
            .catch(err => console.error('Erro ao obter dados da empresa:', err));
    }, []);

    // ─── Doc Sucata States ────────────────────────────────────────────────────
    const [docSucataTipo, setDocSucataTipo] = useState<DocSucataTipo | null>(null)
    const [docSucataRawText, setDocSucataRawText] = useState('')
    const [docSucataExtraida, setDocSucataExtraida] = useState<SucataExtraida | null>(null)
    const [docSucataForm, setDocSucataForm] = useState<SucataExtraida>({ status: 'Aguardando' })
    const [docSucataStep, setDocSucataStep] = useState<1 | 2 | 3>(1)
    const [docSucataSaving, setDocSucataSaving] = useState(false)
    const [docSucataFile, setDocSucataFileObj] = useState<File | null>(null)
    const [docSucataPreviewUrl, setDocSucataPreviewUrl] = useState<string | null>(null)
    const [docSucataLog, setDocSucataLog] = useState<{ status: 'ok' | 'erro'; msg: string } | null>(null)

    const currentSchema = SCHEMAS[targetType]
    const locaisStore = useProdutosCache(state => state.locais) || []

    // ── NF-e handlers ────────────────────────────────────────────────────────
    const handleNFeFiles = async (files: FileList | null) => {
        if (!files) return
        const validFiles = Array.from(files).filter(f => {
            const name = f.name.toLowerCase();
            return name.endsWith('.xml') || name.endsWith('.pdf');
        });
        if (validFiles.length === 0) return alert('Selecione arquivos XML ou PDF de NF-e.')
        
        for (const file of validFiles) {
            const name = file.name.toLowerCase();
            if (name.endsWith('.xml')) {
                const reader = new FileReader()
                reader.onload = e => {
                    const text = e.target?.result as string
                    const nfe = parseNFeXML(text)
                    if (nfe) setNfeList(prev => {
                        const exists = prev.some(n => n.chaveAcesso === nfe.chaveAcesso && nfe.chaveAcesso)
                        return exists ? prev : [...prev, nfe]
                    })
                    else alert(`Não foi possível ler o arquivo: ${file.name}`)
                }
                reader.readAsText(file)
            } else if (name.endsWith('.pdf')) {
                try {
                    const pdfText = await extractTextFromPDF(file);
                    const parsedNFe = parseNFePDFText(pdfText, file, companyCnpj);
                    if (parsedNFe) {
                        // Resolve nomes limpos se baterem com banco local
                        const cleanEmitCnpj = parsedNFe.emitente.cnpj.replace(/\D/g, '');
                        const cleanCompanyCnpj = companyCnpj.replace(/\D/g, '');
                        
                        if (cleanEmitCnpj && cleanCompanyCnpj && cleanEmitCnpj === cleanCompanyCnpj && companyName) {
                            parsedNFe.emitente.nome = companyName;
                        } else if (cleanEmitCnpj) {
                            try {
                                const fornecedores = await configuracoesApi.listarFornecedores().catch(() => []);
                                const matchedForn = fornecedores.find((f: any) => {
                                    const docClean = (f.cnpj || f.documento || '').replace(/\D/g, '');
                                    return docClean === cleanEmitCnpj;
                                });
                                if (matchedForn) {
                                    parsedNFe.emitente.nome = matchedForn.razao_social || matchedForn.nome;
                                }
                            } catch (e) {
                                console.error('Erro ao buscar nome do fornecedor no localDb:', e);
                            }
                        }

                        const cleanDestDoc = parsedNFe.destinatario.documento.replace(/\D/g, '');
                        if (cleanDestDoc) {
                            try {
                                const clientes = await clientesApi.listar({ q: cleanDestDoc, limit: 10 }).catch(() => []);
                                const matchedCli = clientes.find((c: any) => {
                                    const docClean = (c.documento || '').replace(/\D/g, '');
                                    return docClean === cleanDestDoc;
                                });
                                if (matchedCli) {
                                    parsedNFe.destinatario.nome = matchedCli.nome;
                                }
                            } catch (e) {
                                console.error('Erro ao buscar nome do cliente no localDb:', e);
                            }
                        }

                        setNfeList(prev => {
                            const exists = prev.some(n => 
                                (n.chaveAcesso === parsedNFe.chaveAcesso && parsedNFe.chaveAcesso) ||
                                (n.numero === parsedNFe.numero && n.serie === parsedNFe.serie && parsedNFe.numero)
                            )
                            return exists ? prev : [...prev, parsedNFe]
                        })
                    } else {
                        alert(`Não foi possível extrair dados do PDF: ${file.name}`)
                    }
                } catch (err: any) {
                    alert(`Erro ao ler PDF ${file.name}: ` + err.message)
                }
            }
        }
        setStep(2)
    }

    const handleNFeImport = async () => {
        if (nfeList.length === 0) return
        setLoading(true)
        setNfeImportLog([])
        const log: typeof nfeImportLog = []

        for (const nfe of nfeList) {
            try {
                // 1. Salvar documento
                if (nfeActions.salvar_documento) {
                    let urlPdf: string | null = null;
                    if (nfe.isPdf && nfe.pdfFile) {
                        try {
                            const fd = new FormData()
                            fd.append('file', nfe.pdfFile)
                            const up = await api.postForm('/api/admin/upload-produto-imagem', fd)
                            if (up?.url) {
                                urlPdf = up.url as string;
                            }
                        } catch (upErr) {
                            console.error('Falha no upload do PDF:', upErr)
                        }
                    }

                    const totalNota = nfe.totalNF;
                    const itemsPayload = nfe.itens.map((it: any) => ({
                        produto_id: null,
                        sku: it.codigo || "",
                        part_number: it.codigo || "",
                        nome: it.descricao,
                        quantidade: it.quantidade,
                        custo: it.valorUnitario,
                        preco_venda: Number((it.valorUnitario * 2).toFixed(2)),
                        categoria_id: null,
                        localizacao_id: null,
                        cadastrar_estoque: false,
                        quantidade_devolvida: 0
                    }));

                    let fornecedorId = null;
                    let fornecedorNome = nfe.emitente.nome;
                    let fornecedorCnpj = nfe.emitente.cnpj;

                    if (nfe.tipoNF === 'entrada' && fornecedorCnpj) {
                        try {
                            const cleanCnpj = fornecedorCnpj.replace(/\D/g, '');
                            const fornecedores = await configuracoesApi.listarFornecedores().catch(() => []);
                            const matchedForn = fornecedores.find((f: any) => {
                                const docClean = (f.cnpj || f.documento || '').replace(/\D/g, '');
                                return docClean === cleanCnpj;
                            });
                            if (matchedForn) {
                                fornecedorId = matchedForn.id;
                                fornecedorNome = matchedForn.razao_social || matchedForn.nome;
                            }
                        } catch (e) {
                            console.error('Erro ao buscar fornecedor por CNPJ:', e);
                        }
                    }

                    // Também tenta achar o ID do cliente se o documento do destinatário bater no CRM
                    let clienteId = null;
                    const docDest = nfe.destinatario.documento;
                    if (nfe.tipoNF === 'saida' && docDest) {
                        try {
                            const cleanDoc = docDest.replace(/\D/g, '');
                            const clientes = await clientesApi.listar({ q: cleanDoc, limit: 10 }).catch(() => []);
                            const matchedCli = clientes.find((c: any) => {
                                const docClean = (c.documento || '').replace(/\D/g, '');
                                return docClean === cleanDoc;
                            });
                            if (matchedCli) {
                                clienteId = matchedCli.id;
                            }
                        } catch (e) {
                            console.error('Erro ao buscar cliente por documento:', e);
                        }
                    }

                    const novaNotaPayload = {
                        numero_nota: nfe.numero,
                        serie: nfe.serie || '1',
                        chave_acesso: nfe.chaveAcesso,
                        data_emissao: nfe.dataEmissao,
                        fornecedor_id: fornecedorId,
                        cliente_id: clienteId,
                        valor_total: Number(totalNota.toFixed(2)),
                        observacoes: nfe.isPdf ? 'Importada manualmente via PDF' : (nfe.naturezaOperacao ? `Importado XML - Natureza: ${nfe.naturezaOperacao}` : 'Importado XML'),
                        url_pdf: urlPdf || null,
                        focus_payload: {
                            data_emissao: nfe.dataEmissao,
                            nome_entidade: nfe.tipoNF === 'entrada' ? nfe.emitente.nome : nfe.destinatario.nome,
                            raw_xml: nfe.rawXml || "",
                            emitente: { nome: nfe.emitente.nome, cnpj: nfe.emitente.cnpj || "" },
                            destinatario: { nome: nfe.destinatario.nome, documento: nfe.destinatario.documento || "" },
                            items: nfe.itens.map((it) => ({
                                descricao: it.descricao,
                                quantidade: it.quantidade,
                                valor_unitario: it.valorUnitario,
                                valor_total: it.valorTotal,
                                codigo_produto: it.codigo,
                                ncm: it.ncm,
                                cfop: it.cfop
                            }))
                        },
                        focus_response: { importado: true }
                    };

                    await fiscalApi.importar(novaNotaPayload);
                }

                if (nfeActions.criar_financeiro) {
                    await financeiroApi.criar({
                        tipo: nfe.tipoNF === 'saida' ? 'Receita' : 'Despesa',
                        descricao: `NF-e ${nfe.numero}/${nfe.serie} — ${nfe.tipoNF === 'saida' ? nfe.destinatario.nome : nfe.emitente.nome}`,
                        valor: nfe.totalNF,
                        data_vencimento: nfe.dataEmissao,
                        status: 'Pendente',
                        forma_pagamento: 'Outros',
                        centro_de_custo: nfe.naturezaOperacao || null,
                    })
                }

                if (nfeActions.criar_venda) {
                    const itens: Array<{
                        produto_id: string
                        quantidade: number
                        preco_unitario: number
                        desconto: number
                    }> = []
                    for (const item of nfe.itens) {
                        const produtos = await estoqueApi.listarProdutos({ q: item.codigo, limit: 15 })
                        const arr = Array.isArray(produtos) ? produtos : []
                        const prod =
                            arr.find((p: any) => String(p.sku ?? '').trim() === String(item.codigo).trim()) ||
                            arr[0] ||
                            null
                        if (prod) {
                            itens.push({
                                produto_id: prod.id,
                                quantidade: Math.max(1, Math.round(item.quantidade)),
                                preco_unitario: item.valorUnitario,
                                desconto: 0,
                            })
                        }
                    }
                    if (itens.length === 0) throw new Error('Criar venda: nenhum produto do estoque associado aos itens da NF-e.')
                    await api.post('/api/vendas/', {
                        total: nfe.totalNF,
                        status: 'Concluído',
                        forma_pagamento: 'Outros',
                        observacoes: `Importação NF-e ${nfe.numero}/${nfe.serie}`,
                        origem_ml: false,
                        itens,
                    })
                }

                if (nfeActions.atualizar_estoque) {
                    for (const item of nfe.itens) {
                        const produtos = await estoqueApi.listarProdutos({ q: item.codigo, limit: 15 })
                        const arr = Array.isArray(produtos) ? produtos : []
                        const prod =
                            arr.find((p: any) => String(p.sku ?? '').trim() === String(item.codigo).trim()) ||
                            arr[0] ||
                            null
                        if (prod) {
                            const delta = nfe.tipoNF === 'entrada' ? item.quantidade : -item.quantidade
                            const produtoDetalhe: any = await estoqueApi.detalheProduto(prod.id)
                            if (produtoDetalhe) {
                                await estoqueApi.atualizarProduto(prod.id, {
                                    estoque_atual: Math.max(0, (produtoDetalhe.estoque_atual || 0) + Math.round(delta)),
                                })
                            }
                        }
                    }
                }

                log.push({ nf: `NF-e ${nfe.numero}/${nfe.serie}`, status: 'ok', msg: 'Importada com sucesso' })
            } catch (err: any) {
                log.push({ nf: `NF-e ${nfe.numero}/${nfe.serie}`, status: 'erro', msg: err.message })
            }
        }

        setNfeImportLog(log)
        setLoading(false)
        setStep(3)
    }

    const parseData = useCallback((items: any[]) => {
        if (!Array.isArray(items) || items.length === 0) return

        const colsSet = new Set<string>()
        items.forEach(item => {
            if (item && typeof item === 'object') {
                Object.keys(item).forEach(k => colsSet.add(k))
            }
        })
        const cols = Array.from(colsSet)
        setRawData(items)
        setColumns(cols)

        const newMappings: Record<string, string> = {}
        currentSchema.columns.forEach(targetCol => {
            const matches = cols.filter(sourceCol => {
                const s = sourceCol.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                const t = targetCol.target.toUpperCase()
                const l = targetCol.label.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")

                return s === t || s === l || targetCol.hints?.some(h => s.includes(h.normalize("NFD").replace(/[\u0300-\u036f]/g, "")))
            })
            if (matches.length > 0) newMappings[targetCol.target] = matches[0]
        })
        setMappings(newMappings)
        setStep(2)
    }, [currentSchema])

    // ─── Doc Sucata Handlers ──────────────────────────────────────────────────
    const handleDocSucataAnalyze = async () => {
        const text = docSucataRawText.trim()
        if (!text) return
        let extraida: SucataExtraida
        if (docSucataTipo === 'nfe_compra' && text.startsWith('<')) {
            extraida = extractFromNFeXML(text)
        } else {
            extraida = extractFromText(text)
        }
        setDocSucataExtraida(extraida)
        setDocSucataForm({ ...extraida })
        setDocSucataStep(2)
    }

    const handleDocSucataFile = async (file: File) => {
        setDocSucataFileObj(file)
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            try {
                const text = await extractTextFromPDF(file)
                setDocSucataRawText(text)
                // Gera preview da primeira página
                const blob = await pdfToImageBlob(file)
                const url = URL.createObjectURL(blob)
                setDocSucataPreviewUrl(url)
            } catch (err: any) {
                alert(err.message || 'Erro ao processar PDF.')
            }
            return
        }
        if (file.type.startsWith('image/')) {
            setDocSucataPreviewUrl(URL.createObjectURL(file))
        }
        const reader = new FileReader()
        reader.onload = (ev) => {
            const text = ev.target?.result as string
            setDocSucataRawText(text)
        }
        reader.readAsText(file, 'latin1')
    }

    const handleDocSucataSave = async () => {
        if (!docSucataForm.marca || !docSucataForm.modelo) {
            alert('Preencha pelo menos Marca e Modelo antes de salvar.')
            return
        }
        setDocSucataSaving(true)
        try {
            let docUrl: string | null = null

            // Upload do documento se houver
            if (docSucataFile) {
                try {
                    const fd = new FormData()
                    fd.append('file', docSucataFile)
                    const up = await api.postForm('/api/admin/upload-produto-imagem', fd)
                    if (up?.url) docUrl = up.url as string
                } catch (upErr) {
                    console.error('Falha no upload do doc original:', upErr)
                }
            } else if (docSucataPreviewUrl && docSucataPreviewUrl.startsWith('blob:')) {
                try {
                    const blobToUpload = await fetch(docSucataPreviewUrl).then(r => r.blob())
                    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1000)
                    const fd = new FormData()
                    fd.append(
                        'file',
                        new File([blobToUpload], `sucata-doc-${uniqueSuffix}.jpg`, { type: 'image/jpeg' })
                    )
                    const up = await api.postForm('/api/admin/upload-produto-imagem', fd)
                    if (up?.url) docUrl = up.url as string
                } catch (upErr) {
                    console.error('Falha no upload do doc via preview blob:', upErr)
                }
            }

            const payload: any = {
                // Deixamos o codigo vazio para o trigger do banco (updates_v38.sql) gerar automaticamente (SUC-XXXX)
                marca: docSucataForm.marca || '',
                modelo: docSucataForm.modelo || '',
                status: docSucataForm.status || 'Aguardando',
                placa: docSucataForm.placa || null,
                chassi: docSucataForm.chassi || null,
                numero_motor: docSucataForm.numero_motor || null,
                cor: docSucataForm.cor || null,
                combustivel: docSucataForm.combustivel || null,
                km_entrada: docSucataForm.km_entrada || null,
                ano_fabricacao: docSucataForm.ano_fabricacao || null,
                ano_modelo: docSucataForm.ano_modelo || null,
                valor_compra: docSucataForm.valor_compra || 0,
                data_compra: docSucataForm.data_compra || new Date().toISOString().slice(0, 10),
                local_armazenagem: docSucataForm.local_armazenagem || null,
                fornecedor: docSucataForm.fornecedor_nome || null,
                modelo_grupo_peca: docSucataForm.modelo_grupo_peca || null,
                doc_importado_url: docUrl,
                observacoes: [docSucataForm.observacoes, docSucataForm.fornecedor_nome ? `Origem: ${docSucataForm.fornecedor_nome}` : '', docSucataForm.renavam ? `Renavam: ${docSucataForm.renavam}` : ''].filter(Boolean).join('\n') || null,
                condicao: docSucataForm.condicao || null,
            }

            // Insert e pega o codigo gerado de volta
            const saved = await sucatasApi.criar(payload)
            const finalCodigo =
                saved && typeof saved === 'object' && 'codigo' in saved
                    ? String((saved as { codigo?: string }).codigo)
                    : 'SUC-????'
            setDocSucataLog({ status: 'ok', msg: `Sucata ${finalCodigo} criada com sucesso!` })
            setDocSucataStep(3)
        } catch (err: any) {
            setDocSucataLog({ status: 'erro', msg: err?.message || 'Erro ao salvar.' })
            setDocSucataStep(3)
        } finally {
            setDocSucataSaving(false)
        }
    }

    const resetDocSucata = () => {
        setDocSucataTipo(null)
        setDocSucataRawText('')
        setDocSucataExtraida(null)
        setDocSucataForm({ status: 'Aguardando' })
        setDocSucataStep(1)
        setDocSucataLog(null)
    }

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent) => {
        let file: File | undefined
        let allFiles: FileList | null = null
        if ('files' in e.target && e.target.files) {
            allFiles = e.target.files
            file = e.target.files[0]
        } else if ('dataTransfer' in e) {
            e.preventDefault()
            allFiles = e.dataTransfer.files
            file = e.dataTransfer.files[0]
            setIsDragging(false)
        }

        // NF-e: delegate to specialized handler
        if (targetType === 'nfe') {
            handleNFeFiles(allFiles)
            return
        }

        // Doc Sucata: read file as text
        if (targetType === 'doc_sucata' && file) {
            handleDocSucataFile(file)
            return
        }

        if (!file) return

        const fileName = file.name.toLowerCase()
        const reader = new FileReader()

        if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
            reader.onload = async (evt) => {
                const data = evt.target?.result
                const XLSX = await import('xlsx')
                const wb = XLSX.read(data, { type: 'array' })
                const ws = wb.Sheets[wb.SheetNames[0]]
                const json = XLSX.utils.sheet_to_json(ws, { defval: "" })
                parseData(json)
            }
            reader.readAsArrayBuffer(file)
        } else if (fileName.endsWith('.xml')) {
            reader.onload = (evt) => {
                const text = evt.target?.result as string
                const parser = new DOMParser()
                const xmlDoc = parser.parseFromString(text, "text/xml")
                const tags = ['item', 'row', 'registro', 'cliente', 'produto', 'sale', 'det']
                let items: any[] = []
                for (const tag of tags) {
                    const elements = xmlDoc.getElementsByTagName(tag)
                    if (elements.length > 0) {
                        for (let i = 0; i < elements.length; i++) {
                            const obj: any = {}
                            const children = elements[i].children
                            for (let j = 0; j < children.length; j++) obj[children[j].tagName] = children[j].textContent
                            items.push(obj)
                        }
                        break
                    }
                }
                parseData(items)
            }
            reader.readAsText(file)
        } else {
            reader.onload = (event) => {
                try {
                    const text = event.target?.result as string
                    if (text.trim().startsWith('[') || text.trim().startsWith('{')) {
                        const data = JSON.parse(text)
                        parseData(Array.isArray(data) ? data : [data])
                    } else {
                        const lines = text.split('\n').filter(l => l.trim().length > 0)
                        const separator = lines[0].includes('\t') ? '\t' : (lines[0].includes(';') ? ';' : ',')
                        const headers = lines[0].split(separator).map(h => h.trim().replace(/"/g, ''))
                        const data = lines.slice(1).map(line => {
                            const values = line.split(separator).map(v => v.trim().replace(/"/g, ''))
                            return headers.reduce((obj: any, header, i) => {
                                obj[header] = values[i]
                                return obj
                            }, {})
                        })
                        parseData(data)
                    }
                } catch (err) { alert("Erro ao interpretar arquivo.") }
            }
            reader.readAsText(file)
        }
    }

    const handlePaste = (e: React.ClipboardEvent) => {
        const text = e.clipboardData.getData('text')
        try {
            if (text.trim().startsWith('[') || text.trim().startsWith('{')) {
                const data = JSON.parse(text)
                parseData(Array.isArray(data) ? data : [data])
                return
            }
        } catch (err) { }

        const lines = text.split('\n').filter(l => l.trim().length > 0)
        if (lines.length > 1) {
            const separator = lines[0].split('\t').length > 1 ? '\t' : (lines[0].split(';').length > 1 ? ';' : ',')
            const headers = lines[0].split(separator).map(h => h.trim())
            const data = lines.slice(1).map(line => {
                const values = line.split(separator).map(v => v.trim())
                return headers.reduce((obj: any, header, i) => {
                    obj[header] = values[i]
                    return obj
                }, {})
            })
            parseData(data)
        }
    }

    const transformRow = (item: any) => {
        const entry: any = {}
        currentSchema.columns.forEach(col => {
            const sourceKey = mappings[col.target]
            const sourceVal = sourceKey ? item[sourceKey] : undefined

            if (col.type === 'number') {
                if (targetType === 'sucatas' && (col.target === 'ano_fabricacao' || col.target === 'ano_modelo')) {
                    entry[col.target] = parseSucataYearFromCell(
                        sourceVal,
                        col.target as 'ano_fabricacao' | 'ano_modelo'
                    )
                } else if (targetType === 'sucatas' && ['valor_compra', 'valor_frete', 'outros_custos', 'valor_vendido', 'lucro_bruto', 'margem_bruta'].includes(col.target)) {
                    entry[col.target] = parseBrazilianMoney(sourceVal)
                } else {
                    const cleaned = String(sourceVal || '0').replace(/[^\d.,-]/g, '').replace(',', '.')
                    let val = parseFloat(cleaned) || 0
                    if (['estoque_atual', 'preco', 'custo', 'valor'].includes(col.target)) {
                        val = Math.max(0, val)
                    }
                    entry[col.target] = val
                }
            } else if (col.type === 'date') {
                let iso: string | null = null
                if (targetType === 'sucatas') iso = parseBrazilianDateCell(sourceVal)
                if (!iso) {
                    const date = new Date(sourceVal as string | number | Date)
                    iso = isNaN(date.getTime()) ? null : date.toISOString().split('T')[0]
                }
                entry[col.target] = iso
            } else if (col.target === 'tipo' && targetType === 'financeiro') {
                const val = String(sourceVal || '').toUpperCase()
                entry[col.target] = (val.includes('RECEITA') || val.includes('ENTRADA')) ? 'Receita' : 'Despesa'
            } else if (col.target === 'status' && targetType === 'sucatas') {
                const val = String(sourceVal || '').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                if (val.includes('DESMEMBR') || val.includes('DESMONTAG') || val.includes('EM PROCESSO')) {
                    entry[col.target] = 'Em Desmontagem'
                } else if (val.includes('CONCLU') || val.includes('FINALIZ') || val.includes('DONE')) {
                    entry[col.target] = 'Concluída'
                } else if (val.includes('ALIEN') || val.includes('VEND') || val.includes('SOLD')) {
                    entry[col.target] = 'Alienada'
                } else if (val.includes('INATIV')) {
                    entry[col.target] = 'Alienada'
                } else {
                    entry[col.target] = 'Aguardando'
                }
            } else if (col.target === 'fotos' && targetType === 'sucatas' && sourceVal) {
                const urls = parseHttpUrlsFromCell(sourceVal)
                if (urls.length > 0) entry[col.target] = urls
            } else if (col.target === 'imagem_url' && sourceVal) {
                if (targetType === 'estoque') {
                    const urls = parseHttpUrlsFromCell(sourceVal)
                    if (urls.length > 0) {
                        entry[col.target] = urls[0]
                        entry.imagem_urls = urls
                    }
                } else {
                    const urls = parseHttpUrlsFromCell(sourceVal)
                    entry[col.target] = urls.length > 0 ? urls[0] : String(sourceVal).trim()
                }
            } else {
                entry[col.target] = sourceVal || (col.required ? '' : null)
            }
        })
        return entry
    }

    const updateMapping = (target: string, source: string) => {
        setMappings(prev => ({ ...prev, [target]: source }))
    }

    const generatePreview = () => {
        setPreview(rawData.slice(0, 10).map(transformRow))
        setStep(3)
    }

    const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })
    /** Se true, ao reimportar por SKU junta URLs novas às fotos já salvas (não apaga quando a célula vem vazia). */
    const [estoqueMergeFotos, setEstoqueMergeFotos] = useState(true)
    /** Se true, ignora produtos com SKU que já existem no sistema em vez de atualizá-los. */
    const [estoqueIgnorarExistentes, setEstoqueIgnorarExistentes] = useState(true)
    /** Idem para sucatas (upsert por código). */
    const [sucatasMergeFotos, setSucatasMergeFotos] = useState(true)
    /** Descarrega URLs externas e grava cópia no bucket produtos (evita dependência de S3/CDN de terceiros). */
    const [importarCopiarImagensStorage, setImportarCopiarImagensStorage] = useState(true)
    /** Estado de resultado do bulk import rápido */
    const [bulkResult, setBulkResult] = useState<{ inseridos: number; atualizados: number; erros: number; tempo_ms: number } | null>(null)

    /** Importação em massa direta no banco (muito mais rápida para > 1000 registros) */
    const handleBulkImport = async () => {
        if (targetType !== 'estoque') return
        setLoading(true)
        setBulkResult(null)
        setImportProgress({ current: 0, total: rawData.length })
        try {
            // Resolver localizações
            let locMap: Record<string, string> = {}
            if (mappings['localizacao_id']) {
                try {
                    const existingLocs = locaisStore
                    if (Array.isArray(existingLocs)) {
                        existingLocs.forEach((l: { id: string; nome?: string | null; sigla?: string | null }) => {
                            const n = l.nome?.trim()
                            if (n) locMap[n.toUpperCase()] = l.id
                            const sig = l.sigla?.trim()
                            if (sig) locMap[sig.toUpperCase()] = l.id
                        })
                    }
                } catch { /* ignore */ }
            }

            // Transformar e limpar todos os dados
            const finalData = rawData.map(item => {
                const rawEntry = transformRow(item)
                const clean: any = {}
                Object.keys(rawEntry).forEach(key => {
                    let val = rawEntry[key]
                    const colSchema = currentSchema.columns.find(c => c.target === key)
                    if (key === 'localizacao_id' && val && typeof val === 'string') {
                        const trimmed = val.trim()
                        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)
                        if (isUUID) { val = trimmed }
                        else {
                            const normalized = trimmed.toUpperCase()
                            if (locMap[normalized]) val = locMap[normalized]
                            else { if (trimmed) rawEntry.localizacao = rawEntry.localizacao || trimmed; val = null }
                        }
                    }
                    if (key === 'imagem_urls' && Array.isArray(val) && val.length === 0) val = null
                    if (val !== undefined && val !== null && val !== '') clean[key] = val
                    else if (colSchema?.required) clean[key] = colSchema.type === 'number' ? 0 : ''
                    else clean[key] = null
                })
                if (!clean.estoque_minimo) clean.estoque_minimo = 0
                if (clean.sku != null && clean.sku !== '') clean.sku = String(clean.sku).trim()
                if (rawEntry.localizacao && !clean.localizacao) clean.localizacao = rawEntry.localizacao
                if (clean.localizacao_id == null || clean.localizacao_id === '') delete clean.localizacao_id
                const hasUrls = Array.isArray(clean.imagem_urls) && clean.imagem_urls.length > 0
                if (!clean.imagem_url && !hasUrls) { delete clean.imagem_url; delete clean.imagem_urls }
                else { if (hasUrls && !clean.imagem_url) clean.imagem_url = clean.imagem_urls[0]; if (clean.imagem_url && !hasUrls) clean.imagem_urls = [clean.imagem_url] }
                return clean
            })

            // Espelhar imagens externas para o storage antes do bulk insert
            let mirroredData = finalData
            if (importarCopiarImagensStorage) {
                const urlMirrorCache = new Map<string, string>()
                const mirrorStatsTotal: MirrorImportStats = emptyMirrorStats()
                const mirrorAccessToken = getAuthToken() || null
                const MIRROR_BATCH = 50
                const mirrored: Record<string, unknown>[] = []
                for (let i = 0; i < finalData.length; i += MIRROR_BATCH) {
                    const batch = finalData.slice(i, i + MIRROR_BATCH)
                    const batchStats = emptyMirrorStats()
                    const processed = await mirrorEstoquePayload(
                        batch as Record<string, unknown>[],
                        urlMirrorCache,
                        batchStats,
                        mirrorAccessToken
                    )
                    for (const row of processed) mirrored.push(row)
                    mirrorStatsTotal.attempted += batchStats.attempted
                    mirrorStatsTotal.failed += batchStats.failed
                    mirrorStatsTotal.skippedOwn += batchStats.skippedOwn
                    setImportProgress({ current: i + batch.length, total: finalData.length * 2 })
                }
                mirroredData = mirrored as typeof finalData
                if (mirrorStatsTotal.attempted > 0) {
                    console.log(
                        `[BulkImport] Imagens espelhadas: ${mirrorStatsTotal.attempted} tentadas, ` +
                        `${mirrorStatsTotal.attempted - mirrorStatsTotal.failed} ok, ` +
                        `${mirrorStatsTotal.failed} falhas, ` +
                        `${mirrorStatsTotal.skippedOwn} já no storage`
                    )
                }
            }

            // Enviar tudo para a rota bulk do backend em chunks grandes
            const CHUNK = 1000
            let inseridos = 0; let atualizados = 0; let erros = 0; let sent = 0
            for (let i = 0; i < mirroredData.length; i += CHUNK) {
                const batch = mirroredData.slice(i, i + CHUNK)
                const res = await api.post('/api/admin/import-bulk/estoque', {
                    rows: batch,
                    ignorar_existentes: estoqueIgnorarExistentes,
                })
                inseridos += res.inseridos ?? 0
                atualizados += res.atualizados ?? 0
                erros += res.erros ?? 0
                sent += batch.length
                setImportProgress({ current: mirroredData.length + sent, total: mirroredData.length * 2 })
            }
            setBulkResult({ inseridos, atualizados, erros, tempo_ms: 0 })
            alert(`✅ Importação concluída!\n\n${inseridos} inseridos\n${atualizados} atualizados\n${erros} com erro`)
        } catch (err: any) {
            alert('Erro na importação em massa: ' + (err?.message || String(err)))
        } finally {
            setLoading(false)
        }
    }

    const handleImport = async () => {

        setLoading(true)
        setImportProgress({ current: 0, total: 0 })
        try {
            // 0. Resolvendo Localizações (Nome -> ID)
            let locMap: Record<string, string> = {}
            if (targetType === 'estoque' && mappings['localizacao_id']) {
                try {
                    const existingLocs = locaisStore
                    if (Array.isArray(existingLocs)) {
                        existingLocs.forEach((l: { id: string; nome?: string | null; sigla?: string | null }) => {
                            const n = l.nome?.trim()
                            if (n) locMap[n.toUpperCase()] = l.id
                            const sig = l.sigla?.trim()
                            if (sig) locMap[sig.toUpperCase()] = l.id
                        })
                    }
                } catch {
                    /* ignore */
                }
                // Conforme solicitação do usuário, se a localização não existir no sistema, não deve ser criada.
                // Apenas usaremos as que já existem no locMap.
            }

            const finalData = rawData.map(item => {
                const rawEntry = transformRow(item)
                const cleanEntry: any = {}

                Object.keys(rawEntry).forEach(key => {
                    let val = rawEntry[key]
                    const colSchema = currentSchema.columns.find(c => c.target === key)

                    // Aplicar Resolvimento de Localização (evita gravar texto livre em UUID)
                    if (key === 'localizacao_id' && val && typeof val === 'string') {
                        const trimmed = val.trim()
                        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)
                        if (isUUID) {
                            val = trimmed
                        } else {
                            const normalized = trimmed.toUpperCase()
                            if (locMap[normalized]) val = locMap[normalized]
                            else {
                                if (targetType === 'estoque' && trimmed) {
                                    rawEntry.localizacao = rawEntry.localizacao || trimmed
                                }
                                val = null
                            }
                        }
                    }

                    if (key === 'imagem_urls' && Array.isArray(val) && val.length === 0) {
                        val = null
                    }
                    if (key === 'fotos' && Array.isArray(val) && val.length === 0) {
                        val = null
                    }

                    if (val !== undefined && val !== null && val !== '') cleanEntry[key] = val
                    else if (colSchema?.required) cleanEntry[key] = colSchema.type === 'number' ? 0 : ''
                    else cleanEntry[key] = null
                })

                if (targetType === 'financeiro' && !cleanEntry.status) cleanEntry.status = 'Pendente'
                if (targetType === 'estoque') {
                    if (!cleanEntry.estoque_minimo) cleanEntry.estoque_minimo = 0
                    if (cleanEntry.sku != null && cleanEntry.sku !== '') cleanEntry.sku = String(cleanEntry.sku).trim()
                    if (rawEntry.localizacao && !cleanEntry.localizacao) cleanEntry.localizacao = rawEntry.localizacao
                    if (cleanEntry.localizacao_id == null || cleanEntry.localizacao_id === '') delete cleanEntry.localizacao_id
                    const hasUrls = Array.isArray(cleanEntry.imagem_urls) && cleanEntry.imagem_urls.length > 0
                    if (!cleanEntry.imagem_url && !hasUrls) {
                        delete cleanEntry.imagem_url
                        delete cleanEntry.imagem_urls
                    } else {
                        if (hasUrls && !cleanEntry.imagem_url) cleanEntry.imagem_url = cleanEntry.imagem_urls[0]
                        if (cleanEntry.imagem_url && !hasUrls) cleanEntry.imagem_urls = [cleanEntry.imagem_url]
                    }
                }
                // Para clientes sem documento, removemos o campo para evitar conflito de chave única nula
                if (targetType === 'clientes' && !cleanEntry.documento) delete cleanEntry.documento
                // Defaults para sucatas
                if (targetType === 'sucatas') {
                    if (!cleanEntry.status) cleanEntry.status = 'Aguardando'
                    if (!cleanEntry.data_compra) cleanEntry.data_compra = new Date().toISOString().split('T')[0]
                    if (!cleanEntry.valor_compra) cleanEntry.valor_compra = 0
                    if (!cleanEntry.valor_frete) cleanEntry.valor_frete = 0
                    if (!cleanEntry.outros_custos) cleanEntry.outros_custos = 0
                    // ano_modelo fallback para ano_fabricacao se não informado separadamente
                    if (!cleanEntry.ano_modelo && cleanEntry.ano_fabricacao) cleanEntry.ano_modelo = cleanEntry.ano_fabricacao
                    if (!Array.isArray(cleanEntry.fotos) || cleanEntry.fotos.length === 0) {
                        delete cleanEntry.fotos
                    }
                    if (cleanEntry.codigo != null && String(cleanEntry.codigo).trim() !== '') {
                        cleanEntry.codigo = String(cleanEntry.codigo).trim()
                    }
                    const marcaT = String(cleanEntry.marca ?? '').trim()
                    const modeloT = String(cleanEntry.modelo ?? '').trim()
                    if (!marcaT) cleanEntry.marca = 'N/D'
                    if (!modeloT) cleanEntry.modelo = 'N/D'
                    const ver = cleanEntry.versao != null ? String(cleanEntry.versao).trim() : ''
                    if (ver) {
                        const obs = cleanEntry.observacoes != null ? String(cleanEntry.observacoes).trim() : ''
                        cleanEntry.observacoes = obs ? `${obs} | Versão: ${ver}` : `Versão: ${ver}`
                    }
                    delete cleanEntry.versao
                }

                return cleanEntry
            })

            // Separar clientes com e sem documento para upsert correto
            const batchSize = 50 // 50 por lote para balancear velocidade e estabilidade
            let successCount = 0
            let errorCount = 0
            let skippedCount = 0
            const urlMirrorCache = new Map<string, string>()
            const mirrorStatsTotal: MirrorImportStats = emptyMirrorStats()
            let mirrorAccessToken: string | null = null
            if (importarCopiarImagensStorage && (targetType === 'estoque' || targetType === 'sucatas')) {
                const token = getAuthToken() || null
                mirrorAccessToken = token ?? null
            }

            setImportProgress({ current: 0, total: finalData.length })

            for (let i = 0; i < finalData.length; i += batchSize) {
                const batch = finalData.slice(i, i + batchSize)

                if (targetType === 'clientes') {
                    const comDoc = batch.filter(r => r.documento)
                    const semDoc = batch.filter(r => !r.documento)

                    for (const row of comDoc) {
                        try {
                            const listed = await clientesApi.listar({ q: String(row.documento), limit: 30 })
                            const arr = Array.isArray(listed) ? listed : []
                            const found = arr.find(
                                (c: any) =>
                                    String(c.documento ?? '')
                                        .replace(/\D/g, '') === String(row.documento).replace(/\D/g, '')
                            )
                            if (found?.id) await clientesApi.atualizar(found.id, row)
                            else await clientesApi.criar(row)
                            successCount += 1
                        } catch (err) {
                            console.error(`Erro cliente (doc):`, err)
                            errorCount += 1
                        }
                    }

                    for (const row of semDoc) {
                        try {
                            await clientesApi.criar(row)
                            successCount += 1
                        } catch (err) {
                            console.error(`Erro cliente (sem doc):`, err)
                            errorCount += 1
                        }
                    }
                } else if (targetType === 'whatsapp_contatos') {
                    const allContatos = await whatsappApi.listarContatos()
                    const arrContatos = Array.isArray(allContatos) ? allContatos : []

                    for (const row of batch) {
                        try {
                            const tel = normalizeBrazilianPhone(row.telefone)
                            if (!tel) {
                                errorCount += 1
                                continue
                            }

                            const found = arrContatos.find((c: any) => String(c.telefone || "").replace(/\D/g, "") === tel)
                            if (found?.id) {
                                await whatsappApi.atualizarContato(found.id, row)
                            } else {
                                await whatsappApi.criarContato(row)
                            }
                            successCount += 1
                        } catch (err) {
                            console.error("Erro importando contato whatsapp:", err)
                            errorCount += 1
                        }
                    }
                } else {
                    let payload: typeof batch = batch
                    if (targetType === 'estoque') {
                        let mapEx: Map<string, { imagem_url?: string | null; imagem_urls?: unknown }> | undefined
                        if (estoqueMergeFotos) {
                            const skus = [...new Set(batch.map(r => r.sku).filter(Boolean))] as string[]
                            mapEx = new Map()
                            for (const sku of skus) {
                                try {
                                    const r = await estoqueApi.listarProdutos({
                                        sku: String(sku).trim(),
                                        limit: 15,
                                        painel: true,
                                    })
                                    const items =
                                        r && typeof r === 'object' && 'items' in r
                                            ? (r as { items: any[] }).items
                                            : []
                                    const hit = items.find(
                                        (p: any) => String(p.sku ?? '').trim() === String(sku).trim()
                                    )
                                    if (hit) mapEx.set(String(sku), { imagem_url: hit.imagem_url, imagem_urls: hit.imagem_urls })
                                } catch {
                                    /* ignore */
                                }
                            }
                        }
                        payload = batch.map(row =>
                            aplicarImagensEstoqueParaUpsert(
                                row as Record<string, unknown>,
                                mapEx?.get(String(row.sku)),
                                estoqueMergeFotos
                            ) as (typeof batch)[number]
                        )
                    } else if (targetType === 'sucatas') {
                        let mapSuc: Map<string, { fotos?: unknown }> | undefined
                        if (sucatasMergeFotos) {
                            const codigos = [...new Set(batch.map(r => r.codigo).filter(Boolean))] as string[]
                            mapSuc = new Map()
                            for (const cod of codigos) {
                                try {
                                    const rows = await sucatasApi.listar({ q: String(cod).trim(), limit: 40 })
                                    const arr = Array.isArray(rows) ? rows : []
                                    const hit = arr.find(
                                        (s: any) => String(s.codigo ?? '').trim() === String(cod).trim()
                                    )
                                    if (hit) mapSuc.set(String(cod), { fotos: hit.fotos })
                                } catch {
                                    /* ignore */
                                }
                            }
                        }
                        const mapped = batch.map(row =>
                            aplicarFotosSucataParaUpsert(
                                row as Record<string, unknown>,
                                mapSuc?.get(String(row.codigo)),
                                sucatasMergeFotos
                            ) as (typeof batch)[number]
                        )
                        const nAntes = mapped.length
                        payload = dedupeSucatasBatchByCodigo(mapped as Record<string, unknown>[]) as (typeof batch)[number][]
                        if (payload.length < nAntes) {
                            console.warn(
                                `[Import sucatas] ${nAntes - payload.length} linha(s) com código repetido no mesmo lote — foi mantida a última ocorrência de cada código.`
                            )
                        }
                    }

                    if (importarCopiarImagensStorage && (targetType === 'estoque' || targetType === 'sucatas')) {
                        const batchStats = emptyMirrorStats()
                        if (targetType === 'estoque') {
                            payload = (await mirrorEstoquePayload(
                                payload as Record<string, unknown>[],
                                urlMirrorCache,
                                batchStats,
                                mirrorAccessToken
                            )) as typeof batch
                        } else {
                            payload = (await mirrorSucataPayload(
                                payload as Record<string, unknown>[],
                                urlMirrorCache,
                                batchStats,
                                mirrorAccessToken
                            )) as typeof batch
                        }
                        mirrorStatsTotal.attempted += batchStats.attempted
                        mirrorStatsTotal.failed += batchStats.failed
                        mirrorStatsTotal.skippedOwn += batchStats.skippedOwn
                    }

                    for (const row of payload) {
                        try {
                            if (targetType === 'financeiro') {
                                await financeiroApi.criar(row as Record<string, unknown>)
                            } else if (targetType === 'estoque') {
                                const r = await estoqueApi.listarProdutos({
                                    sku: String(row.sku).trim(),
                                    limit: 20,
                                    painel: true,
                                })
                                const items =
                                    r && typeof r === 'object' && 'items' in r
                                        ? (r as { items: any[] }).items
                                        : []
                                const hit = items.find(
                                    (p: any) => String(p.sku ?? '').trim() === String(row.sku).trim()
                                )
                                if (hit?.id) {
                                    if (estoqueIgnorarExistentes) {
                                        skippedCount += 1
                                        continue
                                    }
                                    await estoqueApi.atualizarProduto(hit.id, row as Record<string, unknown>)
                                } else {
                                    await estoqueApi.criarProduto(row as Record<string, unknown>)
                                }
                            } else if (targetType === 'sucatas') {
                                const rows = await sucatasApi.listar({
                                    q: String(row.codigo ?? '').trim(),
                                    limit: 40,
                                })
                                const arr = Array.isArray(rows) ? rows : []
                                const hit = arr.find(
                                    (s: any) =>
                                        String(s.codigo ?? '').trim() === String(row.codigo ?? '').trim()
                                )
                                if (hit?.id) await sucatasApi.atualizar(hit.id, row as Record<string, unknown>)
                                else await sucatasApi.criar(row as Record<string, unknown>)
                            } else if (targetType === 'catalogo') {
                                const listed = await catalogoApi.listarPecas({ q: String(row.sku), limit: 10 })
                                const arr = Array.isArray(listed) ? listed : []
                                const hit = arr.find((p: any) => String(p.sku || "").trim() === String(row.sku).trim())
                                if (hit?.id) await catalogoApi.atualizarPeca(hit.id, row as Record<string, unknown>)
                                else await catalogoApi.criarPeca(row as Record<string, unknown>)
                            } else {
                                errorCount += 1
                                continue
                            }
                            successCount += 1
                        } catch (err) {
                            console.error(`Erro no lote ${i}-${i + batchSize}:`, err)
                            errorCount += 1
                        }
                    }
                }

                setImportProgress({ current: Math.min(i + batchSize, finalData.length), total: finalData.length })

                // Pequena pausa entre lotes para não sobrecarregar a API
                await new Promise(r => setTimeout(r, 100))
            }

            const mirrorHint =
                importarCopiarImagensStorage &&
                    (targetType === 'estoque' || targetType === 'sucatas') &&
                    mirrorStatsTotal.failed > 0
                    ? `\n\n📷 Imagens: ${mirrorStatsTotal.failed} URL(s) externa(s) não puderam ser copiadas (rede, limite 10MB ou backend indisponível) — foi mantido o link original. Inicie o backend (VITE_API_URL) para o proxy contornar CORS.`
                    : ""

            const skipHint = skippedCount > 0 ? `\n⚠️ ${skippedCount} produtos com SKU existente foram ignorados (não alterados).` : ""

            if (errorCount > 0) {
                alert(`⚠️ Importação concluída com avisos!\n✅ ${successCount} registros importados com sucesso.\n❌ ${errorCount} registros falharam (verifique o console para detalhes).${skipHint}${mirrorHint}`)
            } else {
                alert(`✅ Sucesso! ${successCount} registros importados.${skipHint}${mirrorHint}`)
            }
            setStep(1); setRawData([]); setMappings({}); setImportProgress({ current: 0, total: 0 })
        } catch (err: any) {
            console.error("ERRO:", err)
            alert("❌ Erro: " + (err.message || "Verifique os dados."))
        } finally { setLoading(false) }
    }

    return (
        <div className="space-y-6 max-w-6xl mx-auto pb-20 p-4">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                    <h1 className="text-4xl font-black uppercase flex items-center gap-3">
                        <div className="bg-primary text-white p-2 rounded-xl shadow-lg ring-4 ring-primary/20"><Database className="w-8 h-8" /></div>
                        <span>Importador <span className="text-primary italic">Inteligente</span></span>
                    </h1>
                    <p className="text-muted-foreground mt-2 font-medium">Excel, CSV, XML ou Paste do Clipboard.</p>
                </div>
                <div className="flex bg-muted p-1 rounded-full shadow-inner">
                    {[1, 2, 3].map(s => (
                        <div key={s} className={cn("px-4 py-1.5 rounded-full text-[10px] font-black uppercase transition-all flex items-center gap-2", step === s ? "bg-white text-primary shadow-sm scale-105" : "text-muted-foreground opacity-50")}>
                            <div className={cn("w-4 h-4 rounded-full flex items-center justify-center text-[8px]", step === s ? "bg-primary text-white" : "bg-muted-foreground/20")}>{s}</div>
                            {s === 1 ? "Origem" : s === 2 ? "Filtro" : "Pronto"}
                        </div>
                    ))}
                </div>
            </div>

            {step === 1 && (
                <div className="space-y-8 animate-in fade-in duration-500">
                    <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4">
                        {(Object.keys(SCHEMAS) as TargetType[]).map(key => {
                            const Icon = SCHEMAS[key].icon
                            const act = targetType === key
                            return (
                                <button key={key} onClick={() => { setTargetType(key); setStep(1); setNfeList([]); setRawData([]); resetDocSucata() }} className={cn("relative group flex flex-col items-center justify-center p-6 rounded-[2rem] border-2 transition-all", act ? "border-primary bg-background shadow-xl scale-105" : "border-transparent bg-muted/30 opacity-60")}>
                                    <div className={cn("p-3 rounded-2xl mb-2", act ? "bg-primary text-white shadow-lg shadow-primary/30" : "bg-muted text-muted-foreground")}><Icon className="w-7 h-7" /></div>
                                    <span className="font-black text-[9px] uppercase tracking-widest text-center leading-tight">{SCHEMAS[key].label}</span>
                                </button>
                            )
                        })}
                    </div>

                    {/* ── Documento Sucata: Seleção de tipo + upload/paste ─────── */}
                    {targetType === 'doc_sucata' ? (
                        <div className="space-y-6">
                            {/* Escolha do tipo de documento */}
                            <div>
                                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">Tipo de Documento</p>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {([
                                        { key: 'nfe_compra' as DocSucataTipo, icon: Receipt, label: 'NF-e de Compra', desc: 'XML padrão NF-e/SEFAZ', color: 'indigo' },
                                        { key: 'leilao_doc' as DocSucataTipo, icon: Sparkles, label: 'Nota de Leilão', desc: 'Auto-reconhece campos de leilão', color: 'violet' },
                                        { key: 'baixa_veiculo' as DocSucataTipo, icon: FileText, label: 'Baixa de Veículo', desc: 'Certidão DETRAN/RENAVE', color: 'blue' },
                                        { key: 'nota_compra' as DocSucataTipo, icon: ClipboardList, label: 'Nota / Recibo', desc: 'Contrato ou laudo livre', color: 'emerald' },
                                        { key: 'laudo' as DocSucataTipo, icon: Info, label: 'Laudo de Vistoria', desc: 'Vistoria técnica do veículo', color: 'amber' },
                                    ] as const).map(opt => {
                                        const Icon = opt.icon
                                        const act = docSucataTipo === opt.key
                                        return (
                                            <button key={opt.key} onClick={() => setDocSucataTipo(opt.key)}
                                                className={cn("flex flex-col items-start p-4 rounded-[1.5rem] border-2 text-left transition-all gap-2", act ? "border-rose-500 bg-rose-50 shadow-xl" : "border-muted-foreground/10 bg-muted/20 hover:bg-muted/40")}>
                                                <div className={cn("p-2 rounded-xl", act ? "bg-rose-500 text-white" : "bg-muted text-muted-foreground")}><Icon className="w-5 h-5" /></div>
                                                <span className="font-black text-xs">{opt.label}</span>
                                                <span className="text-[10px] text-muted-foreground leading-tight">{opt.desc}</span>
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                            {docSucataTipo && (
                                <div className="space-y-4">
                                    <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                                        {docSucataTipo === 'nfe_compra' ? 'Cole o conteúdo do XML da NF-e ou selecione o arquivo:' : 'Cole o texto copiado do documento (PDF, foto, etc.) ou selecione um arquivo:'}
                                    </p>
                                    <div className="flex gap-3 flex-wrap">
                                        <label className="cursor-pointer">
                                            <div className="px-6 py-2.5 bg-rose-600 text-white shadow-lg rounded-full text-xs font-black hover:bg-rose-700 transition-all flex items-center gap-2">
                                                <Upload className="w-4 h-4" /> Selecionar arquivo
                                            </div>
                                            <input type="file" accept=".xml,.txt,.pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => { if (e.target.files?.[0]) handleDocSucataFile(e.target.files[0]) }} />
                                        </label>
                                    </div>
                                    <textarea
                                        className="w-full h-48 p-4 text-xs bg-white/80 backdrop-blur-xl rounded-[1.5rem] border-2 border-transparent focus:border-rose-300 outline-none font-mono resize-none transition-all shadow-inner"
                                        placeholder={docSucataTipo === 'nfe_compra'
                                            ? 'Cole aqui o XML da Nota Fiscal Eletrônica...'
                                            : 'Cole aqui o texto copiado do documento (PDF, imagem digitada, etc.)...\n\nExemplo:\nPlaca: ABC-1234\nChassi: 9BWZZZ377VT004251\nMarca: Volkswagen  Modelo: Gol\nAno: 2008/2009  Cor: Prata\nKM: 180.000\nValor: R$ 12.500,00'}
                                        value={docSucataRawText}
                                        onChange={e => setDocSucataRawText(e.target.value)}
                                    />
                                    <Button onClick={handleDocSucataAnalyze} disabled={!docSucataRawText.trim()} className="rounded-full bg-rose-600 hover:bg-rose-700 text-white font-black px-8">
                                        <Sparkles className="w-4 h-4 mr-2" /> Analisar Documento
                                    </Button>
                                </div>
                            )}
                            <Card className="border-rose-200 bg-rose-50/50">
                                <CardContent className="p-5">
                                    <h4 className="font-black text-rose-700 text-sm mb-2 flex items-center gap-2"><Info className="w-4 h-4" /> Como funciona?</h4>
                                    <ul className="text-xs text-rose-900/80 space-y-1 font-medium">
                                        <li>• Selecione o tipo de documento e cole/importe o conteúdo</li>
                                        <li>• O sistema extrai placa, chassi, marca, modelo, ano, cor, KM, valor e data automaticamente</li>
                                        <li>• Você revisa e corrige os dados antes de salvar</li>
                                        <li>• Suporta XML NF-e, texto de baixa de veículo (DETRAN), laudos e recibos</li>
                                    </ul>
                                </CardContent>
                            </Card>
                        </div>
                    ) : targetType === 'nfe' ? (
                        <div className="space-y-6">
                            <div onDragOver={e => { e.preventDefault(); setIsDragging(true) }} onDragLeave={() => setIsDragging(false)} onDrop={e => { e.preventDefault(); setIsDragging(false); handleNFeFiles(e.dataTransfer.files) }}
                                className={cn("relative overflow-hidden border-4 border-dashed rounded-[3rem] transition-all p-12 text-center", isDragging ? "border-indigo-500 bg-indigo-50 scale-[1.01]" : "border-muted-foreground/10 bg-muted/20")}>
                                <div className="flex flex-col items-center space-y-5">
                                    <div className="w-20 h-20 rounded-3xl bg-indigo-600 flex items-center justify-center shadow-xl rotate-3">
                                        <Receipt className="w-10 h-10 text-white" />
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-black italic tracking-tighter uppercase text-indigo-700">Importar NF-e XML / PDF</h3>
                                        <p className="text-muted-foreground text-sm font-medium mt-1">Selecione um ou mais arquivos XML ou PDF de Nota Fiscal Eletrônica</p>
                                    </div>
                                    <label className="cursor-pointer">
                                        <div className="px-10 py-4 bg-indigo-600 text-white shadow-xl rounded-full text-sm font-black hover:bg-indigo-700 transition-all flex items-center gap-3">
                                            <FileText className="w-5 h-5" /> Selecionar XML/PDF de NF-e
                                        </div>
                                        <input type="file" accept=".xml,.pdf" multiple className="hidden" onChange={e => handleNFeFiles(e.target.files)} />
                                    </label>
                                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Ou arraste os arquivos aqui</p>
                                </div>
                            </div>
                            <Card className="border-indigo-200 bg-indigo-50/50">
                                <CardContent className="p-6">
                                    <h4 className="font-black text-indigo-700 text-sm mb-3 flex items-center gap-2"><Info className="w-4 h-4" /> O que este importador faz?</h4>
                                    <ul className="text-xs text-indigo-900/80 space-y-1.5 font-medium">
                                        <li>• Lê os dados do XML (SEFAZ) ou extrai texto de PDF (DANFE)</li>
                                        <li>• Permite escolher se vai gerar conta financeira, venda e/ou movimentação de estoque</li>
                                        <li>• Salva o documento em <strong>Fiscal → NF-e</strong> para consulta futura</li>
                                        <li>• Suporta múltiplos arquivos de uma vez</li>
                                    </ul>
                                </CardContent>
                            </Card>
                        </div>
                    ) : (
                        <div onDragOver={e => { e.preventDefault(); setIsDragging(true) }} onDragLeave={() => setIsDragging(false)} onDrop={handleFileUpload}
                            className={cn("relative overflow-hidden group border-4 border-dashed rounded-[3rem] transition-all p-12 text-center", isDragging ? "border-primary bg-primary/5 scale-[1.01]" : "border-muted-foreground/10 bg-muted/20")}>
                            <div className="flex flex-col items-center space-y-6">
                                <div className="relative w-20 h-20 rounded-3xl bg-primary flex items-center justify-center shadow-xl rotate-3"><Upload className="w-10 h-10 text-white" /></div>
                                <div>
                                    <h3 className="text-2xl font-black italic tracking-tighter uppercase">Solte seu arquivo aqui</h3>
                                    <p className="text-muted-foreground text-sm font-medium mt-1 uppercase tracking-widest text-[10px]">Excel, CSV, XML ou clique para selecionar</p>
                                </div>
                                <div className="flex gap-4">
                                    <label className="cursor-pointer group"><div className="px-8 py-3 bg-white shadow-xl border rounded-full text-xs font-black hover:bg-primary hover:text-white transition-all flex items-center gap-3"><FileSpreadsheet className="w-5 h-5" /> EXCEL</div><input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileUpload} /></label>
                                    <label className="cursor-pointer group"><div className="px-8 py-3 bg-white shadow-xl border rounded-full text-xs font-black hover:bg-primary hover:text-white transition-all flex items-center gap-3"><FileCode className="w-5 h-5" /> XML / CSV</div><input type="file" accept=".xml,.csv" className="hidden" onChange={handleFileUpload} /></label>
                                </div>
                                <div className="w-full max-w-xl space-y-4 pt-4">
                                    <div className="relative"><div className="absolute inset-0 flex items-center"><span className="w-full border-t border-muted-foreground/20" /></div><div className="relative flex justify-center text-[9px] font-black uppercase tracking-widest"><span className="bg-muted px-4 text-muted-foreground">Ou Copie e Cole do Excel / PDF</span></div></div>
                                    <textarea className="w-full h-32 p-4 text-xs bg-white/50 backdrop-blur-xl rounded-[2rem] border-2 border-transparent focus:border-primary/30 outline-none font-mono resize-none transition-all shadow-inner"
                                        placeholder="Copie as células da sua planilha e cole aqui..." onPaste={handlePaste} />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── NF-e Step 2: Preview + Ações ───────────────────────────── */}
            {step === 2 && targetType === 'nfe' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-10 duration-500">
                    {/* Action selector */}
                    <Card className="border-indigo-200">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-black text-indigo-700 flex items-center gap-2">
                                <BarChart2 className="w-4 h-4" /> O que fazer com as NF-e importadas?
                            </CardTitle>
                            <CardDescription className="text-xs">Selecione uma ou mais opções. "Salvar documento" é sempre executado.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                {([
                                    { key: 'salvar_documento', icon: FileText, label: 'Salvar Documento', desc: 'Registra em Fiscal → NF-e', color: 'indigo', disabled: true },
                                    { key: 'criar_financeiro', icon: Wallet, label: 'Criar Lançamento Financeiro', desc: 'Gera receita ou despesa no financeiro', color: 'purple', disabled: false },
                                    { key: 'criar_venda', icon: ShoppingCart, label: 'Criar Venda', desc: 'Cria venda com itens (por SKU)', color: 'emerald', disabled: false },
                                    { key: 'atualizar_estoque', icon: Package, label: 'Movimentar Estoque', desc: 'Entrada/saída de estoque por SKU', color: 'orange', disabled: false },
                                ] as const).map(opt => {
                                    const Icon = opt.icon
                                    const active = nfeActions[opt.key as keyof NFeActions]
                                    return (
                                        <button
                                            key={opt.key}
                                            type="button"
                                            disabled={opt.disabled}
                                            onClick={() => !opt.disabled && setNfeActions(prev => ({ ...prev, [opt.key]: !prev[opt.key as keyof NFeActions] }))}
                                            className={cn(
                                                "flex flex-col items-start gap-2 p-4 rounded-2xl border-2 text-left transition-all",
                                                active ? `border-${opt.color}-500 bg-${opt.color}-50` : "border-muted bg-muted/20 opacity-60",
                                                opt.disabled && "cursor-default opacity-100"
                                            )}
                                        >
                                            <div className={cn("p-2 rounded-xl", active ? `bg-${opt.color}-500 text-white` : "bg-muted text-muted-foreground")}>
                                                <Icon className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <p className="text-xs font-black">{opt.label}</p>
                                                <p className="text-[10px] text-muted-foreground mt-0.5">{opt.desc}</p>
                                            </div>
                                            {active && <Check className="w-3.5 h-3.5 text-green-500 ml-auto" />}
                                            {opt.disabled && <Badge className="text-[8px] py-0 bg-indigo-100 text-indigo-700 border-indigo-200">Sempre</Badge>}
                                        </button>
                                    )
                                })}
                            </div>
                        </CardContent>
                    </Card>

                    {/* NF-e list */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="font-black text-sm flex items-center gap-2"><Receipt className="w-4 h-4 text-indigo-500" /> {nfeList.length} NF-e{nfeList.length !== 1 ? 's' : ''} carregada{nfeList.length !== 1 ? 's' : ''}</h3>
                            <label className="cursor-pointer">
                                <div className="px-4 py-2 border rounded-full text-xs font-bold flex items-center gap-2 hover:bg-muted transition-all">
                                    <FileText className="w-3.5 h-3.5" /> Adicionar mais XMLs/PDFs
                                </div>
                                <input type="file" accept=".xml,.pdf" multiple className="hidden" onChange={e => handleNFeFiles(e.target.files)} />
                            </label>
                        </div>

                        {nfeList.map((nfe, idx) => {
                            const expanded = nfeExpandedIdx === idx
                            return (
                                <Card key={idx} className="border-border/60 overflow-hidden">
                                    <div
                                        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                                        onClick={() => setNfeExpandedIdx(expanded ? null : idx)}
                                    >
                                        <div className="flex items-center gap-3">
                                            {expanded ? <ChevronDown className="w-4 h-4 text-indigo-500" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-black text-sm">NF-e {nfe.numero}/{nfe.serie}</span>
                                                    <Badge className={cn("text-[9px] py-0", nfe.tipoNF === 'entrada' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700')}>
                                                        {nfe.tipoNF === 'entrada' ? '↓ Entrada' : '↑ Saída'}
                                                    </Badge>
                                                    {nfe.isPdf && <Badge className="text-[9px] py-0 bg-red-100 text-red-700">PDF</Badge>}
                                                    {nfe.parsedWithLowConfidence && <Badge className="text-[9px] py-0 bg-yellow-100 text-yellow-800">⚠️ Revisão</Badge>}
                                                </div>
                                                <p className="text-xs text-muted-foreground">{nfe.emitente.nome} → {nfe.destinatario.nome} · {nfe.dataEmissao}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="text-right">
                                                <p className="text-[10px] text-muted-foreground">Total</p>
                                                <p className="font-black text-sm text-emerald-600">{fmt(nfe.totalNF)}</p>
                                            </div>
                                            <button type="button" onClick={e => { e.stopPropagation(); setNfeList(prev => prev.filter((_, i) => i !== idx)) }} className="p-1.5 text-destructive hover:bg-destructive/10 rounded-lg transition-colors">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                    {expanded && (
                                        <div className="border-t border-border/40 bg-muted/10 p-5 space-y-5">
                                            {nfe.parsedWithLowConfidence && (
                                                <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-3 rounded-xl text-xs font-medium">
                                                    ⚠️ Dados extraídos com baixa confiança do PDF. Verifique e corrigja antes de importar.
                                                </div>
                                            )}
                                            {/* Form para edição de cabeçalho da nota */}
                                            <div className="bg-white p-4 rounded-2xl border space-y-3">
                                                <h4 className="text-xs font-black uppercase text-indigo-700 flex items-center gap-2"><Pencil className="w-3.5 h-3.5" /> Dados da Nota Fiscal</h4>
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                    <div>
                                                        <label className="text-[10px] font-bold uppercase text-muted-foreground">Número</label>
                                                        <input type="text" className="w-full mt-1 p-2 text-xs border rounded-xl" value={nfe.numero} onChange={e => {
                                                            const val = e.target.value;
                                                            setNfeList(prev => prev.map((item, i) => i === idx ? { ...item, numero: val } : item))
                                                        }} />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-bold uppercase text-muted-foreground">Série</label>
                                                        <input type="text" className="w-full mt-1 p-2 text-xs border rounded-xl" value={nfe.serie} onChange={e => {
                                                            const val = e.target.value;
                                                            setNfeList(prev => prev.map((item, i) => i === idx ? { ...item, serie: val } : item))
                                                        }} />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-bold uppercase text-muted-foreground">Chave de Acesso</label>
                                                        <input type="text" className="w-full mt-1 p-2 text-xs border rounded-xl" value={nfe.chaveAcesso} onChange={e => {
                                                            const val = e.target.value;
                                                            setNfeList(prev => prev.map((item, i) => i === idx ? { ...item, chaveAcesso: val } : item))
                                                        }} />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-bold uppercase text-muted-foreground">Data Emissão</label>
                                                        <input type="date" className="w-full mt-1 p-2 text-xs border rounded-xl" value={nfe.dataEmissao} onChange={e => {
                                                            const val = e.target.value;
                                                            setNfeList(prev => prev.map((item, i) => i === idx ? { ...item, dataEmissao: val } : item))
                                                        }} />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-bold uppercase text-muted-foreground">Tipo da Nota</label>
                                                        <select className="w-full mt-1 p-2 text-xs border rounded-xl bg-white" value={nfe.tipoNF} onChange={e => {
                                                            const val = e.target.value as 'entrada' | 'saida';
                                                            setNfeList(prev => prev.map((item, i) => i === idx ? { ...item, tipoNF: val } : item))
                                                        }}>
                                                            <option value="entrada">Entrada (Compra)</option>
                                                            <option value="saida">Saída (Venda)</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-bold uppercase text-muted-foreground">Emitente Nome</label>
                                                        <input type="text" className="w-full mt-1 p-2 text-xs border rounded-xl" value={nfe.emitente.nome} onChange={e => {
                                                            const val = e.target.value;
                                                            setNfeList(prev => prev.map((item, i) => i === idx ? { ...item, emitente: { ...item.emitente, nome: val } } : item))
                                                        }} />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-bold uppercase text-muted-foreground">Destinatário Nome</label>
                                                        <input type="text" className="w-full mt-1 p-2 text-xs border rounded-xl" value={nfe.destinatario.nome} onChange={e => {
                                                            const val = e.target.value;
                                                            setNfeList(prev => prev.map((item, i) => i === idx ? { ...item, destinatario: { ...item.destinatario, nome: val } } : item))
                                                        }} />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-bold uppercase text-muted-foreground">Destinatário CPF/CNPJ</label>
                                                        <input type="text" className="w-full mt-1 p-2 text-xs border rounded-xl" value={nfe.destinatario.documento} onChange={e => {
                                                            const val = e.target.value;
                                                            setNfeList(prev => prev.map((item, i) => i === idx ? { ...item, destinatario: { ...item.destinatario, documento: val } } : item))
                                                        }} />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-bold uppercase text-muted-foreground">Valor Total (R$)</label>
                                                        <input type="number" step="0.01" className="w-full mt-1 p-2 text-xs border rounded-xl" value={nfe.totalNF} onChange={e => {
                                                            const val = parseFloat(e.target.value) || 0;
                                                            setNfeList(prev => prev.map((item, i) => i === idx ? { ...item, totalNF: val } : item))
                                                        }} />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Tabela de itens */}
                                            <div className="bg-white p-4 rounded-2xl border space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <h4 className="text-xs font-black uppercase text-indigo-700">Itens / Produtos</h4>
                                                    <Button variant="outline" size="sm" className="h-7 text-[10px] rounded-full" onClick={() => {
                                                        setNfeList(prev => prev.map((item, i) => i === idx ? {
                                                            ...item,
                                                            itens: [...item.itens, { codigo: '', descricao: '', quantidade: 1, unidade: 'UN', valorUnitario: 0, valorTotal: 0, ncm: '', cfop: '' }]
                                                        } : item))
                                                    }}>+ Adicionar Item</Button>
                                                </div>
                                                
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow className="border-border/30">
                                                            <TableHead className="text-[9px] font-black py-2">Código</TableHead>
                                                            <TableHead className="text-[9px] font-black py-2">Descrição</TableHead>
                                                            <TableHead className="text-[9px] font-black py-2 text-right">Qtd</TableHead>
                                                            <TableHead className="text-[9px] font-black py-2 text-right">Vl. Unit.</TableHead>
                                                            <TableHead className="text-[9px] font-black py-2 text-right">Total</TableHead>
                                                            <TableHead className="text-[9px] font-black py-2 text-right">Ação</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {nfe.itens.map((item, itemIdx) => (
                                                            <TableRow key={itemIdx} className="border-border/20">
                                                                <TableCell className="py-2"><input type="text" className="w-16 p-1 text-[10px] border rounded" value={item.codigo} onChange={e => {
                                                                    const val = e.target.value;
                                                                    setNfeList(prev => prev.map((n, i) => i === idx ? {
                                                                        ...n,
                                                                        itens: n.itens.map((it, j) => j === itemIdx ? { ...it, codigo: val } : it)
                                                                    } : n))
                                                                }} /></TableCell>
                                                                <TableCell className="py-2"><input type="text" className="w-full max-w-[240px] p-1 text-[10px] border rounded" value={item.descricao} onChange={e => {
                                                                    const val = e.target.value;
                                                                    setNfeList(prev => prev.map((n, i) => i === idx ? {
                                                                        ...n,
                                                                        itens: n.itens.map((it, j) => j === itemIdx ? { ...it, descricao: val } : it)
                                                                    } : n))
                                                                }} /></TableCell>
                                                                <TableCell className="py-2 text-right"><input type="number" className="w-12 p-1 text-[10px] border rounded text-right" value={item.quantidade} onChange={e => {
                                                                    const val = parseFloat(e.target.value) || 0;
                                                                    setNfeList(prev => prev.map((n, i) => i === idx ? {
                                                                        ...n,
                                                                        itens: n.itens.map((it, j) => j === itemIdx ? { ...it, quantidade: val, valorTotal: Number((val * it.valorUnitario).toFixed(2)) } : it)
                                                                    } : n))
                                                                }} /></TableCell>
                                                                <TableCell className="py-2 text-right"><input type="number" step="0.01" className="w-16 p-1 text-[10px] border rounded text-right" value={item.valorUnitario} onChange={e => {
                                                                    const val = parseFloat(e.target.value) || 0;
                                                                    setNfeList(prev => prev.map((n, i) => i === idx ? {
                                                                        ...n,
                                                                        itens: n.itens.map((it, j) => j === itemIdx ? { ...it, valorUnitario: val, valorTotal: Number((it.quantidade * val).toFixed(2)) } : it)
                                                                    } : n))
                                                                }} /></TableCell>
                                                                <TableCell className="py-2 text-right font-bold">{fmt(item.valorTotal)}</TableCell>
                                                                <TableCell className="py-2 text-right">
                                                                    <button type="button" onClick={() => {
                                                                        setNfeList(prev => prev.map((n, i) => i === idx ? {
                                                                            ...n,
                                                                            itens: n.itens.filter((_, j) => j !== itemIdx)
                                                                        } : n))
                                                                    }} className="text-destructive hover:bg-destructive/10 p-1 rounded">
                                                                        <Trash2 className="w-3 h-3" />
                                                                    </button>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                                
                                                <div className="flex justify-end gap-6 pt-2 text-xs text-muted-foreground">
                                                    <span>Total NF: <strong className="text-emerald-600 text-sm">{fmt(nfe.totalNF)}</strong></span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </Card>
                            )
                        })}
                    </div>

                    <div className="flex gap-3 justify-between pt-2">
                        <Button variant="ghost" onClick={() => { setStep(1); setNfeList([]) }} className="rounded-full px-8">Voltar</Button>
                        <Button
                            className="rounded-full px-10 h-12 bg-indigo-600 hover:bg-indigo-700 font-black uppercase text-xs shadow-xl"
                            onClick={handleNFeImport}
                            disabled={loading || nfeList.length === 0}
                        >
                            {loading ? 'Importando...' : `Confirmar e Importar ${nfeList.length} NF-e`}
                            <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                    </div>
                </div>
            )}

            {/* ── NF-e Step 3: Result ─────────────────────────────────────── */}
            {step === 3 && targetType === 'nfe' && (
                <div className="animate-in fade-in zoom-in-95 duration-500 space-y-4">
                    <Card className={cn("border-none shadow-2xl rounded-[3rem] overflow-hidden", nfeImportLog.every(l => l.status === 'ok') ? "bg-emerald-500" : "bg-amber-500")}>
                        <div className="p-10 text-white flex items-center gap-5">
                            <div className="w-20 h-20 bg-white/20 rounded-[2rem] flex items-center justify-center backdrop-blur-md shadow-2xl">
                                <Check className="w-10 h-10" />
                            </div>
                            <div>
                                <h2 className="text-3xl font-black italic uppercase">
                                    {nfeImportLog.filter(l => l.status === 'ok').length} NF-e(s) importadas
                                </h2>
                                <p className="opacity-90 font-medium text-sm">
                                    {nfeImportLog.filter(l => l.status === 'erro').length > 0
                                        ? `${nfeImportLog.filter(l => l.status === 'erro').length} com erros`
                                        : 'Concluído com sucesso!'}
                                </p>
                            </div>
                        </div>
                    </Card>
                    <Card>
                        <CardContent className="p-6 space-y-2">
                            {nfeImportLog.map((log, i) => (
                                <div key={i} className={cn("flex items-center gap-3 p-3 rounded-xl text-sm", log.status === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800')}>
                                    {log.status === 'ok' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                                    <strong>{log.nf}</strong>
                                    <span className="text-xs opacity-75">{log.msg}</span>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                    <div className="flex justify-center">
                        <Button className="rounded-full px-10" onClick={() => { setStep(1); setNfeList([]); setNfeImportLog([]) }}>
                            Nova Importação
                        </Button>
                    </div>
                </div>
            )}

            {/* ── Doc Sucata Step 2: Formulário revisão ─────────────────── */}
            {targetType === 'doc_sucata' && docSucataStep === 2 && docSucataForm && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-10 duration-500">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-xl font-black tracking-tight flex items-center gap-2"><Sparkles className="w-5 h-5 text-rose-500" /> Dados Extraídos</h3>
                            <p className="text-xs text-muted-foreground mt-1">Revise e corrija as informações antes de salvar a sucata</p>
                        </div>
                        <Button variant="outline" size="sm" className="rounded-full" onClick={() => setDocSucataStep(1)}>← Voltar</Button>
                    </div>

                    {docSucataPreviewUrl && (
                        <Card className="border-rose-200 bg-rose-50/30 overflow-hidden">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs font-black uppercase text-rose-700 flex items-center gap-2">
                                    <Camera className="w-4 h-4" /> Registro Visual do Documento
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="relative group max-w-sm mx-auto overflow-hidden rounded-2xl border-4 border-white shadow-xl rotate-1 hover:rotate-0 transition-all duration-500">
                                    <img src={docSucataPreviewUrl} className="w-full h-auto" alt="Documento Importado" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                                </div>
                            </CardContent>
                        </Card>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {([
                            { key: 'marca', label: 'Marca *', type: 'text' },
                            { key: 'modelo', label: 'Modelo *', type: 'text' },
                            { key: 'versao', label: 'Versão', type: 'text' },
                            { key: 'placa', label: 'Placa', type: 'text' },
                            { key: 'chassi', label: 'Chassi', type: 'text' },
                            { key: 'cor', label: 'Cor', type: 'text' },
                            { key: 'combustivel', label: 'Combustível', type: 'text' },
                            { key: 'ano_fabricacao', label: 'Ano Fabricação', type: 'number' },
                            { key: 'ano_modelo', label: 'Ano Modelo', type: 'number' },
                            { key: 'km_entrada', label: 'KM Entrada', type: 'number' },
                            { key: 'valor_compra', label: 'Valor Compra (R$)', type: 'number' },
                            { key: 'data_compra', label: 'Data Compra', type: 'date' },
                            { key: 'condicao', label: 'Condição', type: 'text' },
                            { key: 'local_armazenagem', label: 'Local Armazenagem', type: 'text' },
                            { key: 'fornecedor_nome', label: 'Fornecedor', type: 'text' },
                            { key: 'numero_motor', label: 'Número Motor', type: 'text' },
                            { key: 'renavam', label: 'Renavam', type: 'text' },
                        ] as const).map(({ key, label, type }) => {
                            const raw = docSucataExtraida?.[key as keyof SucataExtraida]
                            const val = docSucataForm[key as keyof SucataExtraida]
                            const hasExtracted = raw !== undefined && raw !== null && raw !== ''
                            return (
                                <div key={key} className={cn("relative rounded-[1.25rem] border-2 p-3 transition-all", hasExtracted ? "border-rose-200 bg-rose-50/60" : "border-muted-foreground/10 bg-muted/10")}>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                                        {label}
                                        {hasExtracted && <span className="text-rose-500 font-bold text-[9px]">● extraído</span>}
                                    </label>
                                    <input
                                        type={type}
                                        value={(val ?? '') as string}
                                        onChange={e => setDocSucataForm(f => ({ ...f, [key]: type === 'number' ? (e.target.value === '' ? undefined : Number(e.target.value)) : e.target.value }))}
                                        className="w-full bg-transparent text-sm font-bold outline-none mt-0.5 text-foreground"
                                        step={type === 'number' ? 'any' : undefined}
                                    />
                                </div>
                            )
                        })}
                    </div>
                    <div className="rounded-[1.25rem] border-2 border-muted-foreground/10 p-3">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Observações</label>
                        <textarea
                            value={docSucataForm.observacoes ?? ''}
                            onChange={e => setDocSucataForm(f => ({ ...f, observacoes: e.target.value }))}
                            rows={3}
                            className="w-full bg-transparent text-xs outline-none mt-1 resize-none font-mono"
                        />
                    </div>
                    <div className="flex justify-end gap-3">
                        <Button variant="outline" className="rounded-full" onClick={resetDocSucata}>Cancelar</Button>
                        <Button onClick={handleDocSucataSave} disabled={docSucataSaving || !docSucataForm.marca || !docSucataForm.modelo}
                            className="rounded-full bg-rose-600 hover:bg-rose-700 text-white font-black px-8">
                            {docSucataSaving ? 'Salvando...' : <><Check className="w-4 h-4 mr-2" /> Salvar Sucata</>}
                        </Button>
                    </div>
                </div>
            )}

            {/* ── Doc Sucata Step 3: Resultado ───────────────────────────── */}
            {targetType === 'doc_sucata' && docSucataStep === 3 && docSucataLog && (
                <div className="animate-in fade-in zoom-in-95 duration-500">
                    <Card className={cn("border-none shadow-2xl rounded-[3rem] overflow-hidden", docSucataLog.status === 'ok' ? "bg-emerald-500" : "bg-red-500")}>
                        <div className="p-10 text-white flex items-center gap-5">
                            <div className="w-20 h-20 bg-white/20 rounded-[2rem] flex items-center justify-center backdrop-blur-md shadow-2xl">
                                {docSucataLog.status === 'ok' ? <Check className="w-10 h-10" /> : <AlertCircle className="w-10 h-10" />}
                            </div>
                            <div>
                                <p className="text-4xl font-black tracking-tighter">{docSucataLog.status === 'ok' ? 'Sucata Criada!' : 'Erro ao Salvar'}</p>
                                <p className="text-white/80 font-bold mt-1">{docSucataLog.msg}</p>
                            </div>
                        </div>
                    </Card>
                    <div className="flex justify-center gap-4 mt-6">
                        <Button variant="outline" className="rounded-full" onClick={resetDocSucata}><ArrowRight className="w-4 h-4 mr-2 rotate-180" /> Importar outro documento</Button>
                    </div>
                </div>
            )}

            {step === 2 && targetType !== 'nfe' && targetType !== 'doc_sucata' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in slide-in-from-right-10 duration-500">
                    <Card className="border-none shadow-2xl rounded-[2.5rem] bg-white overflow-hidden">
                        <CardHeader className="bg-primary p-8 text-white"><CardTitle className="text-xl font-black uppercase italic tracking-tight">Mapear Colunas</CardTitle></CardHeader>
                        <CardContent className="p-8 space-y-3">
                            {currentSchema.columns.map(col => (
                                <div key={col.target} className={cn("flex items-center justify-between gap-4 p-4 rounded-3xl border-2 transition-all", mappings[col.target] ? "border-primary/20 bg-primary/5" : "border-muted-foreground/5 bg-muted/20")}>
                                    <div><span className="text-xs font-black uppercase block">{col.label}</span><span className="text-[10px] text-muted-foreground uppercase opacity-50">{col.target}</span></div>
                                    <select className="w-48 h-10 px-4 rounded-2xl border-2 border-transparent bg-white shadow-sm focus:border-primary transition-all text-xs font-bold outline-none" value={mappings[col.target] || ""} onChange={e => updateMapping(col.target, e.target.value)}>
                                        <option value="">Pular...</option>{columns.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                            ))}
                            {targetType === 'estoque' && (
                                <div className="space-y-3">
                                    <label className="flex items-start gap-3 p-4 rounded-3xl border-2 border-primary/15 bg-primary/5 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="mt-1 rounded border-primary"
                                            checked={estoqueMergeFotos}
                                            onChange={e => setEstoqueMergeFotos(e.target.checked)}
                                        />
                                        <span className="text-xs font-medium leading-relaxed">
                                            <span className="font-black uppercase block text-[10px] text-primary mb-1">Fotos na reimportação</span>
                                            Célula sem URL não envia campos de imagem (mantém o que já está no banco). Com a opção marcada, URLs da planilha são somadas à galeria existente, sem repetir o mesmo link. Desmarcado, URLs da planilha substituem a galeria.
                                        </span>
                                    </label>
                                    <label className="flex items-start gap-3 p-4 rounded-3xl border-2 border-amber-200/80 bg-amber-50/50 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="mt-1 rounded border-amber-600"
                                            checked={estoqueIgnorarExistentes}
                                            onChange={e => setEstoqueIgnorarExistentes(e.target.checked)}
                                        />
                                        <span className="text-xs font-medium leading-relaxed text-amber-950">
                                            <span className="font-black uppercase block text-[10px] text-amber-800 mb-1">Ignorar SKUs existentes</span>
                                            Se marcado, os produtos da planilha cujos SKUs já existem no sistema serão ignorados (não serão atualizados). Apenas produtos com novos SKUs serão inseridos.
                                        </span>
                                    </label>
                                </div>
                            )}
                            {targetType === 'sucatas' && (
                                <label className="flex items-start gap-3 p-4 rounded-3xl border-2 border-amber-200/80 bg-amber-50/80 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="mt-1 rounded border-amber-600"
                                        checked={sucatasMergeFotos}
                                        onChange={e => setSucatasMergeFotos(e.target.checked)}
                                    />
                                    <span className="text-xs font-medium leading-relaxed text-amber-950">
                                        <span className="font-black uppercase block text-[10px] text-amber-800 mb-1">Fotos na reimportação (sucatas)</span>
                                        Célula sem URL não envia o array de fotos (mantém as já salvas). Marcado: soma URLs novas sem duplicar link. Desmarcado: substitui a lista. Upsert por código da sucata.
                                    </span>
                                </label>
                            )}
                            {(targetType === 'estoque' || targetType === 'sucatas') && (
                                <label className="flex items-start gap-3 p-4 rounded-3xl border-2 border-emerald-200/80 bg-emerald-50/70 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="mt-1 rounded border-emerald-600"
                                        checked={importarCopiarImagensStorage}
                                        onChange={e => setImportarCopiarImagensStorage(e.target.checked)}
                                    />
                                    <span className="text-xs font-medium leading-relaxed text-emerald-950">
                                        <span className="font-black uppercase block text-[10px] text-emerald-800 mb-1">Copiar fotos para o nosso storage</span>
                                        Links externos (ex.: S3) são descarregados e enviados ao bucket <span className="font-mono">produtos</span> (pastas <span className="font-mono">import-estoque</span> / <span className="font-mono">import-sucata</span>). URLs já do Supabase são ignoradas. Primeiro tenta no browser; se falhar (CORS), usa o backend em <span className="font-mono">VITE_API_URL</span> com a sua sessão — mantenha a API a correr em desenvolvimento ou aponte para o servidor em produção.
                                    </span>
                                </label>
                            )}
                            <div className="flex justify-between pt-8"><Button variant="ghost" onClick={() => setStep(1)} className="rounded-full px-8">Voltar</Button><Button className="rounded-full px-10 h-12 bg-primary font-black uppercase text-xs shadow-xl shadow-primary/20" onClick={generatePreview} disabled={currentSchema.columns.filter(c => c.required).some(c => !mappings[c.target])}>VER PREVISÃO <ArrowRight className="w-4 h-4 ml-2" /></Button></div>
                        </CardContent>
                    </Card>
                    <Card className="border-none shadow-xl rounded-[2.5rem] bg-slate-900 overflow-hidden text-white"><CardHeader className="p-8 border-b border-white/5"><CardTitle className="text-sm uppercase font-black">Dados Detectados</CardTitle></CardHeader><CardContent className="p-0 overflow-x-auto"><Table><TableHeader className="bg-white/5"><TableRow>{columns.slice(0, 4).map(c => <TableHead key={c} className="text-[10px] text-primary uppercase font-black border-none">{c}</TableHead>)}</TableRow></TableHeader><TableBody>{rawData.slice(0, 8).map((row, i) => (<TableRow key={i} className="border-white/5">{columns.slice(0, 4).map(c => <TableCell key={c} className="text-[10px] text-slate-400 border-none font-mono py-4">{String(row[c] || '').substring(0, 20)}</TableCell>)}</TableRow>))}</TableBody></Table></CardContent></Card>
                </div>
            )}

            {step === 3 && targetType !== 'nfe' && targetType !== 'doc_sucata' && (
                <div className="animate-in fade-in zoom-in-95 duration-500">
                    <Card className="border-none shadow-2xl rounded-[3rem] overflow-hidden bg-white">
                        <div className="p-10 bg-emerald-500 text-white flex flex-col md:flex-row items-center justify-between gap-6">
                            <div className="flex items-center gap-5">
                                <div className="w-20 h-20 bg-white/20 rounded-[2rem] flex items-center justify-center backdrop-blur-md shadow-2xl ring-8 ring-white/10"><Check className="w-10 h-10" /></div>
                                <div>
                                    <h2 className="text-3xl font-black italic uppercase tracking-tighter">Tudo Pronto!</h2>
                                    <p className="opacity-90 font-medium text-sm">Validamos {rawData.length} registros para {currentSchema.label}.</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 flex-wrap justify-center">
                                <Button variant="ghost" className="text-white hover:bg-white/10 rounded-full" onClick={() => setStep(2)}>Ajustar</Button>
                                {targetType === 'estoque' && (
                                    <Button
                                        className="bg-yellow-400 text-yellow-900 font-black h-14 px-8 rounded-full shadow-2xl uppercase tracking-widest text-xs flex items-center gap-2 hover:bg-yellow-300"
                                        onClick={handleBulkImport}
                                        disabled={loading}
                                        title="Importa diretamente no banco via SQL — muito mais rápido para grandes volumes"
                                    >
                                        ⚡ {loading ? 'Importando...' : 'Importar Rápido (Banco Direto)'}
                                    </Button>
                                )}
                                <Button className="bg-white text-emerald-600 font-black h-14 px-10 rounded-full shadow-2xl uppercase tracking-widest text-xs" onClick={handleImport} disabled={loading}>
                                    {loading ? "Importando..." : "Confirmar e Sincronizar"}
                                </Button>
                            </div>

                        </div>
                        {loading && importProgress.total > 0 && (
                            <div className="px-10 py-4 bg-emerald-50 border-b border-emerald-100 space-y-2">
                                <div className="flex justify-between text-xs font-bold text-emerald-700">
                                    <span>Importando em lotes...</span>
                                    <span>{Math.min(importProgress.current, importProgress.total)} / {importProgress.total} registros</span>
                                </div>
                                <div className="w-full bg-emerald-200 rounded-full h-2.5 overflow-hidden">
                                    <div
                                        className="bg-emerald-600 h-2.5 rounded-full transition-all duration-300"
                                        style={{ width: `${Math.round((importProgress.current / importProgress.total) * 100)}%` }}
                                    />
                                </div>
                                <p className="text-[10px] text-emerald-600 opacity-70">Aguarde, não feche a janela...</p>
                            </div>
                        )}
                        <CardContent className="p-0 overflow-x-auto">
                            <Table><TableHeader className="bg-slate-50"><TableRow>{currentSchema.columns.map(col => <TableHead key={col.target} className="text-[9px] uppercase font-black py-4 px-8">{col.label}</TableHead>)}</TableRow></TableHeader><TableBody>{preview.map((row, i) => (<TableRow key={i} className="hover:bg-slate-50 transition-colors">{currentSchema.columns.map(col => {
                                const cell = row[col.target]
                                const currencyTargets = [
                                    'preco', 'custo', 'valor', 'valor_compra', 
                                    'valor_vendido', 'lucro_bruto', 'saldo_haver', 'limite_credito'
                                ]
                                const yearTargets = ['ano', 'ano_fabricacao', 'ano_modelo']
                                const previewText = col.type === 'number'
                                    ? (yearTargets.includes(col.target)
                                        ? (cell != null && cell !== '' && Number.isFinite(Number(cell)) ? String(Math.trunc(Number(cell))) : '---')
                                        : (currencyTargets.includes(col.target)
                                            ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(cell) || 0)
                                            : new Intl.NumberFormat('pt-BR').format(Number(cell) || 0)))
                                    : (Array.isArray(cell)
                                        ? ((s: string) => (s.length > 80 ? `${s.slice(0, 80)}…` : s))(cell.join('; '))
                                        : String(cell ?? '---'))
                                return (<TableCell key={col.target} className="py-4 px-8 text-sm font-bold text-slate-700">{previewText}</TableCell>)
                            })}</TableRow>))}</TableBody></Table>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    )
}
