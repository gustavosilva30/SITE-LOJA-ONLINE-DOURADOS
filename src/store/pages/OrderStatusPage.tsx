import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { CheckCircle2, Clock, Package, Truck, XCircle, QrCode, Copy, ArrowLeft, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getApiBaseUrl } from '@/lib/apiBase';
import { STORE_NAVY, STORE_ON_DARK, STORE_PUBLIC_SCOPE_CLASS } from '../storeTheme';

interface Order {
  id: string;
  order_number: number;
  status: string;
  payment_status: string;
  payment_method: string;
  delivery_method: string;
  total: number;
  public_token: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  customer_address?: string;
  customer_number?: string;
  customer_neighborhood?: string;
  customer_city?: string;
  customer_state?: string;
  mp_pix_qr_code_base64?: string;
  mp_pix_copy_paste?: string;
  mp_pix_expiration?: string;
  created_at: string;
  updated_at: string;
}

interface OrderItem {
  id: string;
  name_snapshot: string;
  sku_snapshot: string;
  quantity: number;
  price_snapshot: number;
}

const STEPS = [
  { key: 'pending', label: 'Pedido recebido', icon: Clock },
  { key: 'paid', label: 'Pagamento confirmado', icon: CheckCircle2 },
  { key: 'processing', label: 'Preparando', icon: Package },
  { key: 'shipped', label: 'Enviado', icon: Truck },
  { key: 'delivered', label: 'Entregue', icon: CheckCircle2 },
];

const STEP_ORDER = ['pending', 'paid', 'processing', 'shipped', 'delivered'];

function formatPrice(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

export function OrderStatusPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pixCopied, setPixCopied] = useState(false);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    if (!token) {
      setLoading(false);
      setError('Link inválido: falta o token do pedido');
      return;
    }
    fetchOrder();
    const interval = setInterval(fetchOrder, 30000);
    return () => clearInterval(interval);
  }, [id, token]);

  const fetchOrder = async () => {
    if (!id || !token) return;
    try {
      const res = await fetch(
        `${getApiBaseUrl()}/api/store/orders/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Pedido não encontrado');
        return;
      }
      setOrder(data.order);
      setItems(data.items || []);
    } catch (err) {
      setError('Erro ao carregar pedido');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center bg-gray-50 ${STORE_PUBLIC_SCOPE_CLASS}`}>
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-600">Carregando pedido...</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className={`min-h-screen flex items-center justify-center bg-gray-50 p-4 ${STORE_PUBLIC_SCOPE_CLASS}`}>
        <div className="text-center max-w-sm">
          <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">{error || 'Pedido não encontrado'}</h2>
          <Link to="/">
            <Button className={`font-bold border-0 ${STORE_ON_DARK}`} style={{ backgroundColor: STORE_NAVY }}>
              Voltar à loja
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const isCanceled = order.status === 'canceled';
  const currentStepIndex = isCanceled ? -1 : STEP_ORDER.indexOf(order.status);

  return (
    <div className={`min-h-screen bg-gray-50 ${STORE_PUBLIC_SCOPE_CLASS}`}>
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link to="/meus-pedidos" className="text-gray-500 hover:text-gray-900">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="font-bold text-lg">Pedido #{order.order_number}</h1>
            <p className="text-xs text-gray-500">{new Date(order.created_at).toLocaleDateString('pt-BR')}</p>
          </div>
          <div className="ml-auto">
            <a href={`https://wa.me/5567992405550`} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Phone className="w-3.5 h-3.5" /> Suporte
              </Button>
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-6 space-y-4">

        {/* Status cancelado */}
        {isCanceled ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-center">
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <h2 className="font-bold text-red-800 text-lg">Pedido cancelado</h2>
            <p className="text-sm text-red-600 mt-1">Entre em contato conosco para mais informações</p>
          </div>
        ) : (
          /* Timeline de status */
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <h2 className="font-bold text-gray-900 mb-4">Status do pedido</h2>
            <div className="space-y-0">
              {STEPS.map((step, idx) => {
                const Icon = step.icon;
                const isDone = currentStepIndex >= idx;
                const isCurrent = currentStepIndex === idx;
                const isLast = idx === STEPS.length - 1;
                return (
                  <div key={step.key} className="relative flex gap-4">
                    {/* Linha vertical */}
                    {!isLast && (
                      <div className="absolute left-4 top-8 w-0.5 h-8 bg-gray-200" style={{
                        backgroundColor: isDone && currentStepIndex > idx ? '#2563eb' : '#e5e7eb'
                      }} />
                    )}
                    {/* Ícone */}
                    <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isCurrent ? 'bg-blue-600 ring-4 ring-blue-100' : isDone ? 'bg-blue-500' : 'bg-gray-200'
                      }`}>
                      <Icon className={`w-4 h-4 ${isDone ? 'text-white' : 'text-gray-400'}`} />
                    </div>
                    <div className={`pb-8 ${isLast ? 'pb-0' : ''}`}>
                      <p className={`font-medium text-sm ${isDone ? 'text-blue-700' : 'text-gray-400'}`}>{step.label}</p>
                      {isCurrent && <p className="text-xs text-gray-500 mt-0.5">{new Date(order.updated_at).toLocaleString('pt-BR')}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* PIX Pendente */}
        {order.payment_method === 'pix' && order.payment_status === 'pending' && !isCanceled && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
            <h3 className="font-bold text-green-800 mb-3 flex items-center gap-2">
              <QrCode className="w-5 h-5" /> Pague com PIX
            </h3>
            {order.mp_pix_qr_code_base64 ? (
              <>
                <div className="flex justify-center mb-3">
                  <img
                    src={`data:image/png;base64,${order.mp_pix_qr_code_base64}`}
                    alt="QR Code PIX"
                    className="w-40 h-40 border-4 border-white rounded-xl shadow"
                  />
                </div>
                {order.mp_pix_copy_paste && (
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(order.mp_pix_copy_paste!);
                      setPixCopied(true);
                      setTimeout(() => setPixCopied(false), 3000);
                    }}
                    className="w-full flex items-center justify-between gap-3 p-3 bg-white border border-green-200 rounded-xl hover:bg-green-50"
                  >
                    <span className="text-xs font-mono truncate text-green-900">
                      {order.mp_pix_copy_paste.substring(0, 40)}...
                    </span>
                    {pixCopied ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5 text-green-600" />}
                  </button>
                )}
                {pixCopied && <p className="text-center text-xs text-green-700 mt-2 font-medium">✓ Código copiado!</p>}
                {order.mp_pix_expiration && (
                  <p className="text-xs text-green-700 mt-3 text-center">
                    Vence em: {new Date(order.mp_pix_expiration).toLocaleString('pt-BR')}
                  </p>
                )}
              </>
            ) : (
              <div className="text-center">
                <p className="text-green-800 text-sm mb-1">Pague via PIX para a chave:</p>
                <p className="font-bold text-green-900 text-lg">pecasdourados@hotmail.com</p>
                <p className="text-xs text-green-700 mt-2">Valor: {formatPrice(order.total)}</p>
                <p className="text-xs text-gray-500 mt-1">Envie o comprovante pelo WhatsApp após o pagamento</p>
              </div>
            )}
          </div>
        )}

        {/* Dados do pedido */}
        <div className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
          <h3 className="font-bold text-gray-900">Resumo</h3>
          <div className="divide-y">
            {items.map((item, i) => (
              <div key={i} className="flex justify-between py-2.5">
                <div>
                  <p className="text-sm font-medium text-gray-900">{item.name_snapshot}</p>
                  <p className="text-xs text-gray-500">SKU: {item.sku_snapshot} · Qtd: {item.quantity}</p>
                </div>
                <p className="text-sm font-bold text-blue-600">{formatPrice(item.price_snapshot * item.quantity)}</p>
              </div>
            ))}
          </div>
          <div className="flex justify-between pt-2 border-t font-bold">
            <span>Total</span>
            <span className="text-blue-600">{formatPrice(order.total)}</span>
          </div>
        </div>

        {/* Info de entrega/pagamento */}
        <div className="bg-white rounded-2xl p-5 shadow-sm text-sm space-y-2 text-gray-700">
          <div className="flex justify-between">
            <span className="text-gray-500">Cliente</span>
            <span className="font-medium">{order.customer_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Entrega</span>
            <span className="font-medium">{order.delivery_method === 'RETIRADA' ? '🏪 Retirada na loja' : '🚚 Entrega no endereço'}</span>
          </div>
          {order.customer_address && (
            <div className="flex justify-between">
              <span className="text-gray-500">Endereço</span>
              <span className="font-medium text-right">{order.customer_address}, {order.customer_number} — {order.customer_city}/{order.customer_state}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-500">Pagamento</span>
            <span className="font-medium">
              {order.payment_method === 'pix' ? '💰 PIX'
                : order.payment_method === 'credit_card' ? '💳 Cartão Crédito'
                  : order.payment_method === 'debit_card' ? '💳 Cartão Débito'
                    : '💵 Na entrega/retirada'}
            </span>
          </div>
        </div>

        <Link to="/" className="block">
          <Button variant="outline" className="w-full h-12 rounded-xl">
            Continuar comprando
          </Button>
        </Link>
      </div>
    </div>
  );
}
