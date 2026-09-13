import { useState, useEffect } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, Pencil, Save, X, Ticket } from "lucide-react"
import { Modal } from "@/components/ui/modal"
import { Select } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { cuponsApi } from "@/lib/api"
import { format } from "date-fns"

export function CouponManager() {
    const [coupons, setCoupons] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingCoupon, setEditingCoupon] = useState<any>(null)
    
    const [form, setForm] = useState({
        codigo: '',
        tipo: 'porcentagem',
        valor: 0,
        valor_minimo_venda: 0,
        limite_uso: '',
        data_validade: '',
        ativo: true
    })

    useEffect(() => {
        fetchCoupons()
    }, [])

    const fetchCoupons = async () => {
        setLoading(true)
        try {
            const data = await cuponsApi.listar()
            setCoupons(data)
        } catch (error) {
            console.error("Erro ao buscar cupons:", error)
        } finally {
            setLoading(false)
        }
    }

    const handleOpenCreate = () => {
        setEditingCoupon(null)
        setForm({
            codigo: '',
            tipo: 'porcentagem',
            valor: 0,
            valor_minimo_venda: 0,
            limite_uso: '',
            data_validade: '',
            ativo: true
        })
        setIsModalOpen(true)
    }

    const handleOpenEdit = (coupon: any) => {
        setEditingCoupon(coupon)
        setForm({
            codigo: coupon.codigo,
            tipo: coupon.tipo,
            valor: coupon.valor,
            valor_minimo_venda: coupon.valor_minimo_venda,
            limite_uso: coupon.limite_uso || '',
            data_validade: coupon.data_validade ? format(new Date(coupon.data_validade), "yyyy-MM-dd'T'HH:mm") : '',
            ativo: coupon.ativo
        })
        setIsModalOpen(true)
    }

    const handleSave = async () => {
        if (!form.codigo) return toast.error("Informe o código do cupom")
        if (form.valor <= 0) return toast.error("Informe um valor maior que zero")

        setLoading(true)
        try {
            const payload = {
                ...form,
                limite_uso: form.limite_uso ? parseInt(form.limite_uso as string) : null,
                data_validade: form.data_validade || null
            }

            if (editingCoupon) {
                await cuponsApi.atualizar(editingCoupon.id, payload)
                toast.success("Cupom atualizado com sucesso")
            } else {
                await cuponsApi.criar(payload)
                toast.success("Cupom criado com sucesso")
            }
            setIsModalOpen(false)
            fetchCoupons()
        } catch (error: any) {
            toast.error(error.response?.data?.detail || "Erro ao salvar cupom")
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm("Tem certeza que deseja excluir este cupom?")) return
        try {
            await cuponsApi.deletar(id)
            toast.success("Cupom removido")
            fetchCoupons()
        } catch (error) {
            toast.error("Erro ao excluir cupom")
        }
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                    <CardTitle className="text-xl font-bold flex items-center gap-2">
                        <Ticket className="w-5 h-5 text-indigo-500" />
                        Cupons de Desconto
                    </CardTitle>
                    <CardDescription>
                        Gerencie códigos promocionais para vendas e orçamentos.
                    </CardDescription>
                </div>
                <Button onClick={handleOpenCreate} className="bg-indigo-600 hover:bg-indigo-700">
                    <Plus className="w-4 h-4 mr-2" />
                    Novo Cupom
                </Button>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Código</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Valor</TableHead>
                            <TableHead>Mín. Venda</TableHead>
                            <TableHead>Uso</TableHead>
                            <TableHead>Validade</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {coupons.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                    Nenhum cupom cadastrado.
                                </TableCell>
                            </TableRow>
                        ) : (
                            coupons.map((c) => (
                                <TableRow key={c.id}>
                                    <TableCell className="font-bold text-indigo-600">{c.codigo}</TableCell>
                                    <TableCell className="capitalize">{c.tipo.replace('_', ' ')}</TableCell>
                                    <TableCell>
                                        {c.tipo === 'porcentagem' ? `${c.valor}%` : `R$ ${c.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                                    </TableCell>
                                    <TableCell>R$ {c.valor_minimo_venda.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                                    <TableCell>
                                        {c.uso_atual} {c.limite_uso ? `/ ${c.limite_uso}` : ''}
                                    </TableCell>
                                    <TableCell>
                                        {c.data_validade ? format(new Date(c.data_validade), "dd/MM/yyyy HH:mm") : 'Ilimitada'}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={c.ativo ? "default" : "destructive"} className={c.ativo ? "bg-emerald-500" : ""}>
                                            {c.ativo ? 'Ativo' : 'Inativo'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button variant="outline" size="icon" onClick={() => handleOpenEdit(c)}>
                                                <Pencil className="w-4 h-4" />
                                            </Button>
                                            <Button variant="outline" size="icon" className="text-red-500 hover:text-red-700" onClick={() => handleDelete(c.id)}>
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </CardContent>

            <Modal
                title={editingCoupon ? "Editar Cupom" : "Novo Cupom"}
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
            >
                <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Código do Cupom</Label>
                            <Input 
                                placeholder="EX: VERAO20" 
                                value={form.codigo} 
                                onChange={e => setForm({...form, codigo: e.target.value.toUpperCase()})}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Tipo de Desconto</Label>
                            <Select value={form.tipo} onChange={v => setForm({...form, tipo: v.target.value})}>
                                <option value="porcentagem">Porcentagem (%)</option>
                                <option value="valor_fixo">Valor Fixo (R$)</option>
                            </Select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Valor do Desconto</Label>
                            <Input 
                                type="number" 
                                value={form.valor} 
                                onChange={e => setForm({...form, valor: parseFloat(e.target.value) || 0})}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Valor Mínimo de Venda</Label>
                            <Input 
                                type="number" 
                                value={form.valor_minimo_venda} 
                                onChange={e => setForm({...form, valor_minimo_venda: parseFloat(e.target.value) || 0})}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Limite de Uso (Opcional)</Label>
                            <Input 
                                type="number" 
                                placeholder="Ilimitado"
                                value={form.limite_uso} 
                                onChange={e => setForm({...form, limite_uso: e.target.value})}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Data de Validade (Opcional)</Label>
                            <Input 
                                type="datetime-local" 
                                value={form.data_validade} 
                                onChange={e => setForm({...form, data_validade: e.target.value})}
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-between p-2 border rounded-lg bg-muted/30">
                        <div className="space-y-0.5">
                            <Label>Cupom Ativo</Label>
                            <p className="text-xs text-muted-foreground text-balance">
                                Se desativado, o cupom não poderá ser aplicado em novas vendas.
                            </p>
                        </div>
                        <Switch 
                            checked={form.ativo} 
                            onCheckedChange={v => setForm({...form, ativo: v})}
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSave} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700">
                            {loading ? "Salvando..." : "Salvar Cupom"}
                        </Button>
                    </div>
                </div>
            </Modal>
        </Card>
    )
}
