import { Link, useNavigate } from 'react-router-dom'
import {
  Search,
  ShoppingCart,
  User,
  LogOut,
  ShoppingBag,
  Shield,
  Filter,
  MapPin
} from 'lucide-react'
import { STORE_ACCENT, STORE_ACCENT_FG, STORE_ON_DARK, STORE_PUBLIC_SCOPE_CLASS } from '../storeTheme'
import { StoreJsonLd } from './StoreJsonLd'
import { useStoreAuth } from '../contexts/StoreAuthContext'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { STORE_LOCATION, getStoreGoogleMapsUrl } from '@/lib/storeLocation'

export function StoreLayout({ children }: { children: React.ReactNode }) {
  const { customer, logout } = useStoreAuth()
  const navigate = useNavigate()
  const waAtendimento = `https://wa.me/${STORE_LOCATION.whatsappNumber}?text=` + encodeURIComponent('Olá! Preciso de ajuda com um pedido na loja online.')

  return (
    <div className={`min-h-screen bg-[#F4F7F9] text-slate-900 ${STORE_PUBLIC_SCOPE_CLASS} overflow-x-hidden flex flex-col`}>
      <StoreJsonLd />
      {/* Top Bar - Utilitária */}
      <div className="bg-[#000D2B] text-white/80 py-2 border-b border-white/5">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 flex justify-between items-center text-[10px] sm:text-xs font-bold uppercase tracking-widest">
          <div className="hidden md:flex items-center gap-6">
            <span className="flex items-center gap-1.5 hover:text-white transition-colors cursor-default">
              <Shield className="h-3 w-3 text-[#B6D433]" />
              Compra 100% segura
            </span>
          </div>
          <div className="flex items-center gap-4 sm:gap-6 ml-auto">
            <Link to="/sucatas" className="hover:text-[#B6D433] transition-colors">Veículos para Desmanche</Link>
            <Link to="/meus-pedidos" className="hover:text-white transition-colors">Meus Pedidos</Link>
            <a href={waAtendimento} target="_blank" rel="noreferrer" className="hover:text-white transition-colors flex items-center gap-1">
              Atendimento
            </a>
          </div>
        </div>
      </div>

      {/* Header Principal */}
      <header className="bg-[#001A54] relative z-40 shadow-2xl transition-all duration-500">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 lg:py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-3 shrink-0 group self-center lg:self-auto">
              <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl flex items-center justify-center bg-white shadow-[0_0_20px_rgba(182,212,51,0.3)] group-hover:scale-105 transition-transform p-1.5">
                <img src="/assets/logo-dourados.png" alt="Dourados Auto Peças" className="h-full w-full object-contain" />
              </div>
              <div className="leading-tight">
                <p className="font-black text-xl sm:text-2xl tracking-tighter text-white uppercase italic">
                  Dourados<span style={{ color: STORE_ACCENT }}>AutoPeças</span>
                </p>
                <div className="flex items-center gap-2">
                  <div className="h-1 w-8 rounded-full" style={{ backgroundColor: STORE_ACCENT }} />
                  <p className="text-[10px] sm:text-[11px] text-white/60 font-bold uppercase tracking-[0.2em]">
                    Premium Store
                  </p>
                </div>
              </div>
            </Link>

            {/* User & Cart */}
            <div className="flex items-center justify-center sm:justify-end gap-3 sm:gap-5 shrink-0 ml-auto">
              {customer ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="lg"
                      className="gap-2.5 rounded-2xl border-2 border-white/10 bg-white/5 hover:bg-white/10 text-white font-black h-14 px-5"
                    >
                      <div className="w-8 h-8 rounded-full bg-[#B6D433] flex items-center justify-center text-[#001A54]">
                        <User className="w-4 h-4" />
                      </div>
                      <span className="max-w-[100px] truncate uppercase tracking-tighter">{(customer.name || 'Conta').split(' ')[0]}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 mt-2 rounded-2xl shadow-2xl border-white/10">
                    <Link to="/meus-pedidos">
                      <DropdownMenuItem className="gap-2.5 p-3 cursor-pointer">
                        <ShoppingBag className="w-4 h-4 text-[#001A54]" />
                        <span className="font-bold">Meus Pedidos</span>
                      </DropdownMenuItem>
                    </Link>
                    <DropdownMenuItem className="gap-2.5 p-3 text-red-600 cursor-pointer" onClick={logout}>
                      <LogOut className="w-4 h-4" />
                      <span className="font-bold">Sair da Conta</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button
                  size="lg"
                  className="gap-2.5 rounded-2xl border-2 border-white/10 bg-white/5 hover:bg-white/10 text-white font-black h-14 px-6 uppercase tracking-tighter italic"
                  onClick={() => window.location.href = '/'}
                >
                  <User className="w-5 h-5 text-[#B6D433]" />
                  Entrar
                </Button>
              )}

              <Link to="/checkout" className="relative group">
                <Button
                  size="lg"
                  className="h-14 w-14 sm:w-auto sm:px-6 rounded-2xl border-0 bg-white/10 text-white hover:bg-[#B6D433] hover:text-[#001A54] transition-all group-hover:shadow-[0_0_20px_rgba(182,212,51,0.4)]"
                >
                  <ShoppingCart className="w-6 h-6" strokeWidth={2.5} />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full bg-slate-50">
        {children}
      </main>

      {/* Footer com Schema.org para SEO local */}
      <footer
        className="bg-[#000D2B] text-white/60 py-8 border-t border-white/10 mt-auto"
        itemScope
        itemType="https://schema.org/AutoPartsStore"
      >
        <meta itemProp="name" content="Dourados Auto Peças" />
        <meta itemProp="url" content="https://www.autopecasdourados.com.br" />
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 flex flex-col md:flex-row justify-between items-start gap-6 text-xs">
          {/* Identidade + Endereço */}
          <div className="flex flex-col gap-1">
            <p className="font-bold uppercase tracking-widest mb-1 text-white/80">Dourados Auto Peças</p>
            <address
              className="not-italic flex flex-col gap-0.5 text-white/50"
              itemProp="address"
              itemScope
              itemType="https://schema.org/PostalAddress"
            >
              <span itemProp="streetAddress">Av. Marcelino Pires, 5235 - Vila São Francisco</span>
              <span>
                <span itemProp="addressLocality">Dourados</span>
                {' - '}
                <span itemProp="addressRegion">MS</span>
                {' · CEP '}
                <span itemProp="postalCode">79833-000</span>
              </span>
            </address>
            <div className="flex gap-3 mt-1 text-white/50">
              <a itemProp="telephone" href="tel:+5567999100220" className="hover:text-white transition-colors">
                (67) 99910-0220
              </a>
              <span>·</span>
              <a itemProp="telephone" href="tel:+556734243068" className="hover:text-white transition-colors">
                (67) 3424-3068
              </a>
            </div>
            <p className="mt-2 text-white/30">© {new Date().getFullYear()} Todos os direitos reservados.</p>
          </div>
          {/* Links legais */}
          <div className="flex items-center gap-4 text-white/50 font-bold uppercase tracking-widest text-[10px] md:mt-1">
            <Link to="/legal/terms" className="hover:text-white transition-colors">Termos de Uso</Link>
            <span>|</span>
            <Link to="/legal/privacy" className="hover:text-white transition-colors">Privacidade</Link>
            <span>|</span>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('open-cookie-settings'))}
              className="hover:text-white transition-colors cursor-pointer text-left uppercase tracking-widest font-bold text-[10px]"
            >
              Cookies
            </button>
            <span>|</span>
            <Link to="/legal/deletion" className="hover:text-white transition-colors">LGPD</Link>
          </div>
        </div>
      </footer>
      {/* Floating Store Location */}
      <a
        href={getStoreGoogleMapsUrl()}
        target="_blank"
        rel="noreferrer"
        className="fixed bottom-6 right-6 z-[60] flex items-center gap-2 px-4 py-3 sm:px-5 sm:py-3.5 font-black shadow-[0_8px_30px_rgb(0,0,0,0.12)] transition-all hover:scale-105 hover:-translate-y-1 rounded-full opacity-95 hover:opacity-100"
        style={{ backgroundColor: STORE_ACCENT, color: '#001A54' }}
        title={STORE_LOCATION.fullAddress}
      >
        <MapPin className="h-5 w-5" strokeWidth={3} />
        <span className="text-xs sm:text-sm uppercase tracking-widest">Encontre nossa loja física!</span>
      </a>
    </div>
  )
}
