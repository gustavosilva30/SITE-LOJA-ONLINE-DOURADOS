import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
    Search,
    User,
    Phone,
    Mail,
    FileText,
    Calendar,
    RefreshCw,
    Edit,
    Trash2,
    Plus,
    Lock,
    MapPin,
    CheckCircle,
    XCircle,
} from 'lucide-react';
import { lojaApi } from '@/lib/api';

interface StoreCustomer {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    cpf: string | null;
    last_login_at: string | null;
    created_at: string;
    is_active?: boolean;
    cep?: string | null;
    logradouro?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    uf?: string | null;
}

export function StoreCustomersPage() {
    const [customers, setCustomers] = useState<StoreCustomer[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Modal state
    const [openModal, setOpenModal] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState<StoreCustomer | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        email: '',
        cpf: '',
        password: '',
        is_active: true,
        cep: '',
        logradouro: '',
        numero: '',
        complemento: '',
        bairro: '',
        cidade: '',
        uf: '',
    });

    const isEdit = !!selectedCustomer;

    const fetchCustomers = async () => {
        setLoading(true);
        try {
            const data = await lojaApi.listarClientesLoja({
                search: searchTerm.trim() || undefined,
                limit: 500,
                offset: 0,
            });
            setCustomers(Array.isArray(data) ? data : []);
        } catch (err: any) {
            console.error('Erro ao buscar clientes da loja:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCustomers();
    }, [searchTerm]);

    const handleOpenModal = (customer: StoreCustomer | null = null) => {
        setSelectedCustomer(customer);
        if (customer) {
            setFormData({
                name: customer.name || '',
                phone: customer.phone || '',
                email: customer.email || '',
                cpf: customer.cpf || '',
                password: '', // always start blank for security
                is_active: customer.is_active !== false,
                cep: customer.cep || '',
                logradouro: customer.logradouro || '',
                numero: customer.numero || '',
                complemento: customer.complemento || '',
                bairro: customer.bairro || '',
                cidade: customer.cidade || '',
                uf: customer.uf || '',
            });
        } else {
            setFormData({
                name: '',
                phone: '',
                email: '',
                cpf: '',
                password: '',
                is_active: true,
                cep: '',
                logradouro: '',
                numero: '',
                complemento: '',
                bairro: '',
                cidade: '',
                uf: '',
            });
        }
        setOpenModal(true);
    };

    const handleCepChange = async (cepVal: string) => {
        const cleanCep = cepVal.replace(/\D/g, '');
        setFormData(prev => ({ ...prev, cep: cleanCep }));
        if (cleanCep.length === 8) {
            try {
                const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
                if (res.ok) {
                    const data = await res.json();
                    if (!data.erro) {
                        setFormData(prev => ({
                            ...prev,
                            logradouro: data.logradouro || '',
                            bairro: data.bairro || '',
                            cidade: data.localidade || '',
                            uf: data.uf || '',
                        }));
                    }
                }
            } catch (e) {
                console.error('Erro ao buscar CEP:', e);
            }
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim() || !formData.phone.trim()) {
            alert('Nome e Telefone são campos obrigatórios.');
            return;
        }
        if (!isEdit && !formData.password.trim()) {
            alert('A senha é obrigatória para novos clientes.');
            return;
        }

        try {
            setSubmitting(true);
            const payload: any = {
                name: formData.name.trim(),
                phone: formData.phone.trim(),
                email: formData.email.trim() || null,
                cpf: formData.cpf.trim() || null,
                is_active: formData.is_active,
                cep: formData.cep.trim() || null,
                logradouro: formData.logradouro.trim() || null,
                numero: formData.numero.trim() || null,
                complemento: formData.complemento.trim() || null,
                bairro: formData.bairro.trim() || null,
                cidade: formData.cidade.trim() || null,
                uf: formData.uf.trim() || null,
            };

            if (formData.password.trim()) {
                payload.password = formData.password.trim();
            }

            if (isEdit && selectedCustomer) {
                await lojaApi.atualizarClienteLoja(selectedCustomer.id, payload);
                alert('Cliente atualizado com sucesso!');
            } else {
                await lojaApi.criarClienteLoja(payload);
                alert('Cliente criado com sucesso!');
            }
            setOpenModal(false);
            fetchCustomers();
        } catch (err: any) {
            console.error('Erro ao salvar cliente:', err);
            const errorDetail = err?.response?.data?.detail || err?.response?.data?.error || err?.message || 'Erro desconhecido';
            alert(`Erro ao salvar cliente: ${errorDetail}`);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (customer: StoreCustomer) => {
        if (confirm(`Tem certeza de que deseja excluir o cliente "${customer.name}"? Esta ação não pode ser desfeita.`)) {
            try {
                setLoading(true);
                await lojaApi.deletarClienteLoja(customer.id);
                alert('Cliente excluído com sucesso!');
                fetchCustomers();
            } catch (err: any) {
                console.error('Erro ao excluir cliente:', err);
                const errorDetail = err?.response?.data?.detail || err?.response?.data?.error || err?.message || 'Erro desconhecido';
                alert(`Erro ao excluir cliente: ${errorDetail}`);
                setLoading(false);
            }
        }
    };

    const formatDate = (date: string | null) => {
        if (!date) return 'Nunca';
        return new Date(date).toLocaleString('pt-BR');
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Clientes da Loja Online</h1>
                    <p className="text-muted-foreground mt-1">Dados de clientes que se cadastraram pelo site</p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={() => handleOpenModal(null)} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                        <Plus className="w-4 h-4" />
                        Novo Cliente
                    </Button>
                    <Button onClick={fetchCustomers} variant="outline" className="gap-2">
                        <RefreshCw className="w-4 h-4" />
                        Atualizar
                    </Button>
                </div>
            </div>

            <Card>
                <CardContent className="p-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                            placeholder="Buscar por nome, e-mail, telefone ou CPF..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : customers.length === 0 ? (
                        <div className="text-center py-16">
                            <User className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                            <h3 className="text-lg font-medium text-gray-900 mb-1">Nenhum cliente encontrado</h3>
                            <p className="text-gray-500 text-sm">Os clientes cadastrados pelo site aparecerão aqui</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Cliente</TableHead>
                                    <TableHead>Contato</TableHead>
                                    <TableHead>Documento</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Último Acesso</TableHead>
                                    <TableHead>Data Cadastro</TableHead>
                                    <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {customers.map(customer => (
                                    <TableRow key={customer.id}>
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
                                                    <User className="w-4 h-4 text-emerald-600" />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{customer.name}</span>
                                                    {customer.cidade && (
                                                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                                            <MapPin className="w-2.5 h-2.5" /> {customer.cidade} - {customer.uf}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                    <Phone className="w-3 h-3" /> {customer.phone}
                                                </div>
                                                {customer.email && (
                                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                        <Mail className="w-3 h-3" /> {customer.email}
                                                    </div>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                <FileText className="w-3 h-3" /> {customer.cpf || '—'}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {customer.is_active !== false ? (
                                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1">
                                                    <CheckCircle className="w-3 h-3 text-emerald-600" /> Ativo
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 gap-1">
                                                    <XCircle className="w-3 h-3 text-red-600" /> Inativo
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                <Calendar className="w-3 h-3" /> {formatDate(customer.last_login_at)}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                <Calendar className="w-3 h-3" /> {formatDate(customer.created_at)}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleOpenModal(customer)}
                                                    className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                                    title="Editar"
                                                >
                                                    <Edit className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleDelete(customer)}
                                                    className="h-8 w-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                                    title="Excluir"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Create / Edit Dialog */}
            <Dialog open={openModal} onOpenChange={setOpenModal}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                            <User className="w-5 h-5 text-emerald-600" />
                            {isEdit ? 'Editar Cliente da Loja' : 'Novo Cliente da Loja'}
                        </DialogTitle>
                    </DialogHeader>

                    <form onSubmit={handleSave} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Coluna 1: Dados Cadastrais */}
                            <div className="space-y-4">
                                <h3 className="font-semibold text-sm border-b pb-2 text-gray-700 flex items-center gap-1.5">
                                    <Lock className="w-4 h-4 text-emerald-500" />
                                    Dados Cadastrais
                                </h3>

                                <div className="space-y-1.5">
                                    <Label htmlFor="name">Nome Completo *</Label>
                                    <Input
                                        id="name"
                                        required
                                        value={formData.name}
                                        onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                        placeholder="Ex: João da Silva"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="phone">Telefone (WhatsApp) *</Label>
                                    <Input
                                        id="phone"
                                        required
                                        value={formData.phone}
                                        onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                                        placeholder="Ex: 11999999999"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="email">E-mail</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        value={formData.email}
                                        onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                                        placeholder="Ex: joao@gmail.com"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="cpf">CPF</Label>
                                    <Input
                                        id="cpf"
                                        value={formData.cpf}
                                        onChange={e => setFormData(prev => ({ ...prev, cpf: e.target.value }))}
                                        placeholder="Apenas números"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="password">
                                        Senha {isEdit ? '(deixe em branco para manter a atual)' : '*'}
                                    </Label>
                                    <Input
                                        id="password"
                                        type="password"
                                        required={!isEdit}
                                        value={formData.password}
                                        onChange={e => setFormData(prev => ({ ...prev, password: e.target.value }))}
                                        placeholder={isEdit ? "********" : "Mínimo 6 caracteres"}
                                    />
                                </div>

                                <div className="flex items-center gap-3 pt-2">
                                    <Switch
                                        id="is_active"
                                        checked={formData.is_active}
                                        onCheckedChange={checked => setFormData(prev => ({ ...prev, is_active: checked }))}
                                    />
                                    <Label htmlFor="is_active" className="cursor-pointer">
                                        Cliente Ativo (Permitir login no site)
                                    </Label>
                                </div>
                            </div>

                            {/* Coluna 2: Endereço */}
                            <div className="space-y-4">
                                <h3 className="font-semibold text-sm border-b pb-2 text-gray-700 flex items-center gap-1.5">
                                    <MapPin className="w-4 h-4 text-emerald-500" />
                                    Endereço de Entrega
                                </h3>

                                <div className="space-y-1.5">
                                    <Label htmlFor="cep">CEP</Label>
                                    <Input
                                        id="cep"
                                        value={formData.cep}
                                        onChange={e => handleCepChange(e.target.value)}
                                        placeholder="Digite para preencher automaticamente"
                                        maxLength={9}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="logradouro">Rua / Logradouro</Label>
                                    <Input
                                        id="logradouro"
                                        value={formData.logradouro}
                                        onChange={e => setFormData(prev => ({ ...prev, logradouro: e.target.value }))}
                                        placeholder="Ex: Av. Paulista"
                                    />
                                </div>

                                <div className="grid grid-cols-3 gap-2">
                                    <div className="col-span-1 space-y-1.5">
                                        <Label htmlFor="numero">Número</Label>
                                        <Input
                                            id="numero"
                                            value={formData.numero}
                                            onChange={e => setFormData(prev => ({ ...prev, numero: e.target.value }))}
                                            placeholder="Ex: 1000"
                                        />
                                    </div>
                                    <div className="col-span-2 space-y-1.5">
                                        <Label htmlFor="complemento">Complemento</Label>
                                        <Input
                                            id="complemento"
                                            value={formData.complemento}
                                            onChange={e => setFormData(prev => ({ ...prev, complemento: e.target.value }))}
                                            placeholder="Ex: Apto 12"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="bairro">Bairro</Label>
                                    <Input
                                        id="bairro"
                                        value={formData.bairro}
                                        onChange={e => setFormData(prev => ({ ...prev, bairro: e.target.value }))}
                                        placeholder="Ex: Centro"
                                    />
                                </div>

                                <div className="grid grid-cols-4 gap-2">
                                    <div className="col-span-3 space-y-1.5">
                                        <Label htmlFor="cidade">Cidade</Label>
                                        <Input
                                            id="cidade"
                                            value={formData.cidade}
                                            onChange={e => setFormData(prev => ({ ...prev, cidade: e.target.value }))}
                                            placeholder="Ex: São Paulo"
                                        />
                                    </div>
                                    <div className="col-span-1 space-y-1.5">
                                        <Label htmlFor="uf">UF</Label>
                                        <Input
                                            id="uf"
                                            value={formData.uf}
                                            onChange={e => setFormData(prev => ({ ...prev, uf: e.target.value }))}
                                            placeholder="SP"
                                            maxLength={2}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <DialogFooter className="border-t pt-4">
                            <Button type="button" variant="outline" onClick={() => setOpenModal(false)}>
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[100px]">
                                {submitting ? 'Salvando...' : 'Salvar'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
