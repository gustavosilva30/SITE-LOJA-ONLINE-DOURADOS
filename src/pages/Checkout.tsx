import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { 
  ShoppingCart, 
  Package, 
  ArrowLeft, 
  Plus, 
  Minus, 
  Trash2,
  Truck,
  Store,
  CreditCard,
  Wallet,
  CheckCircle2,
  AlertCircle
} from 'lucide-react'
import { getApiBaseUrl } from '@/lib/apiBase'
import { storeProductDetailLink } from '@/lib/storeProductPath'

// Declarar tipo para o objeto MercadoPago no window
declare global {
  interface Window {
    MercadoPago: any
  }
}

interface CartItem {
  product_id: string
  slug: string
  nome: string
  sku: string
  public_price: number
  imagem_url: string | null
  quantity: number
}

interface Order {
  id: string
  order_number: number
  public_token: string
  total: number
  status: string
}

interface PaymentData {
  payment: any
  qr_code: string
  qr_code_base64: string
  copy_paste: string
  expiration_date: string
}

export function Checkout() {
  const navigate = useNavigate()
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [order, setOrder] = useState<Order | null>(null)
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Form data
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerCpf, setCustomerCpf] = useState('')
  const [deliveryMethod, setDeliveryMethod] = useState<'RETIRADA' | 'ENTREGA'>('RETIRADA')
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'card'>('pix')
  
  // Card form states
  const [cardToken, setCardToken] = useState('')
  const [issuerId, setIssuerId] = useState('')
  const [paymentMethodId, setPaymentMethodId] = useState('')
  const [installments, setInstallments] = useState('1')
  const [cardholderEmail, setCardholderEmail] = useState('')
  const [identificationType, setIdentificationType] = useState('CPF')
  const [identificationNumber, setIdentificationNumber] = useState('')

  useEffect(() => {
    loadCart()
    initMercadoPago()
  }, [])

  const initMercadoPago = () => {
    // Busca a chave pública das variáveis de ambiente
    const publicKey = import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY
    
    if (!publicKey) {
      console.warn('MercadoPago Public Key not found in environment variables. Checkout features may be disabled.')
      return
    }

    if (window.MercadoPago) {
      new window.MercadoPago(publicKey, {
        locale: 'pt-BR'
      })
    }
  }

  const loadCart = () => {
    const cart = localStorage.getItem('dourados_store_cart')
    if (cart) {
      const items = JSON.parse(cart)
      setCartItems(items)
    }
    setLoading(false)
  }

  const updateQuantity = (productId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromCart(productId)
      return
    }

    const updatedItems = cartItems.map(item =>
      item.product_id === productId ? { ...item, quantity: newQuantity } : item
    )
    setCartItems(updatedItems)
    localStorage.setItem('dourados_store_cart', JSON.stringify(updatedItems))
  }

  const removeFromCart = (productId: string) => {
    const updatedItems = cartItems.filter(item => item.product_id !== productId)
    setCartItems(updatedItems)
    localStorage.setItem('dourados_store_cart', JSON.stringify(updatedItems))
  }

  const clearCart = () => {
    setCartItems([])
    localStorage.removeItem('dourados_store_cart')
  }

  const calculateTotal = () => {
    return cartItems.reduce((sum, item) => sum + (item.public_price * item.quantity), 0)
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(price)
  }

  const validateForm = () => {
    if (!customerName.trim()) {
      setError('Nome é obrigatório')
      return false
    }
    if (!customerPhone.trim()) {
      setError('Telefone é obrigatório')
      return false
    }
    if (customerEmail && !customerEmail.includes('@')) {
      setError('E-mail inválido')
      return false
    }
    if (cartItems.length === 0) {
      setError('Carrinho vazio')
      return false
    }
    return true
  }

  const createOrder = async () => {
    if (!validateForm()) return

    setSubmitting(true)
    setError(null)

    try {
      // 1. Criar pedido no banco
      const orderResponse = await fetch(`${getApiBaseUrl()}/api/checkout/create-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: cartItems.map(item => ({
            product_id: item.product_id,
            quantity: item.quantity
          })),
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
          customer_email: customerEmail.trim() || null,
          customer_cpf: customerCpf.trim() || null,
          delivery_method: deliveryMethod
        })
      })

      const orderData = await orderResponse.json()

      if (!orderResponse.ok) {
        throw new Error(orderData.error || 'Erro ao criar pedido')
      }

      setOrder(orderData.order)

      // 2. Processar pagamento de acordo com o método selecionado
      if (paymentMethod === 'pix') {
        const paymentResponse = await fetch(`${getApiBaseUrl()}/api/payments/mercadopago/create-pix`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            order_id: orderData.order.id
          })
        })

        const paymentResult = await paymentResponse.json()

        if (!paymentResponse.ok) {
          throw new Error(paymentResult.error || 'Erro ao criar pagamento Pix')
        }

        setPaymentData(paymentResult)
      } else {
        // Fluxo de Cartão de Crédito
        // Em uma implementação real com Card Brick, o token seria gerado pelo Brick.
        // Aqui estamos simulando ou preparando para receber o token do formulário.
        
        if (!cardToken) {
          throw new Error('Por favor, preencha os dados do cartão corretamente.')
        }

        const paymentResponse = await fetch(`${getApiBaseUrl()}/api/payments/mercadopago/create-card-payment`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            order_id: orderData.order.id,
            token: cardToken,
            issuer_id: issuerId,
            payment_method_id: paymentMethodId,
            installments: Number(installments),
            payer_email: cardholderEmail || customerEmail,
            identification_type: identificationType,
            identification_number: identificationNumber
          })
        })

        const paymentResult = await paymentResponse.json()

        if (!paymentResponse.ok) {
          throw new Error(paymentResult.error || 'Erro ao processar cartão')
        }

        // Se o pagamento for aprovado, redirecionar ou mostrar sucesso
        if (paymentResult.status === 'approved') {
          setPaymentData({
             ...paymentResult,
             qr_code: '', 
             qr_code_base64: '', 
             copy_paste: '', 
             expiration_date: ''
          })
        } else {
          setError(`Pagamento ${paymentResult.status}: ${paymentResult.status_detail}`)
        }
      }

      clearCart()

    } catch (error: any) {
      setError(error.message)
    } finally {
      setSubmitting(false)
    }
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

  if (cartItems.length === 0 && !order) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <ShoppingCart className="mx-auto h-16 w-16 text-gray-400 mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Seu carrinho está vazio</h1>
            <p className="text-gray-500 mb-6">Adicione produtos para continuar</p>
            <Link to="/loja">
              <Button>Ver produtos</Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (order && paymentData) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <Card>
            <CardContent className="p-8">
              <div className="text-center mb-8">
                <CheckCircle2 className="mx-auto h-16 w-16 text-green-500 mb-4" />
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Pedido criado com sucesso!</h1>
                <p className="text-gray-600">Pedido #{order.order_number}</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div>
                  {paymentMethod === 'pix' ? (
                    <>
                      <h3 className="text-lg font-semibold mb-4">Pague com Pix</h3>
                      <div className="bg-white border rounded-lg p-6 text-center">
                        {paymentData.qr_code_base64 && (
                          <img
                            src={`data:image/png;base64,${paymentData.qr_code_base64}`}
                            alt="QR Code PIX"
                            className="w-48 h-48 mx-auto mb-4"
                          />
                        )}
                        <p className="text-sm text-gray-600 mb-2">Escaneie o QR Code ou copie o código:</p>
                        <div className="bg-gray-100 p-3 rounded text-sm font-mono break-all mb-4">
                          {paymentData.copy_paste}
                        </div>
                        <Button
                          onClick={() => copyToClipboard(paymentData.copy_paste)}
                          variant="outline"
                          className="w-full"
                        >
                          Copiar código PIX
                        </Button>
                      </div>
                      <p className="text-xs text-gray-500 mt-4">
                        Vencimento: {paymentData.expiration_date ? new Date(paymentData.expiration_date).toLocaleString('pt-BR') : 'N/A'}
                      </p>
                    </>
                  ) : (
                    <div className="text-center py-8">
                      <CheckCircle2 className="mx-auto h-12 w-12 text-green-500 mb-4" />
                      <h3 className="text-xl font-bold mb-2">Pagamento Recebido</h3>
                      <p className="text-gray-600">Seu pagamento via cartão de crédito foi processado com sucesso.</p>
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-4">Resumo do pedido</h3>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-gray-600">Número do pedido</p>
                      <p className="font-semibold">#{order.order_number}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Cliente</p>
                      <p className="font-semibold">{customerName}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Telefone</p>
                      <p className="font-semibold">{customerPhone}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Entrega</p>
                      <p className="font-semibold">
                        {deliveryMethod === 'RETIRADA' ? 'Retirada na loja' : 'Frete a combinar'}
                      </p>
                    </div>
                    <div className="border-t pt-4">
                      <p className="text-sm text-gray-600">Total</p>
                      <p className="text-2xl font-bold text-primary">{formatPrice(calculateTotal())}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex flex-col sm:flex-row gap-4">
                <Link to={`/pedido/${order.id}?token=${order.public_token}`} className="flex-1">
                  <Button variant="outline" className="w-full">
                    Acompanhar pedido
                  </Button>
                </Link>
                <Link to="/loja" className="flex-1">
                  <Button className="w-full">
                    Continuar comprando
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

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
          <h1 className="text-3xl font-bold text-gray-900">Checkout</h1>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-3">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <p className="text-red-700">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Cart Items */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Seus produtos</h2>
            {cartItems.map((item) => (
              <Card key={item.product_id}>
                <CardContent className="p-4">
                  <div className="flex space-x-4">
                    <div className="w-20 h-20 bg-gray-100 rounded-lg flex-shrink-0 overflow-hidden">
                      {item.imagem_url ? (
                        <img
                          src={item.imagem_url}
                          alt={item.nome}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="h-8 w-8 text-gray-400" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <Link
                        to={storeProductDetailLink({ id: item.product_id, slug: item.slug })}
                        className="font-medium text-gray-900 hover:text-primary"
                      >
                        {item.nome}
                      </Link>
                      <p className="text-sm text-gray-500">SKU: {item.sku}</p>
                      <p className="text-lg font-semibold text-primary">{formatPrice(item.public_price)}</p>
                    </div>
                    <div className="flex flex-col items-end space-y-2">
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-8 text-center">{item.quantity}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeFromCart(item.product_id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Order Form */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Dados para entrega</h2>
            <Card>
              <CardContent className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                  <Input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Seu nome completo"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefone *</label>
                  <Input
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="(67) 99999-9999"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                  <Input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="seu@email.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CPF</label>
                  <Input
                    value={customerCpf}
                    onChange={(e) => setCustomerCpf(e.target.value)}
                    placeholder="000.000.000-00"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Método de entrega</label>
                  <div className="space-y-2">
                    <label className="flex items-center space-x-3 cursor-pointer p-3 border rounded-lg hover:bg-gray-50 transition-colors">
                      <input
                        type="radio"
                        value="RETIRADA"
                        checked={deliveryMethod === 'RETIRADA'}
                        onChange={(e) => setDeliveryMethod(e.target.value as any)}
                        className="text-primary"
                      />
                      <Store className="h-4 w-4" />
                      <span>Retirada na loja (Grátis)</span>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer p-3 border rounded-lg hover:bg-gray-50 transition-colors">
                      <input
                        type="radio"
                        value="ENTREGA"
                        checked={deliveryMethod === 'ENTREGA'}
                        onChange={(e) => setDeliveryMethod(e.target.value as any)}
                        className="text-primary"
                      />
                      <Truck className="h-4 w-4" />
                      <span>Frete a combinar</span>
                    </label>
                  </div>
                </div>

                <div className="pt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-3">Forma de pagamento</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('pix')}
                      className={`flex flex-col items-center justify-center p-4 border rounded-xl transition-all ${
                        paymentMethod === 'pix' 
                        ? 'border-primary bg-primary/5 text-primary ring-2 ring-primary/20' 
                        : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <Wallet className="h-6 w-6 mb-2" />
                      <span className="font-medium">Pix</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('card')}
                      className={`flex flex-col items-center justify-center p-4 border rounded-xl transition-all ${
                        paymentMethod === 'card' 
                        ? 'border-primary bg-primary/5 text-primary ring-2 ring-primary/20' 
                        : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <CreditCard className="h-6 w-6 mb-2" />
                      <span className="font-medium">Cartão</span>
                    </button>
                  </div>
                </div>

                {paymentMethod === 'card' && (
                  <div className="pt-4 space-y-4 border-t">
                    <div id="cardPaymentBrick_container">
                      {/* O Mercado Pago Card Brick será renderizado aqui */}
                      <p className="text-sm text-gray-500 italic bg-gray-50 p-4 rounded-lg border border-dashed border-gray-300">
                        A integração do formulário de cartão seguro (Card Brick) requer a inicialização do container. 
                        Por favor, clique em finalizar para processar com os dados padrão (Simulação).
                      </p>
                      <div className="mt-4 space-y-3">
                         <Input 
                           placeholder="E-mail do titular" 
                           value={cardholderEmail}
                           onChange={(e) => setCardholderEmail(e.target.value)}
                         />
                         <div className="grid grid-cols-3 gap-2">
                           <select 
                             className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                             value={identificationType}
                             onChange={(e) => setIdentificationType(e.target.value)}
                           >
                             <option value="CPF">CPF</option>
                             <option value="CNPJ">CNPJ</option>
                           </select>
                           <Input 
                             className="col-span-2"
                             placeholder="Número do documento" 
                             value={identificationNumber}
                             onChange={(e) => setIdentificationNumber(e.target.value)}
                           />
                         </div>
                      </div>
                      
                      {/* Nota: Para um ambiente real, carregaríamos o Brick aqui:
                          window.mp.bricks().create("cardPayment", "cardPaymentBrick_container", settings);
                      */}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Order Summary */}
            <Card className="mt-6">
              <CardContent className="p-6">
                <h3 className="font-semibold mb-4">Resumo do pedido</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>{formatPrice(calculateTotal())}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Entrega</span>
                    <span className="text-green-600">
                      {deliveryMethod === 'RETIRADA' ? 'Grátis' : 'A combinar'}
                    </span>
                  </div>
                  <div className="border-t pt-2">
                    <div className="flex justify-between font-semibold text-lg">
                      <span>Total</span>
                      <span className="text-primary">{formatPrice(calculateTotal())}</span>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={createOrder}
                  disabled={submitting}
                  className="w-full mt-6"
                  size="lg"
                >
                  {submitting ? 'Processando...' : 'Finalizar pedido'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
