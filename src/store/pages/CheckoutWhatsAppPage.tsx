import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
    ShoppingCart, ArrowLeft, Trash2, Plus, Minus,
    MessageCircle, Loader2, Store, CreditCard,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCart } from '../hooks/useCart'
import { useStoreAuth } from '../contexts/StoreAuthContext'
import { StoreLoginModal } from '../components/StoreLoginModal'
import { STORE_NAVY, STORE_ON_DARK, STORE_PUBLIC_SCOPE_CLASS } from '../storeTheme'
import { getApiBaseUrl } from '@/lib/apiBase'
import { track } from '../lib/analytics'

const fmtBRL = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

/**
 * Tarefa E — Checkout via WhatsApp.
 *
 * A loja não processa pagamento nenhum: essa tela só lista o carrinho, exige
 * login, e tem um único botão que registra o pedido no backend (pra histórico/
 * métricas) e abre o WhatsApp da loja com a mensagem pronta. O fechamento em
 * si (forma de pagamento, entrega, etc.) acontece na conversa, fora do site.
 *
 * Substitui CheckoutPage.tsx (Mercado Pago) e CheckoutManualPage.tsx (PIX/
 * cartão/boleto manuais) — nenhuma das duas tem mais lógica de pagamento
 * ativa no backend (ver Tarefa E.1/E.1b), então não faz sentido remendar.
 */
export function CheckoutWhatsAppPage() {
    const navigate = useNavigate()
    const { items, clearCart, total: cartTotal, updateQuantity, removeItem } = useCart()
    const { customer } = useStoreAuth()

    const [loginModalOpen, setLoginModalOpen] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    const handleEnviarWhatsApp = async () => {
        if (!customer) {
            setLoginModalOpen(true)
            return
        }
        if (items.length === 0) {
            toast.error('Seu carrinho está vazio.')
            return
        }

        setSubmitting(true)
        try {
            const res = await fetch(`${getApiBaseUrl()}/api/store/checkout/whatsapp-handoff`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    customer_id: customer.id,
                    customer_name: customer.name,
                    customer_phone: customer.phone,
                    items: items.map((i) => ({
                        product_id: i.product_id,
                        quantity: i.quantity,
                    })),
                }),
            })

            const data = await res.json()
            if (!res.ok) throw new Error(data.error || data.detail || 'Não foi possível enviar o pedido.')

            track('click', 'whatsapp_checkout', { order_number: data.order_number })
            clearCart()
            window.open(data.whatsapp_url, '_blank')
            toast.success(`Pedido #${data.order_number} registrado! Continue pelo WhatsApp.`)
            navigate(`/pedido/${data.order_id}?token=${encodeURIComponent(data.public_token)}`)
        } catch (err: any) {
            toast.error(err.message || 'Não foi possível enviar o pedido. Tente novamente.')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className={`min-h-screen bg-background ${STORE_PUBLIC_SCOPE_CLASS}`}>
            <div className="max-w-3xl mx-auto px-4 py-6 sm:py-10">
                <Link
                    to="/"
                    className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Voltar para a loja
                </Link>

                <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
                    <ShoppingCart className="w-6 h-6" />
                    Finalizar pedido
                </h1>
                <p className="text-sm text-muted-foreground mb-6">
                    Revise seus itens e envie o pedido pelo WhatsApp — a gente combina forma de
                    pagamento e entrega direto na conversa.
                </p>

                {items.length === 0 ? (
                    <Card>
                        <CardContent className="py-12 text-center space-y-4">
                            <ShoppingCart className="w-10 h-10 mx-auto text-muted-foreground" />
                            <p className="text-muted-foreground">Seu carrinho está vazio.</p>
                            <Button onClick={() => navigate('/')} style={{ backgroundColor: STORE_NAVY }} className={STORE_ON_DARK}>
                                Ver produtos
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        <Card className="mb-4">
                            <CardHeader>
                                <CardTitle className="text-base">
                                    Itens ({items.reduce((n, i) => n + i.quantity, 0)})
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {items.map((item) => (
                                    <motion.div
                                        key={item.product_id}
                                        layout
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="flex items-center gap-3 py-2 border-b last:border-0"
                                    >
                                        {item.imagem_url ? (
                                            <img
                                                src={item.imagem_url}
                                                alt={item.nome}
                                                className="w-14 h-14 rounded-md object-cover bg-muted flex-shrink-0"
                                            />
                                        ) : (
                                            <div className="w-14 h-14 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                                                <Store className="w-5 h-5 text-muted-foreground" />
                                            </div>
                                        )}

                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">{item.nome}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {fmtBRL(item.public_price)} cada
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-1.5">
                                            <Button
                                                size="icon"
                                                variant="outline"
                                                className="h-7 w-7"
                                                onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                                            >
                                                <Minus className="w-3 h-3" />
                                            </Button>
                                            <span className="w-6 text-center text-sm">{item.quantity}</span>
                                            <Button
                                                size="icon"
                                                variant="outline"
                                                className="h-7 w-7"
                                                disabled={item.quantity >= item.estoque_disponivel}
                                                onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                                            >
                                                <Plus className="w-3 h-3" />
                                            </Button>
                                        </div>

                                        <p className="text-sm font-semibold w-20 text-right">
                                            {fmtBRL(item.public_price * item.quantity)}
                                        </p>

                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-7 w-7 text-red-500 hover:text-red-600"
                                            onClick={() => removeItem(item.product_id)}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </motion.div>
                                ))}
                            </CardContent>
                        </Card>

                        <Card className="mb-6">
                            <CardContent className="py-4 flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Total estimado</span>
                                <span className="text-xl font-bold">{fmtBRL(cartTotal)}</span>
                            </CardContent>
                        </Card>

                        {!customer && (
                            <p className="text-sm text-center text-muted-foreground mb-3">
                                Você precisa entrar (ou criar sua conta) pra enviar o pedido. Depois
                                de entrar, é só clicar em enviar de novo.
                            </p>
                        )}

                        <Button
                            onClick={handleEnviarWhatsApp}
                            disabled={submitting}
                            className={`w-full h-12 gap-2 font-bold border-0 ${STORE_ON_DARK}`}
                            style={{ backgroundColor: '#25D366' }}
                        >
                            {submitting ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <>
                                    <MessageCircle className="w-5 h-5" />
                                    {customer ? 'Enviar pedido pelo WhatsApp' : 'Entrar e enviar pedido'}
                                </>
                            )}
                        </Button>
                        <p className="text-[11px] text-muted-foreground text-center mt-2">
                            Você combina forma de pagamento e entrega direto com a loja pelo WhatsApp.
                        </p>

                        <div className="relative my-4">
                            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                            <div className="relative flex justify-center text-[10px] uppercase tracking-widest">
                                <span className="bg-background px-2 text-muted-foreground">ou</span>
                            </div>
                        </div>

                        <Link to="/checkout/pagamento" className="block" onClick={() => track('click', 'pay_online_click')}>
                            <Button
                                variant="outline"
                                className="w-full h-12 gap-2 font-bold"
                            >
                                <CreditCard className="w-5 h-5" />
                                Pagar agora com PIX ou Cartão
                            </Button>
                        </Link>
                        <p className="text-[11px] text-muted-foreground text-center mt-2">
                            Retirada na loja — pagamento processado com segurança pelo Mercado Pago.
                        </p>
                    </>
                )}
            </div>

            <StoreLoginModal
                isOpen={loginModalOpen}
                onClose={() => setLoginModalOpen(false)}
            />
        </div>
    )
}
