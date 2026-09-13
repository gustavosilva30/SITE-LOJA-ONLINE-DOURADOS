import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Package, 
  ShoppingCart, 
  CheckCircle2, 
  Clock, 
  Truck,
  Store,
  Phone,
  ArrowLeft,
  AlertCircle,
  RefreshCw
} from 'lucide-react'
import { getApiBaseUrl } from '@/lib/apiBase'

interface OrderItem {
  product_id: string
  quantity: number
  price_snapshot: number
  name_snapshot: string
  sku_snapshot: string
}

interface Payment {
  id: string
  provider: string
  provider_payment_id: string
  status: string
  amount: number
  pix_qr_code_base64: string | null
  pix_qr_code: string | null
  pix_copy_paste: string | null
  pix_expiration_date: string | null
}

interface Order {
  id: string
  order_number: number
  status: string
  payment_status: string
  delivery_method: string
  total: number
  customer_name: string
  customer_phone: string
  customer_email: string | null
  created_at: string
  updated_at: string
}

interface OrderData {
  order: Order
  items: OrderItem[]
  payment: Payment | null
}

export function OrderStatus() {
  const { id } = useParams<{ id: string }>()
  const [orderData, setOrderData] = useState<OrderData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const token = new URLSearchParams(location.search).get('token')

  useEffect(() => {
    if (id && token) {
      fetchOrderStatus()
    }
  }, [id, token])

  const fetchOrderStatus = async () => {
    if (!id || !token) return

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/orders/${id}?token=${token}`)
      const data = await response.json()

      if (response.ok) {
        setOrderData(data)
      } else {
        setError(data.error || 'Pedido não encontrado')
      }
    } catch (error) {
      setError('Erro ao carregar status do pedido')
      console.error('Error fetching order:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const refreshStatus = () => {
    setRefreshing(true)
    fetchOrderStatus()
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(price)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pt-BR')
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800'
      case 'paid':
        return 'bg-blue-100 text-blue-800'
      case 'processing':
        return 'bg-purple-100 text-purple-800'
      case 'shipped':
        return 'bg-indigo-100 text-indigo-800'
      case 'delivered':
        return 'bg-green-100 text-green-800'
      case 'canceled':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Pendente'
      case 'paid':
        return 'Pago'
      case 'processing':
        return 'Em processamento'
      case 'shipped':
        return 'Enviado'
      case 'delivered':
        return 'Entregue'
      case 'canceled':
        return 'Cancelado'
      default:
        return status
    }
  }

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800'
      case 'approved':
        return 'bg-green-100 text-green-800'
      case 'rejected':
        return 'bg-red-100 text-red-800'
      case 'cancelled':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getPaymentStatusText = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Aguardando pagamento'
      case 'approved':
        return 'Pago'
      case 'rejected':
        return 'Rejeitado'
      case 'cancelled':
        return 'Cancelado'
      default:
        return status
    }
  }

  const openWhatsApp = () => {
    const message = `Olá, tenho uma dúvida sobre meu pedido #${orderData?.order.order_number}`
    window.open(`https://wa.me/5567999999999?text=${encodeURIComponent(message)}`, '_blank')
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    alert('Código PIX copiado!')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Package className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !orderData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Pedido não encontrado</h1>
          <p className="text-gray-500 mb-4">{error}</p>
          <Link to="/loja">
            <Button>Voltar para a loja</Button>
          </Link>
        </div>
      </div>
    )
  }

  const { order, items, payment } = orderData

  return (
    <div className="min-h-screen bg-background">
      {import.meta.env.DEV && (
        <div className="bg-yellow-500 text-black text-center py-2 font-bold text-sm">
          ⚠️ Você está na versão legada. Esta rota será removida em breve.
        </div>
      )}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <Link to="/loja" className="inline-flex items-center text-gray-600 hover:text-primary mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar para a loja
          </Link>
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-900">Status do Pedido</h1>
            <Button
              variant="outline"
              onClick={refreshStatus}
              disabled={refreshing}
              className="gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Order Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Order Header */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-2xl font-bold">Pedido #{order.order_number}</h2>
                    <p className="text-gray-600">Realizado em {formatDate(order.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <Badge className={getStatusColor(order.status)}>
                      {getStatusText(order.status)}
                    </Badge>
                    <p className="text-sm text-gray-600 mt-1">Status do pedido</p>
                  </div>
                </div>

                {/* Progress Timeline */}
                <div className="mt-6">
                  <div className="flex items-center justify-between relative">
                    <div className="absolute left-0 right-0 top-5 h-0.5 bg-gray-200"></div>
                    <div className="relative flex items-center justify-between w-full">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center z-10 ${
                        ['paid', 'processing', 'shipped', 'delivered'].includes(order.status)
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-300 text-white'
                      }`}>
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center z-10 ${
                        ['processing', 'shipped', 'delivered'].includes(order.status)
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-300 text-white'
                      }`}>
                        <Package className="w-5 h-5" />
                      </div>
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center z-10 ${
                        ['shipped', 'delivered'].includes(order.status)
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-300 text-white'
                      }`}>
                        <Truck className="w-5 h-5" />
                      </div>
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center z-10 ${
                        order.status === 'delivered'
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-300 text-white'
                      }`}>
                        <Store className="w-5 h-5" />
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-gray-600">
                    <span>Pago</span>
                    <span>Processando</span>
                    <span>Enviado</span>
                    <span>Entregue</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Order Items */}
            <Card>
              <CardHeader>
                <CardTitle>Produtos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {items.map((item, index) => (
                  <div key={index} className="flex items-center space-x-4 pb-4 border-b last:border-b-0">
                    <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center">
                      <Package className="h-8 w-8 text-gray-400" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium">{item.name_snapshot}</h4>
                      <p className="text-sm text-gray-500">SKU: {item.sku_snapshot}</p>
                      <p className="text-sm text-gray-500">Quantidade: {item.quantity}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatPrice(item.price_snapshot)}</p>
                      <p className="text-sm text-gray-500">{formatPrice(item.price_snapshot * item.quantity)}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Payment Info */}
            {payment && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    Pagamento
                    <Badge className={getPaymentStatusColor(payment.status)}>
                      {getPaymentStatusText(payment.status)}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between">
                    <span>Método</span>
                    <span>PIX</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Valor</span>
                    <span className="font-semibold">{formatPrice(payment.amount)}</span>
                  </div>

                  {payment.status === 'pending' && payment.pix_qr_code_base64 && (
                    <div className="border-t pt-4">
                      <p className="text-sm text-gray-600 mb-2">Pague com Pix:</p>
                      <div className="bg-gray-50 rounded-lg p-4 text-center">
                        <img
                          src={`data:image/png;base64,${payment.pix_qr_code_base64}`}
                          alt="QR Code PIX"
                          className="w-32 h-32 mx-auto mb-3"
                        />
                        <p className="text-xs text-gray-600 mb-2">Ou copie o código:</p>
                        <div className="bg-white border p-2 rounded text-xs font-mono break-all mb-3">
                          {payment.pix_copy_paste}
                        </div>
                        <Button
                          onClick={() => copyToClipboard(payment.pix_copy_paste!)}
                          variant="outline"
                          size="sm"
                        >
                          Copiar código PIX
                        </Button>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        Vencimento: {payment.pix_expiration_date ? formatDate(payment.pix_expiration_date) : 'N/A'}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Customer Info */}
            <Card>
              <CardHeader>
                <CardTitle>Dados do Cliente</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm text-gray-600">Nome</p>
                  <p className="font-medium">{order.customer_name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Telefone</p>
                  <p className="font-medium">{order.customer_phone}</p>
                </div>
                {order.customer_email && (
                  <div>
                    <p className="text-sm text-gray-600">E-mail</p>
                    <p className="font-medium">{order.customer_email}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-gray-600">Entrega</p>
                  <p className="font-medium">
                    {order.delivery_method === 'RETIRADA' ? 'Retirada na loja' : 'Frete a combinar'}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Order Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Resumo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatPrice(order.total)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Entrega</span>
                  <span className="text-green-600">
                    {order.delivery_method === 'RETIRADA' ? 'Grátis' : 'A combinar'}
                  </span>
                </div>
                <div className="border-t pt-3">
                  <div className="flex justify-between font-semibold text-lg">
                    <span>Total</span>
                    <span className="text-primary">{formatPrice(order.total)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <Card>
              <CardContent className="p-6 space-y-3">
                <Button
                  onClick={openWhatsApp}
                  variant="outline"
                  className="w-full gap-2"
                >
                  <Phone className="w-4 h-4" />
                  Falar no WhatsApp
                </Button>
                <Link to="/loja" className="block">
                  <Button variant="outline" className="w-full">
                    Continuar comprando
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
