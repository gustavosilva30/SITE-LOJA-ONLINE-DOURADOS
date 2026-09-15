import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShoppingCart, Package, Eye, Plus, Minus, Trash2, MapPin, Sparkles, RefreshCw, CheckCircle2, Wrench } from 'lucide-react';
import { StoreProduct } from '../types/store';
import { lojaCardImageClass } from '@/lib/produtoImagemOrientacao';
import { useCart } from '../hooks/useCart';
import { STORE_ACCENT, STORE_ACCENT_FG, STORE_NAVY, STORE_NAVY_LIGHT, STORE_ON_DARK } from '../storeTheme';
import { storeProductDetailLink } from '@/lib/storeProductPath';
import { getApiBaseUrl } from '@/lib/apiBase';
import { thumbUrl } from '@/lib/thumbUrl';
import { track } from '../lib/analytics';
import { resolveStoreImageUrl } from '../lib/resolveStoreImageUrl';

interface ProductCardProps {
  product: StoreProduct;
  showAddToCart?: boolean;
}

export function ProductCard({ product, showAddToCart = true }: ProductCardProps) {
  const { addItem, updateQuantity, removeItem, isInCart, getItemQuantity } = useCart();
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    setImageFailed(false);
  }, [product.id, product.imagem_url]);

  const resolveImageUrl = resolveStoreImageUrl;

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(price);
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    track('click', 'add_to_cart', { product_id: product.id, sku: product.sku });

    addItem({
      product_id: product.id,
      slug: product.slug,
      nome: product.nome,
      sku: product.sku,
      public_price: product.public_price,
      imagem_url: product.imagem_url,
      estoque_disponivel: product.estoque_disponivel,
      peso_g: (product as any).peso_g || null,
      altura_cm: (product as any).altura_cm || null,
      largura_cm: (product as any).largura_cm || null,
      comprimento_cm: (product as any).comprimento_cm || null,
    });
  };

  const inCart = isInCart(product.id);
  const quantity = getItemQuantity(product.id);

  const isLowStock = product.estoque_disponivel > 0 && product.estoque_disponivel <= 3;

  return (
    <Link to={storeProductDetailLink(product)} className="block group">
      <Card className="relative h-full border-2 border-slate-100 shadow-[0_10px_30px_rgba(0,26,84,0.04)] rounded-[2rem] overflow-hidden bg-white group-hover:shadow-[0_20px_50px_rgba(0,26,84,0.12)] group-hover:-translate-y-2 group-hover:border-[#B6D433]/30 transition-all duration-500 ease-out">
        {/* Badges de Destaque */}
        <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
          {isLowStock && (
            <Badge className="bg-[#B6D433] text-[#001A54] font-black text-[9px] uppercase tracking-widest px-3 py-1 shadow-xl border-0 animate-pulse">
              Últimas Unidades
            </Badge>
          )}
          {product.public_price < 500 && (
            <Badge className="bg-[#001A54] text-white font-black text-[9px] uppercase tracking-widest px-3 py-1 shadow-xl border-0">
              Oferta
            </Badge>
          )}
        </div>

        <CardContent className="p-0 flex flex-col h-full">
          {/* Imagem do Produto - Container com Aspect Ratio */}
          <div className="relative aspect-square overflow-hidden bg-slate-50 flex items-center justify-center p-3 sm:p-6">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            
            {resolveImageUrl(product.imagem_url) && !imageFailed ? (
              <img
                src={resolveImageUrl(thumbUrl(product.imagem_url))}
                alt={product.nome}
                className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-700 ease-out"
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  const fallbackSrc = resolveImageUrl(product.imagem_url);
                  if (e.currentTarget.dataset.fallback === 'done' || !fallbackSrc || fallbackSrc === e.currentTarget.src) {
                    setImageFailed(true);
                    return;
                  }
                  e.currentTarget.dataset.fallback = 'done';
                  e.currentTarget.src = fallbackSrc;
                }}
              />
            ) : (
              <div className="flex flex-col items-center gap-2 sm:gap-3 text-slate-300">
                <Package className="h-10 w-10 sm:h-16 sm:w-16" strokeWidth={1} />
                <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest">Sem Imagem</span>
              </div>
            )}
            
            {/* Quick View Overlay (Visual Only) */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-[#001A54]/20 backdrop-blur-[2px] pointer-events-none">
              <div className="bg-white text-[#001A54] font-black text-[9px] sm:text-xs uppercase tracking-tighter italic px-4 py-2 sm:px-6 sm:py-3 rounded-xl shadow-2xl scale-90 group-hover:scale-100 transition-transform">
                Ver Detalhes
              </div>
            </div>
          </div>

          {/* Informações do Produto */}
          <div className="p-3 sm:p-6 flex-1 flex flex-col space-y-3 sm:space-y-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                {product.condicao_produto && (
                  <span className={`text-[8px] sm:text-[10px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-1 border ${
                    product.condicao_produto === 'novo' ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' :
                    product.condicao_produto === 'revisado' ? 'bg-sky-500/10 text-sky-700 border-sky-500/20' :
                    product.condicao_produto === 'recondicionado' ? 'bg-purple-500/10 text-purple-700 border-purple-500/20' :
                    'bg-slate-500/10 text-slate-700 border-slate-500/20'
                  }`}>
                    {product.condicao_produto === 'novo' && <Sparkles className="w-2.5 h-2.5 sm:w-3 sm:h-3" />}
                    {product.condicao_produto === 'usado' && <RefreshCw className="w-2.5 h-2.5 sm:w-3 sm:h-3" />}
                    {product.condicao_produto === 'revisado' && <CheckCircle2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" />}
                    {product.condicao_produto === 'recondicionado' && <Wrench className="w-2.5 h-2.5 sm:w-3 sm:h-3" />}
                    {product.condicao_produto}
                  </span>
                )}
                {product.marca && (
                  <span className="text-[8px] sm:text-[10px] font-black text-[#B6D433] bg-[#001A54] px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                    {product.marca}
                  </span>
                )}
                <span className="text-[7px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate max-w-[80px] sm:max-w-none">SKU: {product.sku}</span>
              </div>
              <h3 className="font-bold text-[#001A54] text-sm md:text-base line-clamp-2 leading-tight group-hover:text-[#B6D433] transition-colors">
                {product.nome}
              </h3>
            </div>

            {/* Preço e Estoque */}
            <div className="pt-2 border-t border-slate-50">
              <div className="flex items-baseline gap-1">
                <span className="text-[8px] sm:text-[10px] font-black text-slate-400 uppercase tracking-tighter italic font-bold">R$</span>
                <span className="text-lg sm:text-2xl font-black text-[#001A54] tracking-tighter tabular-nums leading-none">
                  {formatPrice(product.public_price).replace('R$', '').trim()}
                </span>
              </div>
              <div className="flex flex-col xl:flex-row xl:justify-between xl:items-center mt-1 gap-1">
                <p className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  em até 5x no cartão
                </p>
                <p className="text-[8px] sm:text-[10px] font-extrabold text-[#001A54] bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 uppercase tracking-wider flex items-center gap-1 self-start xl:self-auto">
                  {product.estoque_disponivel > 0 
                    ? `${product.estoque_disponivel} un`
                    : 'Sem estoque'}
                </p>
              </div>
            </div>

            {/* Ações */}
            <div className="pt-2 mt-auto">
              {showAddToCart && product.estoque_disponivel > 0 ? (
                <div className="flex items-center gap-1.5 sm:gap-2">
                  {inCart ? (
                    <div className="flex items-center bg-[#F4F7F9] rounded-2xl p-1 sm:p-1.5 flex-1 border border-slate-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 sm:h-10 sm:w-10 text-[#001A54] hover:bg-white rounded-xl shadow-sm"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          updateQuantity(product.id, quantity - 1);
                        }}
                      >
                        <Minus className="w-3 h-3 sm:w-4 sm:h-4" />
                      </Button>
                      <span className="flex-1 text-center font-black text-xs sm:text-sm text-[#001A54] tabular-nums">
                        {quantity}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 sm:h-10 sm:w-10 text-[#001A54] hover:bg-white rounded-xl shadow-sm"
                        disabled={quantity >= product.estoque_disponivel}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                           addItem({
                            product_id: product.id,
                            slug: product.slug,
                            nome: product.nome,
                            sku: product.sku,
                            public_price: product.public_price,
                            imagem_url: product.imagem_url,
                            estoque_disponivel: product.estoque_disponivel,
                          });
                        }}
                      >
                        <Plus className="w-3 h-3 sm:w-4 sm:h-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={handleAddToCart}
                      className="flex-1 gap-2 h-10 sm:h-12 rounded-2xl font-black text-xs sm:text-sm uppercase tracking-tighter italic border-0 shadow-lg hover:scale-[1.02] active:scale-95 transition-all shadow-[#B6D433]/20"
                      style={{ backgroundColor: STORE_ACCENT, color: STORE_ACCENT_FG }}
                    >
                      <ShoppingCart className="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={3} />
                      Comprar
                    </Button>
                  )}
                  
                  {inCart && (
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 sm:h-12 sm:w-12 rounded-2xl border-2 border-red-50 text-red-400 hover:text-white hover:bg-red-500 hover:border-red-500 transition-all shrink-0"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        removeItem(product.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                    </Button>
                  )}
                </div>
              ) : (
                <Button
                  disabled
                  className="w-full h-10 sm:h-12 rounded-2xl font-black text-[9px] sm:text-xs uppercase tracking-widest bg-slate-100 text-slate-400 border-0"
                >
                  Indisponível
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
