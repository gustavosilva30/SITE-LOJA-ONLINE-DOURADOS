import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Upload, FileType, Check, AlertCircle, Loader2, Maximize2 } from "lucide-react"
import { ImageViewer } from "./ImageViewer"
import { api, estoqueApi, financeiroApi, localizacoesApi, clientesApi, sucatasApi } from "@/lib/api"

interface ColumnMapping {
    fileColumn: string;
    dbColumn: string;
}

const DB_TABLES = [
    { value: 'produtos', label: 'Produtos', columns: ['nome', 'sku', 'part_number', 'marca', 'modelo', 'ano', 'preco', 'custo', 'estoque_atual', 'imagem_url', 'ncm', 'cfop', 'cst', 'unidade_medida', 'descricao', 'meli_id', 'localizacao_id'] },
    { value: 'clientes', label: 'Clientes', columns: ['nome', 'documento', 'telefone', 'email', 'endereco'] },
    { value: 'fornecedores', label: 'Fornecedores', columns: ['nome', 'documento', 'razao_social', 'email', 'telefone'] },
    { value: 'financeiro_lancamentos', label: 'Contas a Pagar/Receber', columns: ['tipo', 'descricao', 'valor', 'data_vencimento', 'data_pagamento', 'status', 'categoria_financeira'] },
    { value: 'sucatas', label: 'Sucatas (Veículos)', columns: ['codigo', 'status', 'placa', 'chassi', 'marca', 'modelo', 'ano_fabricacao', 'ano_modelo', 'cor', 'combustivel', 'km_entrada', 'condicao', 'data_compra', 'valor_compra', 'valor_frete', 'outros_custos', 'modelo_grupo_peca', 'fornecedor', 'certidao_baixa', 'data_desmontagem', 'valor_vendido', 'lucro_bruto', 'margem_bruta', 'numero_motor', 'cilindrada', 'potencia_cv', 'observacoes'] },
]

export function ImportadorInteligente() {
    const [fileData, setFileData] = useState<any[]>([])
    const [fileHeaders, setFileHeaders] = useState<string[]>([])
    const [selectedTable, setSelectedTable] = useState('')
    const [mappings, setMappings] = useState<ColumnMapping[]>([])
    const [isProcessing, setIsProcessing] = useState(false)
    const [result, setResult] = useState<{ success: number, error: number, skipped: number, message?: string } | null>(null)
    const [xmlMode, setXmlMode] = useState<'venda' | 'pagar' | 'receber' | 'produtos' | 'guardar' | null>(null)
    const [xmlMeta, setXmlMeta] = useState<any>(null)
    const [xmlRaw, setXmlRaw] = useState<string>('')
    const [selectedImage, setSelectedImage] = useState<string | null>(null)
    const [isViewerOpen, setIsViewerOpen] = useState(false)

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        const fileName = file.name.toLowerCase()
        if (fileName.endsWith('.xml')) {
            reader.onload = (evt) => {
                const bstr = evt.target?.result
                const parser = new DOMParser()
                const xmlDoc = parser.parseFromString(bstr as string, "text/xml")

                // Simple NFe Parser
                const items: any[] = []
                const dets = xmlDoc.getElementsByTagName("det")
                const infNFe = xmlDoc.getElementsByTagName("infNFe")[0]
                const ide = xmlDoc.getElementsByTagName("ide")[0]
                const total = xmlDoc.getElementsByTagName("vNF")[0]
                const emit = xmlDoc.getElementsByTagName("emit")[0]

                const meta = {
                    numero: ide?.getElementsByTagName("nNF")[0]?.textContent || '',
                    chave: infNFe?.getAttribute("Id")?.replace('NFe', '') || '',
                    total: total?.textContent || '0',
                    data: ide?.getElementsByTagName("dhEmi")[0]?.textContent || new Date().toISOString(),
                    emitente: emit?.getElementsByTagName("xNome")[0]?.textContent || ''
                }
                setXmlMeta(meta)
                setXmlRaw(bstr as string)

                for (let i = 0; i < dets.length; i++) {
                    const prod = dets[i].getElementsByTagName("prod")[0]
                    if (prod) {
                        items.push({
                            nome: prod.getElementsByTagName("xProd")[0]?.textContent || '',
                            sku: prod.getElementsByTagName("cProd")[0]?.textContent || '',
                            ncm: prod.getElementsByTagName("NCM")[0]?.textContent || '',
                            cfop: prod.getElementsByTagName("CFOP")[0]?.textContent || '',
                            unidade_medida: prod.getElementsByTagName("uCom")[0]?.textContent || '',
                            quantidade: prod.getElementsByTagName("qCom")[0]?.textContent || '',
                            preco: prod.getElementsByTagName("vUnCom")[0]?.textContent || '',
                            custo: prod.getElementsByTagName("vUnCom")[0]?.textContent || '',
                            valor_total: prod.getElementsByTagName("vProd")[0]?.textContent || ''
                        })
                    }
                }

                if (items.length > 0) {
                    setFileData(items)
                    const hdrsSet = new Set<string>()
                    items.forEach(item => {
                        if (item && typeof item === 'object') {
                            Object.keys(item).forEach(k => hdrsSet.add(k))
                        }
                    })
                    const hdrs = Array.from(hdrsSet)
                    setFileHeaders(hdrs)
                    autoMap(hdrs)
                    if (!selectedTable) setSelectedTable('produtos')
                }
                setXmlMode('venda') // Default XML mode
            }
            reader.readAsText(file)
        } else {
            setXmlMode(null)
            reader.onload = async (evt) => {
                const data = evt.target?.result
                const XLSX = await import("xlsx")
                const wb = XLSX.read(data, { type: 'array' })
                const wsname = wb.SheetNames[0]
                const ws = wb.Sheets[wsname]
                const jsonData = XLSX.utils.sheet_to_json(ws, { defval: "" })
                if (jsonData.length > 0) {
                    setFileData(jsonData)
                    const hdrsSet = new Set<string>()
                    jsonData.forEach((item: any) => {
                        if (item && typeof item === 'object') {
                            Object.keys(item).forEach(k => hdrsSet.add(k))
                        }
                    })
                    const hdrs = Array.from(hdrsSet)
                    setFileHeaders(hdrs)
                    autoMap(hdrs)
                }
            }
            reader.readAsArrayBuffer(file)
        }
    }

    const autoMap = (headers: string[]) => {
        if (!selectedTable) return
        const table = DB_TABLES.find(t => t.value === selectedTable)
        if (!table) return

        const newMappings: ColumnMapping[] = []
        table.columns.forEach(dbCol => {
            const match = headers.find(h =>
                h.toLowerCase() === dbCol.toLowerCase() ||
                h.toLowerCase().includes(dbCol.toLowerCase()) ||
                (dbCol === 'imagem_url' && (h.toLowerCase().includes('foto') || h.toLowerCase().includes('url') || h.toLowerCase().includes('imagem')))
            )
            if (match) {
                newMappings.push({ fileColumn: match, dbColumn: dbCol })
            }
        })
        setMappings(newMappings)
    }

    const handleTableChange = (val: string) => {
        setSelectedTable(val)
        if (fileHeaders.length > 0) {
            const table = DB_TABLES.find(t => t.value === val)
            if (table) {
                const newMappings: ColumnMapping[] = []
                table.columns.forEach(dbCol => {
                    const match = fileHeaders.find(h =>
                        h.toLowerCase() === dbCol.toLowerCase()
                    )
                    if (match) newMappings.push({ fileColumn: match, dbColumn: dbCol })
                })
                setMappings(newMappings)
            }
        }
    }

    const updateMapping = (dbCol: string, fileCol: string) => {
        const filtered = mappings.filter(m => m.dbColumn !== dbCol)
        if (fileCol) {
            setMappings([...filtered, { dbColumn: dbCol, fileColumn: fileCol }])
        } else {
            setMappings(filtered)
        }
    }

    const startImport = async () => {
        if (!selectedTable || mappings.length === 0) return
        setIsProcessing(true)
        setResult(null)

        // 1. Handling specialized XML Storage
        if (xmlMode === 'guardar' && xmlMeta) {
            console.warn('[ImportadorInteligente] Arquivar NF-e (nfe_documentos): rota API não configurada — ignorado.')
            setResult({ success: 0, error: 0, skipped: 0, message: 'Arquivo XML não gravado (use o Importador NF-e quando disponível).' })
            setIsProcessing(false)
            return
        }

        // 2. Handling Financial Import from XML
        if (xmlMode === 'pagar' || xmlMode === 'receber') {
            try {
                await financeiroApi.criar({
                    tipo: xmlMode === 'pagar' ? 'Despesa' : 'Receita',
                    valor: parseFloat(xmlMeta.total),
                    data_vencimento: new Date(xmlMeta.data).toISOString().split('T')[0],
                    descricao: `NF-e ${xmlMeta.numero} - ${xmlMeta.emitente}`,
                    status: 'Pendente',
                })
                setResult({ success: 1, error: 0, skipped: 0 })
                setIsProcessing(false)
                return
            } catch (e) {
                console.error(e)
            }
        }

        let success = 0
        let error = 0
        let skipped = 0
        let errorMessage = ''

        // 0. Resolvendo Localizações se mapeado (Para evitar erro de UUID)
        let locMap: Record<string, string> = {}
        const locMapping = mappings.find(m => m.dbColumn === 'localizacao_id')
        if (locMapping && selectedTable === 'produtos') {
            try {
                const existingLocs = await localizacoesApi.listar({ limit: 2000 })
                if (Array.isArray(existingLocs)) {
                    existingLocs.forEach((l: { id: string; nome: string }) => {
                        locMap[l.nome.trim().toUpperCase()] = l.id
                    })
                }
            } catch {
                /* ignore */
                // Conforme solicitação do usuário, se a localização não existir no sistema, não deve ser criada.
                // Apenas usaremos as que já existem no locMap.
            }
        }

        const itemsToInsert = fileData.map(row => {
            const obj: any = {}
            mappings.forEach(m => {
                let val = row[m.fileColumn]

                // Tratar valores vazios como null para não dar erro de tipo
                if (val === undefined || val === null || val === '') {
                    val = null
                } else {
                    // Limpeza inteligente para números
                    if (['preco', 'custo', 'estoque_atual', 'valor', 'ano', 'valor_compra', 'valor_frete', 'outros_custos', 'valor_vendido', 'lucro_bruto', 'margem_bruta', 'ano_fabricacao', 'ano_modelo', 'km_entrada', 'cilindrada', 'potencia_cv'].includes(m.dbColumn)) {
                        if (typeof val === 'string') {
                            val = parseFloat(val.replace(/[^\d.,-]/g, '').replace(',', '.'))
                        }
                        if (isNaN(val)) val = 0

                        // Evitar erro de constraint non-negative do banco
                        if (['preco', 'custo', 'estoque_atual', 'valor', 'valor_compra', 'valor_frete', 'outros_custos', 'valor_vendido', 'km_entrada', 'ano_fabricacao', 'ano_modelo'].includes(m.dbColumn)) {
                            val = Math.max(0, val)
                        }
                    }

                    // Resolução de Localização (Nome -> ID)
                    if (m.dbColumn === 'localizacao_id' && val && typeof val === 'string') {
                        const trimmed = val.trim()
                        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)
                        if (isUUID) {
                            val = trimmed
                        } else {
                            const normalized = trimmed.toUpperCase()
                            if (locMap[normalized]) {
                                val = locMap[normalized]
                            } else {
                                // Se não existe no locMap, não cria a localização!
                                // Guardamos o texto livre em 'localizacao' e deixamos 'localizacao_id' como null
                                obj['localizacao'] = trimmed
                                val = null
                            }
                        }
                    }

                    // Limpeza de URL de imagem (Pega apenas a primeira se houver várias)
                    if (m.dbColumn === 'imagem_url' && val) {
                        const firstUrl = String(val).split(/[\s,;|]+/).find(u => u.startsWith('http'))
                        if (firstUrl) val = firstUrl
                    }
                }

                if (val !== null || m.dbColumn === 'sku' || m.dbColumn === 'nome') {
                    obj[m.dbColumn] = val
                }
            })

            // Garantir campos obrigatórios mínimos
            if (selectedTable === 'produtos') {
                if (!obj.sku) {
                    obj.sku = `AUTO-${Date.now()}` // Backend ou usuário cuidará depois se for manual
                }
            }

            return obj
        })

        let filteredItems = itemsToInsert

        // 4. Skip duplicates for specific tables
        if (selectedTable === 'produtos') {
            try {
                const existingProducts = await estoqueApi.listarProdutos({ limit: 10000 })
                if (existingProducts) {
                    const existingSkus = new Set(existingProducts.map((p: any) => String(p.sku).trim().toLowerCase()))

                    const originalCount = filteredItems.length
                    filteredItems = filteredItems.filter(item => {
                        if (!item.sku) return true // Allow items without SKU to be processed (they will get an AUTO SKU later)
                        const itemSku = String(item.sku).trim().toLowerCase()
                        return !existingSkus.has(itemSku)
                    })
                    skipped = originalCount - filteredItems.length
                }
            } catch (err) {
                console.error('Erro ao verificar duplicados:', err)
            }
        }

        if (xmlMode === 'venda' && xmlMeta) {
            setResult({
                success: 0,
                error: 0,
                skipped: 0,
                message: 'Venda a partir de XML: use o Importador principal (secção NF-e) para criar venda com itens via API.',
            })
            setIsProcessing(false)
            return
        }

        const chunkSize = 50
        for (let i = 0; i < filteredItems.length; i += chunkSize) {
            const chunk = filteredItems.slice(i, i + chunkSize)
            for (const row of chunk) {
                try {
                    if (selectedTable === 'produtos') await estoqueApi.criarProduto(row)
                    else if (selectedTable === 'clientes') await clientesApi.criar(row)
                    else if (selectedTable === 'fornecedores') await api.post('/api/configuracoes/fornecedores', row)
                    else if (selectedTable === 'financeiro_lancamentos') await financeiroApi.criar(row)
                    else if (selectedTable === 'sucatas') await sucatasApi.criar(row)
                    else {
                        error += 1
                        errorMessage = errorMessage || 'Tabela não suportada.'
                        continue
                    }
                    success += 1
                } catch (err: unknown) {
                    console.error('Import error:', err)
                    error += 1
                    errorMessage = err instanceof Error ? err.message : errorMessage || 'Erro ao inserir.'
                }
            }
        }

        setResult({ success, error, skipped, message: errorMessage })
        setIsProcessing(false)
    }

    return (
        <div className="space-y-6">
            <Card className="border-indigo-500/20 bg-indigo-500/5">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-indigo-600">
                        <Upload className="w-5 h-5" /> Importador Inteligente
                    </CardTitle>
                    <CardDescription>Envie arquivos Excel (.xlsx, .xls) ou CSV para alimentar seu banco de dados automaticamente.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>1. Selecione o que deseja importar</Label>
                                <Select
                                    value={selectedTable}
                                    onChange={(e) => handleTableChange(e.target.value)}
                                >
                                    <option value="">Selecione uma tabela...</option>
                                    {DB_TABLES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>2. Upload de Arquivo (Excel, CSV ou XML de Notas)</Label>
                                <div className="border-2 border-dashed border-indigo-500/30 rounded-xl p-8 text-center hover:bg-indigo-500/10 transition-colors relative cursor-pointer">
                                    <input
                                        type="file"
                                        accept=".xlsx, .xls, .csv, .xml, .pdf"
                                        onChange={handleFileUpload}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    />
                                    <FileType className="w-10 h-10 text-indigo-500 mx-auto mb-2" />
                                    <p className="text-sm font-medium">Clique ou arraste o arquivo aqui</p>
                                    <p className="text-xs text-muted-foreground mt-1">Formatos suportados: .xlsx, .xls, .csv, .xml (NF-e)</p>
                                </div>
                            </div>
                        </div>

                        {xmlMeta && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-top-4 bg-indigo-500/10 p-4 rounded-xl border border-indigo-500/20">
                                <Label className="text-indigo-600 font-black">4. O que fazer com esta Nota?</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    <Button variant={xmlMode === 'venda' ? 'default' : 'outline'} className="text-xs h-9" onClick={() => { setXmlMode('venda'); setSelectedTable('produtos'); }}>🛒 Criar Venda</Button>
                                    <Button variant={xmlMode === 'produtos' ? 'default' : 'outline'} className="text-xs h-9" onClick={() => { setXmlMode('produtos'); setSelectedTable('produtos'); }}>📦 Sincronizar Estoque</Button>
                                    <Button variant={xmlMode === 'pagar' ? 'default' : 'outline'} className="text-xs h-9" onClick={() => { setXmlMode('pagar'); setSelectedTable('financeiro_lancamentos'); }}>💸 Conta a Pagar</Button>
                                    <Button variant={xmlMode === 'receber' ? 'default' : 'outline'} className="text-xs h-9" onClick={() => { setXmlMode('receber'); setSelectedTable('financeiro_lancamentos'); }}>💰 Conta a Receber</Button>
                                    <Button variant={xmlMode === 'guardar' ? 'default' : 'outline'} className="col-span-2 text-xs h-9" onClick={() => setXmlMode('guardar')}>📁 Apenas Arquivar (Não altera banco)</Button>
                                </div>
                                <div className="p-2 bg-white/50 rounded text-[10px] space-y-1">
                                    <p><b>Nº Nota:</b> {xmlMeta.numero}</p>
                                    <p><b>Emitente:</b> {xmlMeta.emitente}</p>
                                    <p><b>Chave:</b> {xmlMeta.chave}</p>
                                    <p><b>Valor:</b> R$ {xmlMeta.total}</p>
                                </div>
                            </div>
                        )}

                        {fileHeaders.length > 0 && selectedTable && xmlMode !== 'guardar' && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                                <Label>3. Mapeamento de Colunas</Label>
                                <div className="border rounded-lg bg-background p-4 space-y-3">
                                    <p className="text-[10px] uppercase font-black text-muted-foreground mb-4">Relacione as colunas da sua planilha com o sistema:</p>
                                    {DB_TABLES.find(t => t.value === selectedTable)?.columns.map(dbCol => (
                                        <div key={dbCol} className="grid grid-cols-2 gap-4 items-center">
                                            <span className="text-sm font-bold capitalize">{dbCol.replace('_', ' ').replace('sku ', 'SKU ').replace('meli id', 'MELI ID')}</span>
                                            <Select
                                                value={mappings.find(m => m.dbColumn === dbCol)?.fileColumn || ''}
                                                onChange={(e) => updateMapping(dbCol, e.target.value)}
                                                className="h-9 text-xs bg-muted/30"
                                            >
                                                <option value="">--- Ignorar ---</option>
                                                {fileHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                            </Select>
                                        </div>
                                    ))}
                                </div>

                                <Button
                                    className="w-full bg-indigo-600 hover:bg-indigo-700 font-bold h-12"
                                    disabled={isProcessing || mappings.length === 0}
                                    onClick={startImport}
                                >
                                    {isProcessing ? (
                                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processando Importação...</>
                                    ) : (
                                        <><Check className="w-4 h-4 mr-2" /> Iniciar Importação de {fileData.length} registros</>
                                    )}
                                </Button>
                            </div>
                        )}
                    </div>

                    {result && (
                        <div className={`p-4 rounded-xl border animate-in zoom-in-95 ${result.error > 0 ? 'bg-destructive/10 border-destructive/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
                            <div className="flex items-center gap-3">
                                {result.error > 0 ? <AlertCircle className="w-6 h-6 text-destructive" /> : <Check className="w-6 h-6 text-emerald-600" />}
                                <div>
                                    <h4 className="font-bold">Resultado da Importação</h4>
                                    <p className="text-sm">
                                        {result.success} processados com sucesso.
                                        {result.skipped > 0 && <span className="text-amber-600 font-bold ml-1"> {result.skipped} ignorados (já existiam).</span>}
                                        {result.error > 0 && <span className="text-destructive font-bold ml-1"> {result.error} falhas.</span>}
                                    </p>
                                    {result.message && <p className="text-xs text-destructive mt-1 font-mono"><b>Motivo da Falha:</b> {result.message}</p>}
                                </div>
                            </div>
                        </div>
                    )}
                    {fileData.length > 0 && !result && (
                        <div className="pt-6 border-t">
                            <Label className="mb-2 block">Prévia dos Dados (Primeiras 5 linhas)</Label>
                            <div className="overflow-x-auto border rounded-lg">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            {fileHeaders.slice(0, 6).map(h => <TableHead key={h}>{h}</TableHead>)}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {fileData.slice(0, 5).map((row, idx) => (
                                            <TableRow key={idx}>
                                                {fileHeaders.slice(0, 6).map(h => {
                                                    const val = String(row[h]);
                                                    const isImg = val.match(/\.(jpeg|jpg|gif|png|webp)/i) || val.includes('amazonaws');
                                                    return (
                                                        <TableCell key={h} className="text-xs truncate max-w-[150px]">
                                                            {isImg ? (
                                                                <div className="flex items-center gap-2">
                                                                    <div
                                                                        className="relative w-8 h-8 rounded border overflow-hidden cursor-zoom-in group"
                                                                        onClick={() => {
                                                                            setSelectedImage(val)
                                                                            setIsViewerOpen(true)
                                                                        }}
                                                                    >
                                                                        <img src={val} alt="Preview" className="w-full h-full object-cover transition-transform group-hover:scale-110" onError={(e) => (e.currentTarget.style.display = 'none')} />
                                                                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                                            <Maximize2 className="w-3 h-3 text-white" />
                                                                        </div>
                                                                    </div>
                                                                    <span className="truncate">{val}</span>
                                                                </div>
                                                            ) : val}
                                                        </TableCell>
                                                    );
                                                })}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <ImageViewer
                images={selectedImage ? [selectedImage] : []}
                isOpen={isViewerOpen}
                onClose={() => setIsViewerOpen(false)}
            />
        </div>
    )
}
