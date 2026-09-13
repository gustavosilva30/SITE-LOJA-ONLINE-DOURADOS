import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { STORE_ON_DARK, STORE_PUBLIC_SCOPE_CLASS } from '../storeTheme';
import { Input } from '@/components/ui/input';
import { Package, Search, ArrowLeft, ShoppingBag, Clock, CheckCircle2, Truck, XCircle, User } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/apiBase';
import { useStoreAuth } from '../contexts/StoreAuthContext';
import { StoreLoginModal } from '../components/StoreLoginModal';

interface Order {
    id: string;
    order_number: number;
    status: string;
    payment_status: string;
    payment_method: string;
    delivery_method: string;
    total: number;
    public_token: string;
    created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
    pending: { label: 'Aguardando pagamento', color: 'text-yellow-700', bg: 'bg-yellow-50', icon: Clock },
    paid: { label: 'Pago — Preparando', color: 'text-blue-700', bg: 'bg-blue-50', icon: CheckCircle2 },
    processing: { label: 'Em preparação', color: 'text-purple-700', bg: 'bg-purple-50', icon: Package },
    shipped: { label: 'Enviado', color: 'text-indigo-700', bg: 'bg-indigo-50', icon: Truck },
    delivered: { label: 'Entregue ✓', color: 'text-green-700', bg: 'bg-green-50', icon: CheckCircle2 },
    canceled: { label: 'Cancelado', color: 'text-red-700', bg: 'bg-red-50', icon: XCircle },
};

function formatPrice(v: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

export function MyOrdersPage() {
    const { customer, loading: authLoading, getAuthHeader } = useStoreAuth();
    const [loginModalOpen, setLoginModalOpen] = useState(false);
    const [orders, setOrders] = useState<Order[]>([]);
    const [searched, setSearched] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const fetchOrders = async (qs: URLSearchParams, authHeader?: Record<string, string>) => {
        setLoading(true);
        setError('');
        try {
            const url = `${getApiBaseUrl()}/api/store/orders/history${qs.toString() ? `?${qs.toString()}` : ''}`;
            const res = await fetch(url, { headers: authHeader });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || data.detail || 'Falha na consulta');

            setOrders(Array.isArray(data) ? data : []);
            setSearched(true);
        } catch (err: any) {
            setError(err.message || 'Erro ao buscar pedidos');
        } finally {
            setLoading(false);
        }
    };

    // Cliente já logado: busca automaticamente pelos pedidos dele, identificado
    // pelo token da sessão (não mais por um customer_id enviado na URL — era
    // possível ler o histórico de qualquer cliente sabendo/adivinhando o id).
    useEffect(() => {
        if (authLoading) return;
        if (customer) {
            fetchOrders(new URLSearchParams(), getAuthHeader());
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authLoading, customer?.id]);



    return (
        <div className={`min-h-screen bg-gray-50 ${STORE_PUBLIC_SCOPE_CLASS}`}>
            {/* Header */}
            <div className="bg-white border-b">
                <div className="max-w-xl mx-auto px-4 py-4 flex items-center gap-3">
                    <Link to="/" className="text-gray-500 hover:text-gray-900">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <h1 className="font-bold text-lg">Meus Pedidos</h1>
                </div>
            </div>

            <div className="max-w-xl mx-auto px-4 py-6 space-y-6">
                {/* Solicitar login se não estiver logado */}
                {!authLoading && !customer && (
                    <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
                        <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h2 className="text-xl font-black text-gray-900 mb-2">Acesse sua conta</h2>
                        <p className="text-sm text-gray-500 mb-6">Para consultar o status e histórico dos seus pedidos, você precisa estar logado na sua conta.</p>
                        
                        <Button
                            onClick={() => setLoginModalOpen(true)}
                            className="h-12 px-8 bg-[#001A54] hover:bg-[#001A54]/90 text-white font-bold rounded-xl"
                        >
                            <User className="w-4 h-4 mr-2" />
                            Fazer Login ou Cadastrar
                        </Button>
                    </div>
                )}

                {customer && error && <p className="text-sm text-red-600">{error}</p>}
                {customer && loading && !searched && (
                    <p className="text-sm text-gray-500 text-center">Buscando seus pedidos...</p>
                )}

                {/* Resultados */}
                {searched && (
                    orders.length === 0 ? (
                        <div className="text-center py-8 bg-white rounded-2xl shadow-sm">
                            <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                            <h3 className="font-semibold text-gray-700 mb-1">Nenhum pedido encontrado</h3>
                            <p className="text-sm text-gray-500">Verifique os dados e tente novamente</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <p className="text-sm text-gray-500">{orders.length} pedido(s) encontrado(s)</p>
                            {orders.map(order => {
                                const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
                                const StatusIcon = cfg.icon;
                                return (
                                    <Link
                                        key={order.id}
                                        to={`/pedido/${order.id}?token=${order.public_token}`}
                                        className="block bg-white rounded-2xl shadow-sm p-4 hover:shadow-md transition-shadow"
                                    >
                                        <div className="flex items-start justify-between mb-3">
                                            <div>
                                                <p className="font-bold text-gray-900">Pedido #{order.order_number}</p>
                                                <p className="text-xs text-gray-500">{new Date(order.created_at).toLocaleDateString('pt-BR')}</p>
                                            </div>
                                            <p className="font-bold text-blue-600">{formatPrice(order.total)}</p>
                                        </div>
                                        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${cfg.bg}`}>
                                            <StatusIcon className={`w-4 h-4 ${cfg.color}`} />
                                            <span className={`text-sm font-medium ${cfg.color}`}>{cfg.label}</span>
                                        </div>
                                        <p className="text-xs text-gray-400 mt-2">
                                            {order.delivery_method === 'RETIRADA' ? '🏪 Retirada na loja' : '🚚 Entrega no endereço'}
                                            {' · '}
                                            {order.payment_method === 'pix' ? '💰 PIX' : order.payment_method === 'na_entrega' ? '💵 Na entrega' : '💳 Cartão'}
                                        </p>
                                    </Link>
                                );
                            })}
                        </div>
                    )
                )}
            </div>

            <StoreLoginModal 
                isOpen={loginModalOpen} 
                onClose={() => setLoginModalOpen(false)} 
            />
        </div>
    );
}
