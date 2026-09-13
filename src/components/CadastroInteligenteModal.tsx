import { useState, useRef, useCallback } from "react"
import { Modal } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { Camera, Upload, Sparkles, AlertCircle, Loader2 } from "lucide-react"
import { getApiBaseUrl } from "@/lib/apiBase"
import { getAuthToken } from "@/lib/auth"
import { toast } from "sonner"

interface AutoVisionResult {
    peca_id: string
    nome: string
    score_hibrido: number
    detalhes: {
        fabricante?: string
        categoria_nome?: string
        posicao?: string
        lado?: string
        peso?: number
        ncm?: string
        codigos_oem?: string[]
        imagem_url?: string
    }
}

interface Props {
    isOpen: boolean
    onClose: () => void
    onPreFill: (data: any) => void
}

export function CadastroInteligenteModal({ isOpen, onClose, onPreFill }: Props) {
    const [isUploading, setIsUploading] = useState(false)
    const [resultados, setResultados] = useState<AutoVisionResult[]>([])
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setIsUploading(true)
        try {
            // 1. Upload temporário da imagem (simulado para brevidade)
            // Na vida real você chama a rota de upload do MinIO do CRM e obtém a URL
            const fakeUrl = "https://minio.crm.com/tmp/" + file.name 

            // 2. Chama a API do AutoVision
            const token = getAuthToken()
            const res = await fetch(`${getApiBaseUrl()}/api/vision/buscar`, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ imagem_url: fakeUrl, limite: 5 })
            })

            if (!res.ok) throw new Error("Falha ao analisar imagem pela IA")
            
            const data = await res.json()
            setResultados(data.ranking_final || [])
        } catch (err: any) {
            toast.error("Erro na Visão Computacional", { description: err.message })
        } finally {
            setIsUploading(false)
        }
    }

    const handleSelect = async (item: AutoVisionResult) => {
        // Enviar feedback oculto de aprendizado
        try {
            fetch(`${getApiBaseUrl()}/api/vision/feedback`, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${getAuthToken()}`
                },
                body: JSON.stringify({
                    imagem_consulta_url: "tmp", 
                    peca_sugerida_id: item.peca_id,
                    confirmado: true,
                    score_original: item.score_hibrido,
                    tempo_decisao_ms: 1500
                })
            })
        } catch(e) {}

        // Preencher o formulário pai
        onPreFill({
            nome: item.nome,
            fabricante_id: item.detalhes?.fabricante,
            categoria_id: item.detalhes?.categoria_nome,
            posicao: item.detalhes?.posicao,
            lado: item.detalhes?.lado,
            peso: item.detalhes?.peso,
            ncm: item.detalhes?.ncm,
            codigos_oem: item.detalhes?.codigos_oem?.join(", ")
        })
        
        toast.success("Campos preenchidos com sucesso!")
        onClose()
    }

    const renderConfianca = (score: number) => {
        if (score >= 98) return <span className="flex items-center text-green-600 font-bold text-xs"><div className="w-2 h-2 rounded-full bg-green-500 mr-1" />Muito Alta ({score}%)</span>
        if (score >= 90) return <span className="flex items-center text-yellow-600 font-bold text-xs"><div className="w-2 h-2 rounded-full bg-yellow-500 mr-1" />Alta ({score}%)</span>
        if (score >= 80) return <span className="flex items-center text-orange-500 font-bold text-xs"><div className="w-2 h-2 rounded-full bg-orange-500 mr-1" />Média ({score}%)</span>
        return <span className="flex items-center text-red-600 font-bold text-xs"><div className="w-2 h-2 rounded-full bg-red-500 mr-1" />Baixa ({score}%)</span>
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Cadastro Inteligente com IA">
            <div className="p-4 flex flex-col gap-6">
                {!resultados.length && !isUploading && (
                    <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl bg-slate-50">
                        <Sparkles className="w-12 h-12 text-blue-500 mb-4" />
                        <h3 className="text-lg font-semibold text-slate-800 mb-2">Identificação Visual Automática</h3>
                        <p className="text-sm text-slate-500 text-center mb-6 max-w-sm">
                            Envie a foto da peça e nosso motor de IA cruzará com mais de 100 mil imagens do estoque para preencher o cadastro por você.
                        </p>
                        
                        <div className="flex gap-4">
                            <Button onClick={() => fileInputRef.current?.click()} className="bg-blue-600 hover:bg-blue-700">
                                <Upload className="w-4 h-4 mr-2" /> Fazer Upload
                            </Button>
                            <Button variant="outline">
                                <Camera className="w-4 h-4 mr-2" /> Usar Câmera
                            </Button>
                        </div>
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            className="hidden" 
                            accept="image/*" 
                            onChange={handleFileChange} 
                        />
                    </div>
                )}

                {isUploading && (
                    <div className="flex flex-col items-center justify-center p-12">
                        <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
                        <p className="text-slate-600 font-medium">Extraindo vetores visuais e OCR...</p>
                    </div>
                )}

                {resultados.length > 0 && !isUploading && (
                    <div className="flex flex-col gap-4">
                        <h4 className="font-semibold text-slate-700">Resultados Encontrados ({resultados.length})</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {resultados.map((res, i) => (
                                <div key={i} className="flex border rounded-lg p-3 hover:border-blue-500 cursor-pointer transition-colors bg-white shadow-sm" onClick={() => handleSelect(res)}>
                                    <div className="w-20 h-20 bg-slate-200 rounded object-cover overflow-hidden shrink-0 flex items-center justify-center">
                                        {res.detalhes?.imagem_url ? (
                                            <img src={res.detalhes.imagem_url} alt={res.nome} className="w-full h-full object-cover" />
                                        ) : (
                                            <Sparkles className="w-8 h-8 text-slate-400" />
                                        )}
                                    </div>
                                    <div className="ml-4 flex flex-col justify-between w-full">
                                        <div>
                                            <div className="flex justify-between items-start">
                                                <h5 className="font-semibold text-sm line-clamp-2">{res.nome}</h5>
                                            </div>
                                            <p className="text-xs text-slate-500 mt-1">{res.detalhes?.codigos_oem?.join(", ") || "Sem OEM"}</p>
                                        </div>
                                        <div className="flex justify-between items-end mt-2">
                                            {renderConfianca(res.score_hibrido)}
                                            <Button size="sm" variant="secondary" className="h-7 text-xs">Preencher</Button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <Button variant="outline" className="mt-4" onClick={() => setResultados([])}>Escanear Outra Peça</Button>
                    </div>
                )}
            </div>
        </Modal>
    )
}
