import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Smartphone, Download, Upload, Trash2, Plus, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { getApiBaseUrl } from "@/lib/apiBase"
import { getAuthToken } from "@/lib/auth"
import { useAuthStore } from "@/store/authStore"
import { isManagerAtendente } from "@/config/crmRoutePermissions"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export interface Aplicativo {
    id: string
    nome: string
    descricao: string | null
    versao: string
    minio_path: string
    apk_url: string
    icone_url?: string
    created_at: string
    updated_at: string
}

export function LojaAplicativos() {
    const queryClient = useQueryClient()
    const { user } = useAuthStore()
    const isManagerOrAdmin = user ? isManagerAtendente(user) : false
    const isGerente = user?.permissao?.toLowerCase() === "gerente" || 
                      user?.email?.toLowerCase() === "pecasdourados@hotmail.com" || 
                      user?.email?.toLowerCase() === "pecasdourados2@gmail.com"


    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    const [uploadData, setUploadData] = useState({
        nome: "",
        versao: "",
        descricao: "",
        file: null as File | null,
        icone: null as File | null
    })

    // Consultas
    const { data: aplicativos, isLoading } = useQuery<Aplicativo[]>({
        queryKey: ["loja_aplicativos"],
        queryFn: () => api.get("/api/loja-aplicativos"),
    })

    // Mutações
    const deleteMutation = useMutation({
        mutationFn: (id: string) => api.delete(`/api/loja-aplicativos/${id}`),
        onSuccess: () => {
            toast.success("Aplicativo removido com sucesso")
            queryClient.invalidateQueries({ queryKey: ["loja_aplicativos"] })
        },
        onError: (error: any) => {
            toast.error(error.message || "Erro ao deletar aplicativo")
        }
    })

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!uploadData.file) {
            toast.error("Selecione um arquivo .apk")
            return
        }

        setIsUploading(true)
        const formData = new FormData()
        formData.append("nome", uploadData.nome)
        formData.append("versao", uploadData.versao)
        if (uploadData.descricao) {
            formData.append("descricao", uploadData.descricao)
        }

        try {
            if (uploadData.file) {
                formData.append("file", uploadData.file)
            }
            if (uploadData.icone) {
                formData.append("icone", uploadData.icone)
            }

            const token = getAuthToken()
            const baseUrl = getApiBaseUrl()
            const res = await fetch(`${baseUrl}/api/loja-aplicativos/upload`, {
                method: "POST",
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                body: formData
            })

            if (!res.ok) {
                const errData = await res.json().catch(() => null)
                throw new Error(errData?.detail || "Erro ao fazer upload")
            }

            toast.success("Aplicativo enviado com sucesso!")
            setIsUploadModalOpen(false)
            setUploadData({ nome: "", versao: "", descricao: "", file: null, icone: null })
            queryClient.invalidateQueries({ queryKey: ["loja_aplicativos"] })
        } catch (err: any) {
            toast.error(err.message || "Falha ao enviar arquivo")
        } finally {
            setIsUploading(false)
        }
    }

    const openUpdateModal = (app?: Aplicativo) => {
        if (app) {
            setUploadData({
                nome: app.nome,
                versao: app.versao,
                descricao: app.descricao || "",
                file: null,
                icone: null
            })
        } else {
            setUploadData({ nome: "", versao: "", descricao: "", file: null, icone: null })
        }
        setIsUploadModalOpen(true)
    }

    return (
        <div className="flex flex-col gap-6 p-6 md:p-8 max-w-7xl mx-auto w-full">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
                        <Smartphone className="w-8 h-8 text-primary" />
                        Loja de Aplicativos
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Baixe e mantenha atualizados os aplicativos móveis da empresa.
                    </p>
                </div>
                {isManagerOrAdmin && (
                    <Button onClick={() => openUpdateModal()} className="shadow-sm">
                        <Plus className="w-4 h-4 mr-2" />
                        Novo Aplicativo
                    </Button>
                )}
            </div>

            {isLoading ? (
                <div className="flex justify-center items-center h-64">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
            ) : !aplicativos?.length ? (
                <div className="text-center py-24 border border-dashed rounded-lg bg-muted/20">
                    <Smartphone className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                    <h3 className="text-lg font-medium text-foreground">Nenhum aplicativo disponível</h3>
                    <p className="text-muted-foreground mt-1">
                        Os aplicativos cadastrados aparecerão aqui.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {aplicativos.map((app) => (
                        <Card key={app.id} className="flex flex-col overflow-hidden transition-all hover:shadow-md border-border/50">
                            <CardHeader className="bg-muted/30 pb-4 border-b border-border/50">
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-inner overflow-hidden">
                                            {app.icone_url ? (
                                                <img src={app.icone_url} alt={`Ícone ${app.nome}`} className="w-full h-full object-cover" />
                                            ) : (
                                                <Smartphone className="w-6 h-6" />
                                            )}
                                        </div>
                                        <div>
                                            <CardTitle className="text-xl">{app.nome}</CardTitle>
                                            <CardDescription className="text-sm font-medium mt-1">
                                                Versão {app.versao}
                                            </CardDescription>
                                        </div>
                                    </div>
                                    {isGerente && (
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="text-destructive hover:text-destructive hover:bg-destructive/10 -mt-1 -mr-2"
                                            onClick={() => {
                                                if(confirm(`Tem certeza que deseja remover o aplicativo ${app.nome}?`)) {
                                                    deleteMutation.mutate(app.id)
                                                }
                                            }}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent className="pt-4 flex-1">
                                <p className="text-sm text-foreground/80 line-clamp-3">
                                    {app.descricao || "Nenhuma descrição fornecida."}
                                </p>
                                <div className="text-xs text-muted-foreground mt-4 flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                    Atualizado em {new Date(app.updated_at).toLocaleDateString()}
                                </div>
                            </CardContent>
                            <CardFooter className="bg-muted/10 border-t border-border/50 pt-4 flex gap-3">
                                <Button 
                                    className="flex-1 font-semibold"
                                    onClick={() => window.open(app.apk_url, '_blank')}
                                >
                                    <Download className="w-4 h-4 mr-2" />
                                    Baixar APK
                                </Button>
                                {isManagerOrAdmin && (
                                    <Button 
                                        variant="outline"
                                        onClick={() => openUpdateModal(app)}
                                        title="Atualizar versão / Editar APK"
                                        className="font-semibold"
                                    >
                                        <Upload className="w-4 h-4 mr-2" />
                                        Editar APK
                                    </Button>
                                )}
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            )}

            {/* Modal de Upload */}
            <Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Enviar Aplicativo (APK)</DialogTitle>
                        <DialogDescription>
                            Faça o upload do arquivo .apk para disponibilizar uma nova versão.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <form onSubmit={handleUpload} className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label htmlFor="nome">Nome do Aplicativo *</Label>
                            <Input 
                                id="nome" 
                                placeholder="Ex: Estoque Mobile" 
                                value={uploadData.nome}
                                onChange={(e) => setUploadData({...uploadData, nome: e.target.value})}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="versao">Versão *</Label>
                            <Input 
                                id="versao" 
                                placeholder="Ex: 1.0.5" 
                                value={uploadData.versao}
                                onChange={(e) => setUploadData({...uploadData, versao: e.target.value})}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="descricao">Notas de Lançamento / Descrição</Label>
                            <Textarea 
                                id="descricao" 
                                placeholder="O que há de novo nesta versão?" 
                                value={uploadData.descricao}
                                onChange={(e) => setUploadData({...uploadData, descricao: e.target.value})}
                                rows={3}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="file">Arquivo .apk *</Label>
                            <Input 
                                id="file" 
                                type="file" 
                                accept=".apk"
                                onChange={(e) => setUploadData({...uploadData, file: e.target.files?.[0] || null})}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="icone">Ícone do Aplicativo (Opcional)</Label>
                            <Input 
                                id="icone" 
                                type="file" 
                                accept="image/png, image/jpeg, image/webp"
                                onChange={(e) => setUploadData({...uploadData, icone: e.target.files?.[0] || null})}
                            />
                            <p className="text-xs text-muted-foreground">Formato sugerido: PNG 512x512</p>
                        </div>
                        <div className="flex justify-end gap-3 pt-4 border-t border-border mt-2">
                            <Button 
                                type="button" 
                                variant="outline" 
                                onClick={() => setIsUploadModalOpen(false)}
                                disabled={isUploading}
                            >
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={isUploading}>
                                {isUploading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Enviando...
                                    </>
                                ) : (
                                    "Salvar Aplicativo"
                                )}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    )
}
