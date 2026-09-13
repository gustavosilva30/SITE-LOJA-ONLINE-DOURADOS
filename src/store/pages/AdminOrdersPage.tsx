import { useEffect, useState, useCallback } from 'react';
import { getAuthToken } from '@/lib/auth';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import {
  Package, Search, Eye, Truck, CheckCircle2, XCircle,
  RefreshCw, Phone, ShoppingBag, Clock, CreditCard, QrCode, Banknote,
  TrendingUp, AlertTriangle, DollarSign, Copy, Trash2
} from 'lucide-react';
import { getApiBaseUrl } from '@/lib/apiBase';
import { lojaApi } from '@/lib/api';

interface Order {
  id: string;
  order_number: number;
  status: string;
  payment_status: string;
  payment_method: string;
  delivery_method: string;
  total: number;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  customer_cpf: string | null;
  customer_address?: string;
  customer_number?: string;
  customer_neighborhood?: string;
  customer_city?: string;
  customer_state?: string;
  customer_zipcode?: string;
  mp_pix_qr_code_base64?: string;
  mp_pix_copy_paste?: string;
  mp_pix_expiration?: string;
  customer_id?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

interface OrderItem {
  id: string;
  product_id: string;
  quantity: number;
  price_snapshot: number;
  name_snapshot: string;
  sku_snapshot: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: Clock },
  paid: { label: 'Pago', color: 'bg-blue-100 text-blue-800 border-blue-200', icon: CheckCircle2 },
  processing: { label: 'Preparando', color: 'bg-purple-100 text-purple-800 border-purple-200', icon: Package },
  shipped: { label: 'Enviado', color: 'bg-indigo-100 text-indigo-800 border-indigo-200', icon: Truck },
  delivered: { label: 'Entregue', color: 'bg-green-100 text-green-800 border-green-200', icon: CheckCircle2 },
  canceled: { label: 'Cancelado', color: 'bg-red-100 text-red-800 border-red-200', icon: XCircle },
};

const PAY_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: 'Aguardando', color: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'Confirmado', color: 'bg-green-100 text-green-800' },
  rejected: { label: 'Recusado', color: 'bg-red-100 text-red-800' },
  cancelled: { label: 'Cancelado', color: 'bg-gray-100 text-gray-700' },
};

const PAY_METHOD_ICON: Record<string, any> = {
  pix: QrCode,
  credit_card: CreditCard,
  debit_card: CreditCard,
  na_entrega: Banknote,
};

function formatPrice(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}
function formatDate(s: string) {
  return new Date(s).toLocaleString('pt-BR');
}

export function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);
  const [labelLoading, setLabelLoading] = useState(false);
  const [labelUrl, setLabelUrl] = useState<string | null>(null);

  // KPIs
  const total = orders.reduce((s, o) => s + o.total, 0);
  const pending = orders.filter(o => o.status === 'pending').length;
  const paid = orders.filter(o => ['paid', 'processing', 'shipped', 'delivered'].includes(o.status)).length;

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const data = await lojaApi.listarPedidos({
        status: statusFilter || undefined,
        search: searchTerm.trim() || undefined,
        limit: 200,
        offset: 0,
      });
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Erro ao buscar pedidos:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchTerm]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const openDetail = async (order: Order) => {
    setIsDetailOpen(true);
    setLabelUrl(null);
    try {
      const detail = await lojaApi.obterPedido(order.id);
      const { items, ...rest } = detail as Order & { items?: OrderItem[] };
      setSelectedOrder(rest as Order);
      setOrderItems(items || []);
    } catch {
      setSelectedOrder(order);
      setOrderItems([]);
    }
  };

  const handleGenerateLabel = async (order: Order) => {
    setLabelLoading(true);
    try {
      const token = getAuthToken();
      const response = await fetch(`${getApiBaseUrl()}/api/shipping/me/store-orders/${order.id}/label`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ mode: 'public' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || 'Falha ao gerar etiqueta');
      setLabelUrl(result?.label_url || null);
      if (result?.label_url) window.open(result.label_url, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      toast.error('Erro: ' + (err?.message || 'Falha ao gerar etiqueta'));
    } finally {
      setLabelLoading(false);
    }
  };

  const updateStatus = async (orderId: string, newStatus: string) => {
    setUpdatingStatus(true);
    try {
      const updates: Record<string, string> = { status: newStatus };
      if (newStatus === 'paid') updates.payment_status = 'approved';
      if (newStatus === 'canceled') updates.payment_status = 'cancelled';

      const updated = await lojaApi.atualizar(orderId, updates);

      setOrders(prev => prev.map(o => (o.id === orderId ? { ...o, ...updated } : o)));
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(prev => (prev ? { ...prev, ...updated } : null));
      }
    } catch (err: any) {
      toast.error('Erro ao atualizar: ' + (err?.message || err));
    } finally {
      setUpdatingStatus(false);
    }
  };

  const deleteOrder = async (orderId: string, orderNumber: number) => {
    if (!confirm(`Excluir pedido #${orderNumber}? Esta ação não pode ser desfeita.`)) return;
    try {
      await lojaApi.deletar(orderId);
      setOrders(prev => prev.filter(o => o.id !== orderId));
      if (selectedOrder?.id === orderId) setIsDetailOpen(false);
    } catch (err: any) {
      toast.error('Erro ao excluir: ' + (err?.message || err));
    }
  };

  const completeOrder = async (orderId: string) => {
    await updateStatus(orderId, 'delivered');
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pedidos da Loja Online</h1>
          <p className="text-muted-foreground mt-1">Gerencie pedidos recebidos pelo site</p>
        </div>
        <Button onClick={fetchOrders} variant="outline" className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Atualizar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <ShoppingBag className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{orders.length}</p>
                <p className="text-xs text-muted-foreground">Total pedidos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-yellow-600">{pending}</p>
                <p className="text-xs text-muted-foreground">Pendentes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{paid}</p>
                <p className="text-xs text-muted-foreground">Pagos/Andamento</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xl font-bold text-emerald-600">{formatPrice(total)}</p>
                <p className="text-xs text-muted-foreground">Volume total</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Buscar por nome, telefone ou número..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="h-10 px-3 border border-input rounded-md bg-background text-sm"
            >
              <option value="">Todos os status</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de pedidos */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-16">
              <Package className="mx-auto h-12 w-12 text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-1">Nenhum pedido ainda</h3>
              <p className="text-gray-500 text-sm">Os pedidos da loja online aparecerão aqui</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map(order => {
                  const statusCfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
                  const payCfg = PAY_CONFIG[order.payment_status] || PAY_CONFIG.pending;
                  const PayIcon = PAY_METHOD_ICON[order.payment_method] || CreditCard;
                  return (
                    <TableRow key={order.id} className="cursor-pointer hover:bg-slate-50" onClick={() => openDetail(order)}>
                      <TableCell>
                        <div>
                          <p className="font-bold">#{order.order_number}</p>
                          <p className="text-xs text-gray-500">{order.delivery_method === 'RETIRADA' ? '🏪 Retirada' : '🚚 Entrega'}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <p className="font-medium text-sm">{order.customer_name}</p>
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-gray-500">{order.customer_phone}</p>
                            {order.customer_id && (
                              <Badge variant="outline" className="text-[10px] py-0 h-4 bg-emerald-50 text-emerald-700 border-emerald-100">
                                Cadastrado
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${statusCfg.color} border text-xs`}>
                          {statusCfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <PayIcon className="w-3.5 h-3.5 text-gray-500" />
                          <Badge className={`${payCfg.color} text-xs`}>{payCfg.label}</Badge>
                        </div>
                      </TableCell>
                      <TableCell className="font-bold">{formatPrice(order.total)}</TableCell>
                      <TableCell>
                        <p className="text-sm">{new Date(order.created_at).toLocaleDateString('pt-BR')}</p>
                        <p className="text-xs text-gray-500">{new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Button variant="outline" size="sm" onClick={() => openDetail(order)} title="Ver detalhes">
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button variant="outline" size="sm"
                            onClick={() => window.open(`https://wa.me/55${order.customer_phone.replace(/\D/g, '')}`, '_blank')}
                            title="WhatsApp">
                            <Phone className="w-4 h-4" />
                          </Button>
                          {order.status !== 'delivered' && order.status !== 'canceled' && (
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 text-white"
                              onClick={() => completeOrder(order.id)}
                              title="Concluir pedido"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => deleteOrder(order.id, order.order_number)}
                            title="Excluir pedido"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modal de detalhes */}
      {isDetailOpen && selectedOrder && (
        <Modal
          isOpen={isDetailOpen}
          onClose={() => setIsDetailOpen(false)}
          title={`Pedido #${selectedOrder.order_number}`}
        >
          <div className="space-y-5">
            {/* Status badges */}
            <div className="flex flex-wrap items-center gap-2 pb-4 border-b">
              <Badge className={`${STATUS_CONFIG[selectedOrder.status]?.color} border`}>
                {STATUS_CONFIG[selectedOrder.status]?.label}
              </Badge>
              <Badge className={PAY_CONFIG[selectedOrder.payment_status]?.color}>
                {PAY_CONFIG[selectedOrder.payment_status]?.label}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {selectedOrder.payment_method === 'pix' ? '💰 PIX'
                  : selectedOrder.payment_method === 'credit_card' ? '💳 Crédito'
                    : selectedOrder.payment_method === 'debit_card' ? '💳 Débito'
                      : '💵 Na entrega'}
              </Badge>
              <span className="ml-auto font-bold text-lg text-primary">{formatPrice(selectedOrder.total)}</span>
            </div>

            {/* Dados do cliente */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="font-semibold text-sm uppercase text-gray-500 mb-2">Cliente</h4>
                <div className="space-y-1 text-sm">
                  <p><strong>{selectedOrder.customer_name}</strong></p>
                  <p className="text-gray-600">{selectedOrder.customer_phone}</p>
                  {selectedOrder.customer_email && <p className="text-gray-600">{selectedOrder.customer_email}</p>}
                  {selectedOrder.customer_cpf && <p className="text-gray-600">CPF: {selectedOrder.customer_cpf}</p>}
                  {selectedOrder.customer_id && (
                    <div className="mt-2 p-2 bg-emerald-50 rounded-lg border border-emerald-100">
                      <p className="text-[10px] font-bold text-emerald-700 uppercase">Cliente da Loja</p>
                      <p className="text-xs text-emerald-600">ID: {selectedOrder.customer_id}</p>
                    </div>
                  )}
                </div>
              </div>
              {selectedOrder.customer_address && (
                <div>
                  <h4 className="font-semibold text-sm uppercase text-gray-500 mb-2">Endereço</h4>
                  <div className="text-sm text-gray-700 space-y-0.5">
                    <p>{selectedOrder.customer_address}, {selectedOrder.customer_number}</p>
                    <p>{selectedOrder.customer_neighborhood}</p>
                    <p>{selectedOrder.customer_city} - {selectedOrder.customer_state}</p>
                    <p>CEP: {selectedOrder.customer_zipcode}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Itens */}
            <div>
              <h4 className="font-semibold text-sm uppercase text-gray-500 mb-2">Itens do pedido</h4>
              <div className="border rounded-xl overflow-hidden divide-y">
                {orderItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 p-3">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{item.name_snapshot}</p>
                      <p className="text-xs text-gray-500">SKU: {item.sku_snapshot}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{item.quantity}x {formatPrice(item.price_snapshot)}</p>
                      <p className="text-sm font-bold text-primary">{formatPrice(item.price_snapshot * item.quantity)}</p>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between items-center p-3 bg-gray-50 font-bold">
                  <span>Total</span>
                  <span className="text-primary">{formatPrice(selectedOrder.total)}</span>
                </div>
              </div>
            </div>

            {/* PIX QR Code (se houver) */}
            {selectedOrder.mp_pix_qr_code_base64 && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <h4 className="font-semibold text-sm text-green-800 mb-3 flex items-center gap-2">
                  <QrCode className="w-4 h-4" /> QR Code PIX do Cliente
                </h4>
                <div className="flex gap-4 items-start">
                  <img
                    src={`data:image/png;base64,${selectedOrder.mp_pix_qr_code_base64}`}
                    alt="QR Code PIX"
                    className="w-28 h-28 border rounded-lg bg-white"
                  />
                  <div className="flex-1 min-w-0">
                    {selectedOrder.mp_pix_copy_paste && (
                      <button
                        onClick={async () => {
                          await navigator.clipboard.writeText(selectedOrder.mp_pix_copy_paste!);
                          setPixCopied(true);
                          setTimeout(() => setPixCopied(false), 2000);
                        }}
                        className="w-full flex items-center gap-2 p-2 bg-white border rounded-lg text-xs hover:bg-green-50 text-left"
                      >
                        <span className="truncate font-mono">{selectedOrder.mp_pix_copy_paste.substring(0, 30)}...</span>
                        {pixCopied ? <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" /> : <Copy className="w-4 h-4 flex-shrink-0" />}
                      </button>
                    )}
                    {selectedOrder.mp_pix_expiration && (
                      <p className="text-xs text-green-700 mt-2">
                        Vence: {new Date(selectedOrder.mp_pix_expiration).toLocaleString('pt-BR')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Ações de status */}
            <div>
              <h4 className="font-semibold text-sm uppercase text-gray-500 mb-2">Atualizar status</h4>
              <div className="flex flex-wrap gap-2">
                {selectedOrder.status !== 'paid' && selectedOrder.status !== 'canceled' && selectedOrder.status !== 'delivered' && (
                  <Button size="sm" className="gap-2 bg-blue-600 hover:bg-blue-700"
                    onClick={() => updateStatus(selectedOrder.id, 'paid')} disabled={updatingStatus}>
                    <CheckCircle2 className="w-4 h-4" /> Confirmar Pagamento
                  </Button>
                )}
                {selectedOrder.status === 'paid' && (
                  <Button size="sm" className="gap-2 bg-purple-600 hover:bg-purple-700"
                    onClick={() => updateStatus(selectedOrder.id, 'processing')} disabled={updatingStatus}>
                    <Package className="w-4 h-4" /> Iniciar Separação
                  </Button>
                )}
                {selectedOrder.status === 'processing' && (
                  <Button size="sm" className="gap-2 bg-indigo-600 hover:bg-indigo-700"
                    onClick={() => updateStatus(selectedOrder.id, 'shipped')} disabled={updatingStatus}>
                    <Truck className="w-4 h-4" /> Marcar Enviado
                  </Button>
                )}
                {(selectedOrder.status === 'shipped' || selectedOrder.status === 'paid' || selectedOrder.status === 'processing') && (
                  <Button size="sm" className="gap-2 bg-green-600 hover:bg-green-700"
                    onClick={() => updateStatus(selectedOrder.id, 'delivered')} disabled={updatingStatus}>
                    <CheckCircle2 className="w-4 h-4" /> ✓ Concluir Pedido
                  </Button>
                )}
                {selectedOrder.status !== 'canceled' && selectedOrder.status !== 'delivered' && (
                  <Button size="sm" variant="destructive" className="gap-2"
                    onClick={() => updateStatus(selectedOrder.id, 'canceled')} disabled={updatingStatus}>
                    <XCircle className="w-4 h-4" /> Cancelar
                  </Button>
                )}
              </div>
              {/* Botão de excluir */}
              <div className="mt-3 pt-3 border-t flex items-center justify-between">
                <Button size="sm" variant="outline" className="gap-2"
                  onClick={() => window.open(`https://wa.me/55${selectedOrder.customer_phone.replace(/\D/g, '')}`, '_blank')}>
                  <Phone className="w-4 h-4" /> WhatsApp Cliente
                </Button>
                {selectedOrder.delivery_method === 'ENTREGA' && (
                  <Button
                    size="sm"
                    className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => handleGenerateLabel(selectedOrder)}
                    disabled={labelLoading}
                    title="Gerar/Comprar e imprimir etiqueta (Melhor Envio)"
                  >
                    {labelLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
                    Etiqueta
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="destructive"
                  className="gap-2"
                  onClick={() => deleteOrder(selectedOrder.id, selectedOrder.order_number)}
                >
                  <Trash2 className="w-4 h-4" /> Excluir Pedido
                </Button>
              </div>
            </div>

            {labelUrl && (
              <div className="p-3 border rounded-xl bg-emerald-50 border-emerald-200">
                <p className="text-xs font-bold text-emerald-800 mb-1">Etiqueta pronta</p>
                <Button size="sm" variant="outline" className="gap-2" onClick={() => window.open(labelUrl, '_blank', 'noopener,noreferrer')}>
                  <Eye className="w-4 h-4" /> Abrir etiqueta
                </Button>
              </div>
            )}

            <p className="text-xs text-gray-400">Criado: {formatDate(selectedOrder.created_at)} · Atualizado: {formatDate(selectedOrder.updated_at)}</p>
          </div>
        </Modal>
      )}
    </div>
  );
}
