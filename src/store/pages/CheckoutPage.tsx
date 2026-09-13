import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ShoppingCart, Package, ArrowLeft, Plus, Minus, Trash2,
  Truck, Store, CheckCircle2, AlertCircle, CreditCard, QrCode,
  Copy, Loader2, User, Lock, RefreshCw, Banknote
} from 'lucide-react';
import { useCart } from '../hooks/useCart';
import { useStoreAuth } from '../contexts/StoreAuthContext';
import { StoreLoginModal } from '../components/StoreLoginModal';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { STORE_NAVY, STORE_ON_DARK, STORE_PUBLIC_SCOPE_CLASS } from '../storeTheme';
import { getApiBaseUrl } from '@/lib/apiBase';
import { loadMercadoPagoSdk } from '../lib/loadMercadoPagoSdk';

interface OrderResult {
  id: string;
  order_number: number;
  public_token: string;
  total: number;
  payment_method: string;
  mp_pix_qr_code_base64?: string;
  mp_pix_copy_paste?: string;
  mp_pix_expiration?: string;
}

type PaymentMethod = 'pix' | 'credit_card' | 'debit_card' | 'na_entrega';

const COMBINAR_QUOTE = {
  id: 'a-combinar',
  name: 'A combinar com a loja',
  company: { name: 'Transportadora / A combinar' },
  price: 0,
  custom_price: 0,
  delivery_time: null,
  custom_delivery_time: null,
};
export function CheckoutPage() {
  const navigate = useNavigate();
  const { items, clearCart, total, updateQuantity: updateCartQty, removeItem } = useCart();
  const { customer } = useStoreAuth();

  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [finishedOrder, setFinishedOrder] = useState<OrderResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Forma de pagamento selecionada (UI externa)
  const [selectedPaymentType, setSelectedPaymentType] = useState<'card' | 'pix' | 'offline' | null>(null);
  const [renderBrickTrigger, setRenderBrickTrigger] = useState(0);

  // Dados pessoais
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerCpf, setCustomerCpf] = useState('');

  // Entrega
  const [deliveryMethod, setDeliveryMethod] = useState<'RETIRADA' | 'ENTREGA'>('RETIRADA');
  const [zipcode, setZipcode] = useState('');
  const [address, setAddress] = useState('');
  const [addressNumber, setAddressNumber] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [complement, setComplement] = useState('');
  const [city, setCity] = useState('');
  const [addressState, setAddressState] = useState('');
  const [isFetchingCep, setIsFetchingCep] = useState(false);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingQuotes, setShippingQuotes] = useState<any[]>([COMBINAR_QUOTE]);
  const [selectedShipping, setSelectedShipping] = useState<any | null>(COMBINAR_QUOTE);
  const [shippingError, setShippingError] = useState<string | null>(null);
  const [shippingQuoteId, setShippingQuoteId] = useState<string | null>(null);

  // Pagamento
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [mp, setMp] = useState<any>(null);

  // Inicializar Mercado Pago (SDK carregado sob demanda + só a Public Key, nunca um token de servidor)
  useEffect(() => {
    const publicKey = (import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY || '').trim();
    if (!publicKey) {
      console.warn('VITE_MERCADOPAGO_PUBLIC_KEY não configurada — pagamento online indisponível.');
      setError('Pagamento online temporariamente indisponível. Use "Enviar pelo WhatsApp".');
      return;
    }
    let cancelled = false;
    loadMercadoPagoSdk()
      .then(() => {
        if (cancelled) return;
        const mpInstance = new (window as any).MercadoPago(publicKey, { locale: 'pt-BR' });
        setMp(mpInstance);
      })
      .catch((err) => {
        console.error('Falha ao carregar o SDK do Mercado Pago:', err);
        if (!cancelled) setError('Não foi possível carregar o pagamento online. Tente novamente.');
      });
    return () => { cancelled = true; };
  }, []);

  // Renderizar Brick de Pagamento
  useEffect(() => {
    if (!mp || items.length === 0 || finishedOrder) return;
    
    if (selectedPaymentType === 'card' || selectedPaymentType === 'pix') {
      console.log('Triggering brick render for:', selectedPaymentType);
      const timer = setTimeout(() => {
        const bricksBuilder = mp.bricks();
        initPaymentBrick(bricksBuilder);
      }, 200); // Aumento o delay para 200ms
      return () => clearTimeout(timer);
    }
  }, [mp, items.length, finishedOrder, total, customerEmail, customer?.email, selectedPaymentType]);

  const initPaymentBrick = async (bricksBuilder: any) => {
    if (!bricksBuilder) return;
    
    // Limpar container antes de reinicializar
    const container = document.getElementById('paymentBrick_container');
    if (container) container.innerHTML = '';

    const settings = {
      initialization: {
        amount: total + getSelectedShippingPrice(),
        payer: {
          email: customerEmail || customer?.email || 'cliente@douradosautopecas.com.br',
        },
      },
      customization: {
        paymentMethods: {
          creditCard: selectedPaymentType === 'card' ? 'all' : [],
          debitCard: selectedPaymentType === 'card' ? 'all' : [],
          ticket: [], // Desabilitado ticket (boleto manual) para simplificar
          bankTransfer: selectedPaymentType === 'pix' ? ['pix'] : [],
          maxInstallments: 12
        },
        visual: {
          style: {
            theme: 'light', // explicitly force light theme to prevent dark browser preferences from turning it dark
            customVariables: {
              borderRadius: '16px',
            }
          }
        }
      },
      callbacks: {
        onReady: () => {
          console.log('Payment brick ready');
        },
        onSubmit: async ({ selectedPaymentMethod, formData }: any) => {
          return new Promise((resolve, reject) => {
            processPayment(formData)
              .then(() => resolve(null))
              .catch((error) => {
                console.error(error);
                reject();
              });
          });
        },
        onError: (error: any) => {
          console.error('Payment brick error:', error);
          setError('Erro ao carregar o sistema de pagamento. Tente novamente.');
        },
      },
    };

    try {
      await bricksBuilder.create('payment', 'paymentBrick_container', settings);
    } catch (e) {
      console.error('Error creating payment brick:', e);
    }
  };

  useEffect(() => {
    if (customer) {
      setCustomerName(customer.name || '');
      setCustomerPhone(customer.phone || '');
      setCustomerEmail(customer.email || '');
      setCustomerCpf(customer.cpf || '');
    }
  }, [customer]);

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price || 0);

  const handleCepSearch = async (cep: string) => {
    const clean = cep.replace(/\D/g, '');
    setZipcode(clean);
    if (clean.length === 8) {
      setIsFetchingCep(true);
      try {
        const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
        const data = await res.json();
        if (!data.erro) {
          setAddress(data.logradouro || '');
          setNeighborhood(data.bairro || '');
          setCity(data.localidade || '');
          setAddressState(data.uf || '');
        }
      } catch { }
      finally { setIsFetchingCep(false); }
    }
  };

  const hasItemsWithoutDimensions = items.some(it => 
    !it.peso_g || Number(it.peso_g) <= 0 || 
    !it.altura_cm || Number(it.altura_cm) <= 0 || 
    !it.largura_cm || Number(it.largura_cm) <= 0 || 
    !it.comprimento_cm || Number(it.comprimento_cm) <= 0
  );

  const validateForm = () => {
    if (!customerName.trim()) { setError('Nome é obrigatório'); return false; }
    if (!customerPhone.trim()) { setError('Telefone é obrigatório'); return false; }
    if (!customerCpf.trim()) { setError('CPF/CNPJ é obrigatório'); return false; }
    if (deliveryMethod === 'ENTREGA' && (!zipcode || !address || !addressNumber || !city)) {
      setError('Preencha o endereço completo para entrega'); return false;
    }
    if (deliveryMethod === 'ENTREGA' && !hasItemsWithoutDimensions && !selectedShipping) {
      setError('Selecione uma opção de frete.'); return false;
    }
    if (items.length === 0) { setError('Carrinho vazio'); return false; }
    return true;
  };

  const getSelectedShippingPrice = () => {
    if (deliveryMethod !== 'ENTREGA' || !selectedShipping) return 0;
    const v = selectedShipping.custom_price ?? selectedShipping.price ?? 0;
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };

  const totalWithShipping = total + getSelectedShippingPrice();

  const fetchShippingQuotes = async (toCep: string) => {
    setShippingLoading(true);
    setShippingError(null);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/shipping/me/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: { postal_code: toCep },
          products: items.map((it) => ({
            id: String(it.sku || it.product_id || 'item'),
            insurance_value: Number(it.public_price || 0),
            quantity: Math.max(1, Number(it.quantity || 1)),
            ...(Number(it.peso_g) > 0 ? { weight: Number((it.peso_g / 1000).toFixed(3)) } : {}),
            ...(Number(it.altura_cm) > 0 ? { height: Math.ceil(it.altura_cm) } : {}),
            ...(Number(it.largura_cm) > 0 ? { width: Math.ceil(it.largura_cm) } : {}),
            ...(Number(it.comprimento_cm) > 0 ? { length: Math.ceil(it.comprimento_cm) } : {}),
          })),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || 'Falha ao cotar frete');
      const quotes = Array.isArray(result?.quotes) ? result.quotes : [];
      // O preço do frete é conferido no servidor pela cotação registrada;
      // o checkout envia qual opção foi escolhida, não quanto ela custa.
      setShippingQuoteId(result?.quote_id || null);
      setShippingQuotes([...quotes, COMBINAR_QUOTE]);
      setSelectedShipping(quotes[0] || COMBINAR_QUOTE);
    } catch (e: any) {
      setShippingQuotes([COMBINAR_QUOTE]);
      setSelectedShipping(COMBINAR_QUOTE);
      setShippingError(e?.message || 'Erro ao cotar frete');
    } finally {
      setShippingLoading(false);
    }
  };

  useEffect(() => {
    if (deliveryMethod !== 'ENTREGA') return;
    const cep = zipcode.replace(/\D/g, '');
    if (cep.length !== 8) return;
    if (items.length === 0) return;
    const t = setTimeout(() => { fetchShippingQuotes(cep); }, 450);
    return () => clearTimeout(t);
  }, [deliveryMethod, zipcode, items.length]);

  useEffect(() => {
    if (deliveryMethod === 'RETIRADA') {
      setShippingQuotes([COMBINAR_QUOTE]);
      setSelectedShipping(COMBINAR_QUOTE);
      setShippingError(null);
      setShippingLoading(false);
    } else {
      if (shippingQuotes.length === 0) {
        setShippingQuotes([COMBINAR_QUOTE]);
        setSelectedShipping(COMBINAR_QUOTE);
      }
    }
  }, [deliveryMethod]);

  const handleOfflineOrder = async () => {
    if (!customer) {
      setError('Você precisa estar logado para finalizar o pedido.');
      setIsLoginModalOpen(true);
      return;
    }

    if (!validateForm()) return;
    
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/store/checkout/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
          forma_pagamento: selectedPaymentType === 'offline' ? (deliveryMethod === 'ENTREGA' ? 'dinheiro' : 'dinheiro') : selectedPaymentType,
          modo_entrega: deliveryMethod.toLowerCase(),
          payment_provider: 'manual',
          customer_id: customer.id,
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_email: customerEmail || null,
          customer_cpf: customerCpf || null,
          end_cep: deliveryMethod === 'ENTREGA' ? zipcode : undefined,
          end_logradouro: deliveryMethod === 'ENTREGA' ? address : undefined,
          end_numero: deliveryMethod === 'ENTREGA' ? addressNumber : undefined,
          end_complemento: deliveryMethod === 'ENTREGA' ? complement : undefined,
          end_bairro: deliveryMethod === 'ENTREGA' ? neighborhood : undefined,
          end_cidade: deliveryMethod === 'ENTREGA' ? city : undefined,
          end_uf: deliveryMethod === 'ENTREGA' ? addressState : undefined,
          shipping_price: deliveryMethod === 'ENTREGA' && selectedShipping ? getSelectedShippingPrice() : 0,
          shipping_quote_id: deliveryMethod === 'ENTREGA' ? shippingQuoteId : null,
          shipping_option_id: deliveryMethod === 'ENTREGA' && selectedShipping
            ? String(selectedShipping.option_id ?? selectedShipping.id ?? '')
            : null,
          shipping_service_id: deliveryMethod === 'ENTREGA' && selectedShipping ? String(selectedShipping.id) : undefined,
          shipping_company: deliveryMethod === 'ENTREGA' && selectedShipping ? selectedShipping.company?.name : undefined,
          shipping_delivery_time: deliveryMethod === 'ENTREGA' && selectedShipping ? selectedShipping.delivery_time : undefined,
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || 'Erro ao criar pedido');
      }

      setFinishedOrder({
        id: result.id,
        order_number: result.order_number,
        public_token: result.public_token,
        total: result.total,
        payment_method: 'na_entrega',
      });

      clearCart();
      toast.success('Pedido realizado com sucesso!');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const processPayment = async (formData: any) => {
    if (!customer) {
      setError('Você precisa entrar ou se cadastrar para finalizar a compra.');
      setIsLoginModalOpen(true);
      throw new Error('Usuário não autenticado');
    }

    if (!validateForm()) {
      throw new Error(error || 'Erro de validação no formulário.');
    }
    setSubmitting(true);
    setError(null);

    const isPix = formData.payment_method_id === 'pix';

    try {
      // 1. Cria o pedido — preço/estoque validados e travados no servidor,
      // pagamento ainda pendente (a cobrança real é o passo 2).
      const orderRes = await fetch(`${getApiBaseUrl()}/api/store/checkout/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
          forma_pagamento: isPix ? 'pix' : (formData.payment_type_id === 'debit_card' ? 'cartao_debito' : 'cartao_credito'),
          modo_entrega: deliveryMethod.toLowerCase(),
          payment_provider: 'mercadopago',
          customer_id: customer?.id || null,
          customer_name: customerName.trim() || customer?.name || 'Cliente',
          customer_phone: customerPhone.trim().replace(/\D/g, '') || customer?.phone || '',
          customer_email: customerEmail.trim() || customer?.email || null,
          customer_cpf: customerCpf.trim().replace(/\D/g, '') || null,
          end_cep: deliveryMethod === 'ENTREGA' ? zipcode : undefined,
          end_logradouro: deliveryMethod === 'ENTREGA' ? address : undefined,
          end_numero: deliveryMethod === 'ENTREGA' ? addressNumber : undefined,
          end_complemento: deliveryMethod === 'ENTREGA' ? complement : undefined,
          end_bairro: deliveryMethod === 'ENTREGA' ? neighborhood : undefined,
          end_cidade: deliveryMethod === 'ENTREGA' ? city : undefined,
          end_uf: deliveryMethod === 'ENTREGA' ? addressState : undefined,
          shipping_price: deliveryMethod === 'ENTREGA' && selectedShipping ? getSelectedShippingPrice() : 0,
          shipping_quote_id: deliveryMethod === 'ENTREGA' ? shippingQuoteId : null,
          shipping_option_id: deliveryMethod === 'ENTREGA' && selectedShipping
            ? String(selectedShipping.option_id ?? selectedShipping.id ?? '')
            : null,
          shipping_service_id: deliveryMethod === 'ENTREGA' && selectedShipping ? String(selectedShipping.id) : undefined,
          shipping_company: deliveryMethod === 'ENTREGA' && selectedShipping ? selectedShipping.company?.name : undefined,
          shipping_delivery_time: deliveryMethod === 'ENTREGA' && selectedShipping ? selectedShipping.delivery_time : undefined,
        }),
      });
      const newOrder = await orderRes.json();
      if (!orderRes.ok) {
        throw new Error(newOrder.detail || 'Erro ao criar pedido no servidor');
      }

      // 2. Cobrança real via Mercado Pago — o `token` já foi gerado pelo Brick
      // no browser (PAN/CVV nunca chegam aqui nem no backend).
      const endpoint = isPix
        ? `${getApiBaseUrl()}/api/store/checkout/payments/pix`
        : `${getApiBaseUrl()}/api/store/checkout/payments/card`;

      const body = isPix ? {
        order_id: newOrder.id,
        payer_email: formData.payer.email,
      } : {
        order_id: newOrder.id,
        token: formData.token,
        issuer_id: formData.issuer_id,
        payment_method_id: formData.payment_method_id,
        payment_type_id: formData.payment_type_id || 'credit_card',
        installments: formData.installments,
        payer_email: formData.payer.email,
        payer_identification_type: formData.payer?.identification?.type,
        payer_identification_number: formData.payer?.identification?.number,
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const paymentResult = await response.json();
      if (!response.ok) {
        throw new Error(paymentResult.detail || 'Erro ao processar pagamento no Mercado Pago');
      }
      if (!isPix && paymentResult.status === 'rejected') {
        throw new Error(paymentResult.failure_reason || 'Pagamento recusado. Tente outro cartão.');
      }

      // 3. Sucesso — PIX fica "pendente" (QR na tela), cartão pode já vir aprovado.
      // O status definitivo, em qualquer caso, é confirmado pelo webhook — esta
      // tela só reflete o que o servidor respondeu agora.
      clearCart();
      setFinishedOrder({
        id: newOrder.id,
        order_number: newOrder.order_number,
        public_token: newOrder.public_token,
        total: newOrder.total,
        payment_method: isPix ? 'pix' : 'credit_card',
        mp_pix_qr_code_base64: paymentResult.qr_code_base64,
        mp_pix_copy_paste: paymentResult.copy_paste,
        mp_pix_expiration: paymentResult.expiration_date,
      });

    } catch (err: any) {
      console.error('Erro no processamento:', err);
      setError(err.message || 'Erro ao processar pagamento. Tente novamente.');
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  const copyPix = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  // ─── TELA: Carrinho vazio ───────────────────────────────
  if (items.length === 0 && !finishedOrder) {
    return (
      <div className={`min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4 ${STORE_PUBLIC_SCOPE_CLASS}`}>
        <div className="text-center max-w-sm">
          <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShoppingCart className="w-12 h-12 text-blue-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Carrinho vazio</h1>
          <p className="text-gray-500 mb-6">Adicione produtos para continuar</p>
          <Link to="/">
            <Button className={`bg-blue-600 hover:bg-blue-700 font-bold border-0 ${STORE_ON_DARK}`}>Ver produtos</Button>
          </Link>
        </div>
      </div>
    );
  }

  // ─── TELA: Cliente não autenticado ──────────────────────
  if (!customer && !finishedOrder) {
    return (
      <div className={`min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4 ${STORE_PUBLIC_SCOPE_CLASS}`}>
        <div className="max-w-md w-full space-y-6">
          <div className="text-center">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <User className="w-10 h-10 text-blue-500" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Identifique-se para continuar</h1>
            <p className="text-gray-600 text-sm">
              Para finalizar sua compra, faça login ou cadastre-se informando seu nome ou telefone e uma senha.
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border p-4 space-y-3">
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>Itens no carrinho</span>
              <span className="font-medium">
                {items.reduce((s, i) => s + i.quantity, 0)} {items.length === 1 ? 'item' : 'itens'}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm text-gray-800">
              <span>Total estimado</span>
              <span className="font-bold">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total)}
              </span>
            </div>
          </div>

          <Button
            className={`w-full h-11 font-semibold border-0 ${STORE_ON_DARK}`}
            style={{ backgroundColor: STORE_NAVY }}
            onClick={() => setIsLoginModalOpen(true)}
          >
            Entrar ou cadastrar para continuar
          </Button>

          <p className="text-xs text-center text-gray-500 flex items-center justify-center gap-1">
            <Lock className="w-3 h-3" />
            Seus dados são usados apenas para identificar seus pedidos.
          </p>

          <StoreLoginModal
            isOpen={isLoginModalOpen}
            onClose={() => setIsLoginModalOpen(false)}
            onSuccess={() => {
              setIsLoginModalOpen(false);
            }}
          />
        </div>
      </div>
    );
  }

  // ─── TELA: Pedido finalizado ────────────────────────────
  if (finishedOrder) {
    return (
      <div className={`min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center p-4 ${STORE_PUBLIC_SCOPE_CLASS}`}>
        <div className="max-w-lg w-full">
          {/* Header sucesso */}
          <div className="text-center mb-6">
            <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
              <CheckCircle2 className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Pedido realizado!</h1>
            <p className="text-gray-500 mt-1">
              Pedido #{finishedOrder.order_number} · {formatPrice(finishedOrder.total)}
            </p>
          </div>

          {/* PIX Manual */}
          {finishedOrder.payment_method === 'pix' && (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-green-100 mb-4">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-green-700">
                <QrCode className="w-6 h-6" />
                Pague com PIX
              </h3>
              {finishedOrder.mp_pix_qr_code_base64 ? (
                <>
                  <div className="flex justify-center mb-6">
                    <img
                      src={`data:image/png;base64,${finishedOrder.mp_pix_qr_code_base64}`}
                      alt="QR Code PIX"
                      className="w-56 h-56 border-8 border-green-50 rounded-2xl shadow-inner"
                    />
                  </div>
                  {finishedOrder.mp_pix_copy_paste && (
                    <div className="space-y-3">
                      <p className="text-xs text-center text-gray-500 font-medium">Copie o código abaixo para pagar no seu banco:</p>
                      <button
                        onClick={() => copyPix(finishedOrder.mp_pix_copy_paste!)}
                        className="w-full flex items-center justify-between gap-3 p-4 bg-green-50 border-2 border-green-100 rounded-xl hover:bg-green-100 transition-all hover:scale-[1.02]"
                      >
                        <span className="text-xs font-mono text-green-900 truncate flex-1 text-left uppercase font-bold">
                          {finishedOrder.mp_pix_copy_paste.substring(0, 30)}...
                        </span>
                        {copied
                          ? <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
                          : <Copy className="w-6 h-6 text-green-600 flex-shrink-0" />}
                      </button>
                    </div>
                  )}
                  {copied && <p className="text-center text-xs text-green-600 mt-2 font-black animate-bounce uppercase">✓ Código copiado com sucesso!</p>}
                </>
              ) : (
                <div className="text-center py-4 space-y-2">
                  <p className="text-gray-600 text-sm">Chave PIX para pagamento:</p>
                  <p className="font-bold text-green-700 text-xl">pecasdourados@hotmail.com</p>
                </div>
              )}
            </div>
          )}

          {/* Cartão */}
          {finishedOrder.payment_method === 'credit_card' && (
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-blue-100 mb-4 text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CreditCard className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="font-bold text-xl text-blue-900">Pagamento Processado</h3>
              <p className="text-blue-600 mt-2">Seu pagamento está sendo analisado e o pedido será atualizado em breve.</p>
            </div>
          )}

          {/* Pagamento na entrega (removed from brick, but kept for legacy/manual option if needed) */}
          {finishedOrder.payment_method === 'na_entrega' && (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-amber-100 mb-4">
              <div className="flex items-center gap-3 text-amber-700">
                <Banknote className="w-8 h-8" />
                <div>
                  <p className="font-bold">Pagamento na retirada/entrega</p>
                  <p className="text-sm text-amber-600">Tenha o valor exato: {formatPrice(finishedOrder.total)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Info Pedido */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border mb-6 text-sm text-gray-600 divide-y divide-gray-50 overflow-hidden">
            <div className="flex justify-between py-2">
              <span className="font-medium">Status</span>
              <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-none">Aguardando Pagamento</Badge>
            </div>
            <div className="flex justify-between py-2">
              <span>Pedido</span>
              <span className="font-bold text-gray-900">#{finishedOrder.order_number}</span>
            </div>
            <div className="flex justify-between py-2">
              <span>Total</span>
              <span className="font-bold text-blue-600 text-lg">{formatPrice(finishedOrder.total)}</span>
            </div>
          </div>

          {/* Ações */}
          <div className="space-y-3">
            <Link to={`/pedido/${finishedOrder.id}?token=${finishedOrder.public_token}`} className="block">
              <Button variant="outline" className="w-full h-14 rounded-2xl border-2 border-slate-200 font-bold bg-white text-slate-900 hover:bg-gray-50">
                Acompanhar pedido #{finishedOrder.order_number}
              </Button>
            </Link>
            <Link to="/" className="block">
              <Button className={`w-full h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 font-bold shadow-lg shadow-blue-200 border-0 ${STORE_ON_DARK}`}>
                Voltar para a Loja
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ─── TELA: Formulário de checkout ──────────────────────
  return (
    <div className={`min-h-screen bg-gray-50 pb-20 ${STORE_PUBLIC_SCOPE_CLASS}`}>
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-50 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link to="/" className="text-gray-400 hover:text-gray-900 transition-colors p-1 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex flex-col">
            <h1 className="font-bold text-lg leading-none">Checkout</h1>
            <div className="flex items-center gap-1 opacity-40 mt-0.5">
               <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Seguro via</span>
               <span className="text-[9px] font-black text-blue-600 italic">mercadopago</span>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2 text-[10px] font-bold text-green-600 bg-green-50 px-3 py-1.5 rounded-full border border-green-100 uppercase tracking-wider">
            <Lock className="w-3.5 h-3.5" />
            <span>Pagamento Seguro</span>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Coluna Esquerda: Forms */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Erro */}
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }} 
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-3 p-4 bg-red-50 border-2 border-red-100 rounded-2xl text-red-700 shadow-sm"
              >
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p className="text-sm font-medium">{error}</p>
              </motion.div>
            )}

            {/* ─── Dados pessoais ─── */}
            <section className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-50 bg-gray-50/50">
                <h2 className="font-bold text-gray-900 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                    <User className="w-4 h-4 text-blue-600" />
                  </div>
                  Seus Dados
                </h2>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label htmlFor="customerName" className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5 ml-1">
                      Nome completo *
                    </label>
                    <Input
                      id="customerName"
                      value={customerName}
                      onChange={e => setCustomerName(e.target.value)}
                      placeholder="Ex: João da Silva"
                      className="h-12 rounded-xl bg-gray-50 border-gray-200 focus:bg-white transition-all shadow-sm"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="customerPhone" className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5 ml-1">
                      WhatsApp/Celular *
                    </label>
                    <Input
                      id="customerPhone"
                      value={customerPhone}
                      onChange={e => setCustomerPhone(e.target.value)}
                      placeholder="(00) 00000-0000"
                      className="h-12 rounded-xl bg-gray-50 border-gray-200 focus:bg-white transition-all shadow-sm"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="customerCpf" className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5 ml-1">
                      CPF *
                    </label>
                    <Input
                      id="customerCpf"
                      value={customerCpf}
                      onChange={e => setCustomerCpf(e.target.value)}
                      placeholder="000.000.000-00"
                      className="h-12 rounded-xl bg-gray-50 border-gray-200 focus:bg-white transition-all shadow-sm"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="customerEmail" className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5 ml-1">
                    E-mail *
                  </label>
                  <Input
                    id="customerEmail"
                    type="email"
                    value={customerEmail}
                    onChange={e => setCustomerEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="h-12 rounded-xl bg-gray-50 border-gray-200 focus:bg-white transition-all shadow-sm"
                    required
                  />
                </div>
              </div>
            </section>

            {/* ─── Entrega ─── */}
            <section className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-50 bg-gray-50/50">
                <h2 className="font-bold text-gray-900 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <Truck className="w-4 h-4 text-emerald-600" />
                  </div>
                  Entrega / Retirada
                </h2>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setDeliveryMethod('RETIRADA')}
                    className={`flex flex-col items-center gap-2 p-5 border-2 rounded-2xl transition-all ${deliveryMethod === 'RETIRADA' ? 'border-emerald-500 bg-emerald-50 shadow-inner' : 'border-gray-100 bg-gray-50/50 hover:border-emerald-200'}`}
                  >
                    <Store className={`w-8 h-8 ${deliveryMethod === 'RETIRADA' ? 'text-emerald-600' : 'text-gray-400'}`} />
                    <div className="text-center">
                      <p className="font-bold text-sm">Vou retirar</p>
                      <p className="text-[10px] text-emerald-600 font-black uppercase tracking-widest">Grátis</p>
                    </div>
                  </button>
                  <button
                    onClick={() => setDeliveryMethod('ENTREGA')}
                    className={`flex flex-col items-center gap-2 p-5 border-2 rounded-2xl transition-all ${deliveryMethod === 'ENTREGA' ? 'border-emerald-500 bg-emerald-50 shadow-inner' : 'border-gray-100 bg-gray-50/50 hover:border-emerald-200'}`}
                  >
                    <Truck className={`w-8 h-8 ${deliveryMethod === 'ENTREGA' ? 'text-emerald-600' : 'text-gray-400'}`} />
                    <div className="text-center">
                      <p className="font-bold text-sm">Receber em casa</p>
                      <p className="text-[10px] text-emerald-600 font-black uppercase tracking-widest">Calculado por CEP</p>
                    </div>
                  </button>
                </div>

                {deliveryMethod === 'ENTREGA' && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-4 pt-4 border-t border-gray-50"
                  >
                    <div className="grid grid-cols-3 gap-4">
                      <div className="col-span-2">
                        <label htmlFor="zipcode" className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5 ml-1">CEP *</label>
                        <div className="relative">
                          <Input
                            id="zipcode"
                            value={zipcode}
                            onChange={e => handleCepSearch(e.target.value)}
                            placeholder="00000-000"
                            maxLength={8}
                            className="h-12 rounded-xl bg-gray-50 shadow-sm"
                            required
                          />
                          {isFetchingCep && (
                            <RefreshCw className="absolute right-4 top-4 w-4 h-4 animate-spin text-emerald-500" />
                          )}
                        </div>
                      </div>
                      <div>
                        <label htmlFor="addressState" className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5 ml-1">UF *</label>
                        <Input id="addressState" value={addressState} onChange={e => setAddressState(e.target.value)} className="h-12 rounded-xl bg-gray-50 shadow-sm" required />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="md:col-span-3">
                        <label htmlFor="address" className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5 ml-1">Endereço *</label>
                        <Input id="address" value={address} onChange={e => setAddress(e.target.value)} className="h-12 rounded-xl bg-gray-50 shadow-sm" required />
                      </div>
                      <div>
                        <label htmlFor="addressNumber" className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5 ml-1">Número *</label>
                        <Input id="addressNumber" value={addressNumber} onChange={e => setAddressNumber(e.target.value)} className="h-12 rounded-xl bg-gray-50 shadow-sm" required />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="neighborhood" className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5 ml-1">Bairro *</label>
                        <Input id="neighborhood" value={neighborhood} onChange={e => setNeighborhood(e.target.value)} className="h-12 rounded-xl bg-gray-50 shadow-sm" required />
                      </div>
                      <div>
                        <label htmlFor="city" className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5 ml-1">Cidade *</label>
                        <Input id="city" value={city} onChange={e => setCity(e.target.value)} className="h-12 rounded-xl bg-gray-50 shadow-sm" required />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="complement" className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5 ml-1">Complemento</label>
                      <Input id="complement" value={complement} onChange={e => setComplement(e.target.value)} className="h-12 rounded-xl bg-gray-50 shadow-sm" />
                    </div>

                    {hasItemsWithoutDimensions ? (
                      <div className="mt-2 p-4 rounded-2xl bg-amber-50 border border-amber-200">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-bold text-amber-800">Frete sob consulta</p>
                            <p className="text-xs text-amber-700 mt-1">
                              Uma ou mais peças no seu carrinho necessitam de cotação de frete especial. Finalize o pedido normalmente e nossa equipe entrará em contato para alinhar o envio.
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 p-4 rounded-2xl bg-white border border-gray-100">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Frete (Melhor Envio)</p>
                            <p className="text-sm font-semibold text-gray-900 mt-1">
                              {shippingLoading
                                ? 'Calculando...'
                                : selectedShipping
                                  ? selectedShipping.id === 'a-combinar'
                                    ? 'A combinar com a loja'
                                    : `${selectedShipping.name} • ${formatPrice(getSelectedShippingPrice())} • ${selectedShipping.custom_delivery_time ?? selectedShipping.delivery_time ?? '-'} dias`
                                  : 'Selecione uma opção'}
                            </p>
                            {shippingError && <p className="text-xs text-red-600 mt-1">{shippingError}</p>}
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => zipcode.replace(/\D/g, '').length === 8 && fetchShippingQuotes(zipcode.replace(/\D/g, ''))}
                            disabled={shippingLoading || zipcode.replace(/\D/g, '').length !== 8}
                            className="rounded-xl"
                          >
                            {shippingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                          </Button>
                        </div>

                        {shippingQuotes.length > 0 && (
                          <div className="mt-3 grid gap-2">
                            {shippingQuotes.map((q: any) => {
                              const price = q.custom_price ?? q.price ?? 0
                              const prazo = q.custom_delivery_time ?? q.delivery_time ?? null
                              const selected = selectedShipping?.id === q.id
                              const isCombinar = q.id === 'a-combinar'
                              return (
                              <button
                                key={String(q.id)}
                                type="button"
                                onClick={() => setSelectedShipping(q)}
                                className={`w-full text-left p-3 rounded-xl border transition-all ${selected ? 'border-emerald-500 bg-emerald-50' : 'border-gray-100 hover:border-emerald-200 bg-gray-50/40'}`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-bold text-gray-900">{q.name}</p>
                                    <p className="text-xs text-gray-600 mt-0.5">{q.company?.name || 'Transportadora'}{prazo != null ? ` • ${prazo} dias` : ''}</p>
                                  </div>
                                  <div className="text-sm font-extrabold text-gray-900">{isCombinar ? '--' : formatPrice(Number(price) || 0)}</div>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                    )}
                  </motion.div>
                )}
              </div>
            </section>

            {/* ─── Forma de pagamento ─── */}
            <section className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-50 bg-gray-50/50">
                <h2 className="font-bold text-gray-900 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <CreditCard className="w-4 h-4 text-indigo-600" />
                  </div>
                  Opção de Pagamento
                </h2>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <button
                    onClick={() => setSelectedPaymentType('card')}
                    className={`flex flex-col items-center gap-2 p-4 border-2 rounded-2xl transition-all ${selectedPaymentType === 'card' ? 'border-blue-500 bg-blue-50 shadow-inner' : 'border-gray-100 bg-gray-50/50 hover:border-blue-200'}`}
                  >
                    <CreditCard className={`w-6 h-6 ${selectedPaymentType === 'card' ? 'text-blue-600' : 'text-gray-400'}`} />
                    <span className="font-bold text-xs text-center">Cartão</span>
                  </button>
                  <button
                    onClick={() => setSelectedPaymentType('pix')}
                    className={`flex flex-col items-center gap-2 p-4 border-2 rounded-2xl transition-all ${selectedPaymentType === 'pix' ? 'border-emerald-500 bg-emerald-50 shadow-inner' : 'border-gray-100 bg-gray-50/50 hover:border-emerald-200'}`}
                  >
                    <QrCode className={`w-6 h-6 ${selectedPaymentType === 'pix' ? 'text-emerald-600' : 'text-gray-400'}`} />
                    <span className="font-bold text-xs text-center">PIX Online</span>
                  </button>
                  <button
                    onClick={() => setSelectedPaymentType('offline')}
                    className={`flex flex-col items-center gap-2 p-4 border-2 rounded-2xl transition-all ${selectedPaymentType === 'offline' ? 'border-orange-500 bg-orange-50 shadow-inner' : 'border-gray-100 bg-gray-50/50 hover:border-orange-200'}`}
                  >
                    <Banknote className={`w-6 h-6 ${selectedPaymentType === 'offline' ? 'text-orange-600' : 'text-gray-400'}`} />
                    <span className="font-bold text-xs text-center">{deliveryMethod === 'ENTREGA' ? 'Na Entrega' : 'Na Retirada'}</span>
                  </button>
                </div>

                {selectedPaymentType === 'offline' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-orange-50 border border-orange-100 rounded-2xl text-orange-800 text-xs font-medium space-y-2"
                  >
                    <p>
                      {deliveryMethod === 'ENTREGA' 
                        ? 'Ao selecionar "Na Entrega", você finalizará o pedido agora e fará o pagamento ao receber o produto em casa.' 
                        : 'Ao selecionar "Na Retirada", você finalizará o pedido agora e fará o pagamento diretamente na loja física.'}
                    </p>
                    <Button 
                      className="w-full bg-orange-600 hover:bg-orange-700 h-10 text-white font-bold uppercase tracking-wider"
                      onClick={handleOfflineOrder}
                      disabled={submitting}
                    >
                      {submitting 
                        ? <Loader2 className="animate-spin" /> 
                        : (deliveryMethod === 'ENTREGA' ? 'Confirmar Pedido e Pagar na Entrega' : 'Confirmar Pedido e Pagar na Loja')}
                    </Button>
                  </motion.div>
                )}

                {(selectedPaymentType === 'card' || selectedPaymentType === 'pix') && (
                  <motion.div 
                    key={`payment-area-${selectedPaymentType}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4 pt-2"
                  >
                    <div className="min-h-[400px] w-full bg-gray-50/50 rounded-3xl border border-gray-100 overflow-hidden relative shadow-inner">
                      <div id="paymentBrick_container" className="w-full h-full p-2">
                        {/* Brick MP renderiza aqui */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-10">
                          <RefreshCw className="w-8 h-8 animate-spin mb-2" />
                          <p className="text-[10px] font-bold uppercase tracking-widest">Aguardando Mercado Pago...</p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
                
                {!selectedPaymentType && (
                  <div className="text-center py-8 px-4 bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-200">
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Selecione uma forma de pagamento acima</p>
                  </div>
                )}
              </div>
            </section>

          </div>

          {/* Coluna Direita: Resumo */}
          <div className="lg:col-span-5 space-y-6">
            <div className="sticky top-24 space-y-6">
              <section className="bg-white rounded-3xl shadow-lg border border-gray-100 overflow-hidden">
                  <div className="px-6 py-5 border-b border-gray-50 flex items-center justify-between">
                    <h2 className="font-bold text-gray-900 flex items-center gap-2 uppercase tracking-widest text-xs">
                      Resumo do Pedido
                    </h2>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-[10px] font-bold text-gray-400 hover:text-red-500 gap-1 uppercase tracking-wider"
                      onClick={clearCart}
                    >
                      <Trash2 className="w-3 h-3" />
                      Limpar
                    </Button>
                  </div>
                <div className="p-6">
                <div className="space-y-4 max-h-[40vh] overflow-y-auto custom-scrollbar pr-2 mb-6">
                  {items.map(item => (
                    <div key={item.product_id} className="flex gap-3 group">
                      <div className="w-16 h-16 bg-gray-100 rounded-2xl flex-shrink-0 overflow-hidden border border-gray-100">
                        {item.imagem_url 
                          ? <img src={item.imagem_url} alt={item.nome} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center"><Package className="w-6 h-6 text-gray-300" /></div>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                          <p className="text-sm font-bold text-gray-900 line-clamp-2 leading-tight mb-1">{item.nome}</p>
                          <button 
                            onClick={() => removeItem(item.product_id)}
                            className="text-gray-300 hover:text-red-500 transition-colors p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <div className="flex items-center bg-gray-50 rounded-lg p-0.5 border border-gray-100">
                            <button 
                              onClick={() => updateCartQty(item.product_id, item.quantity - 1)}
                              className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-blue-600"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-6 text-center text-[10px] font-bold text-gray-600">{item.quantity}</span>
                            <button 
                              onClick={() => updateCartQty(item.product_id, item.quantity + 1)}
                              disabled={item.quantity >= item.estoque_disponivel}
                              className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                          <p className="text-sm font-bold text-blue-600">{formatPrice(item.public_price * item.quantity)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-3 pt-6 border-t border-gray-100">
                  <div className="flex justify-between text-sm text-gray-500 font-medium leading-none">
                    <span>Subtotal</span>
                    <span>{formatPrice(total)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-500 font-medium leading-none">
                    <span>Entrega</span>
                    <span className={deliveryMethod === 'RETIRADA' ? 'text-green-600 font-bold' : ''}>
                      {deliveryMethod === 'RETIRADA' ? 'GRÁTIS' : selectedShipping ? (selectedShipping.id === 'a-combinar' ? '--' : formatPrice(getSelectedShippingPrice())) : 'Calcular'}
                    </span>
                  </div>
                  <div className="flex justify-between items-end pt-4">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total a pagar</span>
                      <span className="text-3xl font-black text-blue-600 leading-none">{formatPrice(totalWithShipping)}</span>
                    </div>
                  </div>
                </div>

                {submitting && (
                  <div className="mt-6 p-4 bg-blue-50 rounded-2xl flex items-center gap-3 border border-blue-100">
                    <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
                    <p className="text-xs font-bold text-blue-700 uppercase tracking-wider">Processando solicitação...</p>
                  </div>
                )}
              </div>
              </section>
              
              <div className="px-6 text-center space-y-2">
                <div className="flex items-center justify-center gap-4 opacity-50 grayscale hover:grayscale-0 transition-all">
                  <img src="https://img.icons8.com/color/48/visa.png" className="h-6" alt="Visa" />
                  <img src="https://img.icons8.com/color/48/mastercard.png" className="h-6" alt="Mastercard" />
                  <img src="https://img.icons8.com/color/48/pix.png" className="h-6" alt="PIX" />
                </div>
                <p className="text-[10px] text-gray-400 font-medium">Sua transação é 100% criptografada e segura.</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
