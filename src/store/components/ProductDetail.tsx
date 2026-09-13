import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ShoppingCart,
  Package,
  Phone,
  ArrowLeft,
  CheckCircle2,
  Truck,
  Shield,
  Clock,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { StoreProduct, StoreProductImage, StoreCompatibility } from '../types/store';
import { lojaDetailMainImageClass } from '@/lib/produtoImagemOrientacao';
import { useCart } from '../hooks/useCart';
import { STORE_NAVY, STORE_ON_DARK } from '../storeTheme';
import { getApiBaseUrl } from '@/lib/apiBase';
import { thumbUrl } from '@/lib/thumbUrl';
import { useStoreStatus } from '../hooks/useStoreStatus';
import { resolveStoreImageUrl } from '../lib/resolveStoreImageUrl';

interface ProductDetailProps {
  product: StoreProduct;
  onBack?: () => void;
}

export function ProductDetail({ product, onBack }: ProductDetailProps) {
  const { addItem, isInCart, getItemQuantity } = useCart();
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [mainImageFailed, setMainImageFailed] = useState(false);
  const isStoreOpen = useStoreStatus();

  useEffect(() => {
    setMainImageFailed(false);
  }, [product.id, selectedImageIndex]);

  const resolveImageUrl = resolveStoreImageUrl;

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(price);
  };

  const handleAddToCart = () => {
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

  const openWhatsApp = () => {
    const message = `Olá, tenho interesse no produto: ${product.nome} (${product.sku})`;
    window.open(`https://wa.me/5567999100220?text=${encodeURIComponent(message)}`, '_blank');
  };

  // Priorizar array de imagens do backend, fallback para imagem única
  const allImages = (product.images && product.images.length > 0)
    ? [...product.images].sort((a, b) => a.display_order - b.display_order)
    : (product.imagem_url ? [{
        id: 'main',
        storage_path: product.imagem_url,
        is_primary: true,
        display_order: 0
      }] : []);

  const inCart = isInCart(product.id);
  const quantity = getItemQuantity(product.id);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          {onBack && (
            <Button variant="outline" size="sm" onClick={onBack} className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </Button>
          )}
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{product.nome}</h1>
            <div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
              {product.sku && (
                <span className="bg-gray-100 px-2 py-1 rounded">SKU: {product.sku}</span>
              )}
              {product.marca && (
                <span>Marca: {product.marca}</span>
              )}
              {product.categoria_nome && (
                <span>Categoria: {product.categoria_nome}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Imagens */}
        <div className="space-y-4">
          <div className={lojaDetailMainImageClass(product.imagem_orientacao)}>
            {allImages[selectedImageIndex] && resolveImageUrl(allImages[selectedImageIndex].storage_path) && !mainImageFailed ? (
              <img
                src={resolveImageUrl(allImages[selectedImageIndex].storage_path)}
                alt={product.nome}
                className="w-full h-full object-contain cursor-pointer bg-white/50"
                loading="lazy"
                decoding="async"
                onClick={() => setIsViewerOpen(true)}
                onError={() => setMainImageFailed(true)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package className="h-24 w-24 text-gray-400" />
              </div>
            )}
          </div>

          {allImages.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {allImages.map((image, index) => (
                <button
                  key={image.id}
                  onClick={() => setSelectedImageIndex(index)}
                  className={`aspect-square bg-gray-100 rounded overflow-hidden border-2 transition-colors ${selectedImageIndex === index ? 'border-primary' : 'border-transparent'
                    }`}
                >
                  <img
                    src={resolveImageUrl(thumbUrl(image.storage_path))}
                    alt={`${product.nome} ${index + 1}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      const fallback = resolveImageUrl(image.storage_path);
                      if (e.currentTarget.dataset.fallback === 'done' || !fallback || fallback === e.currentTarget.src) {
                        (e.currentTarget as HTMLElement).style.display = 'none';
                        return;
                      }
                      e.currentTarget.dataset.fallback = 'done';
                      e.currentTarget.src = fallback;
                    }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Informações do Produto */}
        <div className="space-y-8">
          <div className="space-y-4">
            {/* Preço e Estoque */}
            <div className="bg-white p-6 rounded-[2rem] border-2 border-slate-50 shadow-sm space-y-4">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-black text-slate-400 uppercase italic">R$</span>
                <span className="text-5xl font-black text-[#001A54] tracking-tighter tabular-nums">
                  {formatPrice(product.public_price).replace('R$', '').trim()}
                </span>
              </div>
              
              <div className="flex flex-wrap gap-3">
                <Badge
                  className={`border-0 px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-full ${
                    product.estoque_disponivel > 0
                      ? 'bg-[#B6D433] text-[#001A54]'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {product.estoque_disponivel > 0
                    ? `${product.estoque_disponivel} Unidades em Estoque`
                    : 'Produto Indisponível'
                  }
                </Badge>
                <Badge className="bg-[#001A54] text-white border-0 px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-full">
                  Original / Verificado
                </Badge>
              </div>
            </div>

            {/* Ficha Técnica Rápida */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Marca', value: product.marca },
                { label: 'Modelo', value: product.modelo },
                { label: 'Anos', value: product.ano_inicio ? `${product.ano_inicio}${product.ano_fim ? ` - ${product.ano_fim}` : ''}` : null },
                { label: 'Versão', value: product.versao }
              ].map((item, i) => item.value && (
                <div key={i} className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">{item.label}</p>
                  <p className="text-sm font-black text-[#001A54] uppercase tracking-tighter italic">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Ações */}
          <div className="space-y-3 pt-4">
            <Button
              onClick={handleAddToCart}
              disabled={product.estoque_disponivel === 0 || quantity >= product.estoque_disponivel}
              className={`w-full h-16 gap-3 font-black text-lg uppercase tracking-tighter italic border-0 shadow-2xl hover:scale-[1.02] active:scale-95 transition-all ${STORE_ON_DARK} disabled:opacity-50`}
              size="lg"
              style={{ backgroundColor: (product.estoque_disponivel === 0 || quantity >= product.estoque_disponivel) ? '#94a3b8' : STORE_NAVY }}
            >
              <ShoppingCart className="w-6 h-6" strokeWidth={3} />
              {product.estoque_disponivel === 0
                ? 'Sem estoque no momento'
                : quantity >= product.estoque_disponivel
                  ? 'Limite de estoque atingido'
                  : inCart
                    ? `Adicionado (${quantity})`
                    : 'Adicionar ao Carrinho'
              }
            </Button>

            <Button
              onClick={openWhatsApp}
              className="w-full h-16 gap-3 font-black text-lg uppercase tracking-tighter italic bg-emerald-50 hover:bg-[#25D366] text-emerald-700 hover:text-white border-2 border-emerald-300 hover:border-[#25D366] rounded-[1.5rem] transition-all shadow-sm"
            >
              <Phone className="w-6 h-6" />
              Dúvidas? Chame no WhatsApp
            </Button>
          </div>

          {/* Benefícios */}
          <div className="grid grid-cols-2 gap-6 py-6 border-t border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-[#B6D433]">
                <Shield className="w-5 h-5" strokeWidth={2.5} />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-[#001A54]">Garantia de<br/>Qualidade</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-[#B6D433]">
                <Truck className="w-5 h-5" strokeWidth={2.5} />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-[#001A54]">Entrega a<br/>Combinar</span>
            </div>
          </div>

          {/* Horário de Funcionamento */}
          <div className="py-4 border-t border-slate-100 flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${isStoreOpen ? 'bg-slate-50 text-[#B6D433]' : 'bg-red-50 text-red-500'}`}>
              <Clock className="w-5 h-5" strokeWidth={2.5} />
            </div>
            <div>
              <span className={`text-[10px] font-black uppercase tracking-widest block mb-1 ${isStoreOpen ? 'text-[#001A54]' : 'text-red-500'}`}>
                Loja Física {isStoreOpen ? 'Aberta Agora' : 'Fechada Agora'}
              </span>
              <span className="text-[11px] font-bold text-slate-500 block leading-relaxed">
                <span className="text-slate-700">Horário de funcionamento:</span><br/>
                Segunda a Sexta: 07:30 às 11:00 e 13:00 às 17:30<br/>
                Sábados: 08:00 às 12:00
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Seção de Detalhamento Extra */}
      <div className="mt-12 space-y-12">
        {/* Descrição e Info Técnica */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 border-t border-slate-200 pt-12">
          <div className="lg:col-span-2 space-y-8">
            {product.descricao && (
              <section className="space-y-4">
                <h3 className="text-2xl font-black uppercase italic tracking-tighter text-[#001A54]">
                  Descrição do <span className="text-[#B6D433]">Produto</span>
                </h3>
                <div className="bg-white p-8 rounded-[2.5rem] border-2 border-slate-50 shadow-sm">
                  <p className="text-slate-600 font-medium whitespace-pre-wrap leading-relaxed">{product.descricao}</p>
                </div>
              </section>
            )}

            {product.informacoes_adicionais && (
              <section className="space-y-4">
                <h3 className="text-2xl font-black uppercase italic tracking-tighter text-[#001A54]">
                  Detalhamento <span className="text-[#B6D433]">Técnico</span>
                </h3>
                <div className="bg-[#001A54] p-8 rounded-[2.5rem] text-white/90">
                  <p className="font-medium whitespace-pre-wrap leading-relaxed">{product.informacoes_adicionais}</p>
                </div>
              </section>
            )}
          </div>

          {/* Sidebar de Aplicação Rápida */}
          <div className="space-y-6">
            <div className="bg-white p-8 rounded-[2.5rem] border-2 border-slate-50 shadow-lg space-y-6 sticky top-24">
              <h4 className="font-black uppercase italic tracking-tighter text-[#001A54] text-xl">Aplicação Recomendada</h4>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                   <div className="w-2 h-2 rounded-full bg-[#B6D433]" />
                   <span className="text-xs font-bold text-slate-500 uppercase">Marca: <span className="text-[#001A54] font-black">{product.marca || 'N/A'}</span></span>
                </div>
                <div className="flex items-center gap-3">
                   <div className="w-2 h-2 rounded-full bg-[#B6D433]" />
                   <span className="text-xs font-bold text-slate-500 uppercase">Modelo: <span className="text-[#001A54] font-black">{product.modelo || 'N/A'}</span></span>
                </div>
                {product.ano_inicio && (
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-[#B6D433]" />
                    <span className="text-xs font-bold text-slate-500 uppercase">Ano: <span className="text-[#001A54] font-black">{product.ano_inicio} {product.ano_fim ? `/ ${product.ano_fim}` : ''}</span></span>
                  </div>
                )}
              </div>
              <p className="text-[10px] text-slate-400 font-bold uppercase leading-relaxed">
                * Recomendamos que a instalação seja feita por um profissional especializado.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Image Viewer (simplificado) */}
      {isViewerOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4"
          onClick={() => setIsViewerOpen(false)}
        >
          <div className="relative max-w-4xl max-h-full">
            <img
              src={resolveImageUrl(allImages[selectedImageIndex].storage_path)}
              alt={product.nome}
              className="max-w-full max-h-full object-contain"
            />

            {/* Navegação */}
            {allImages.length > 1 && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedImageIndex((prev) =>
                      prev === 0 ? allImages.length - 1 : prev - 1
                    );
                  }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/30 text-white p-2 rounded-full"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedImageIndex((prev) =>
                      prev === allImages.length - 1 ? 0 : prev + 1
                    );
                  }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/30 text-white p-2 rounded-full"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}

            {/* Fechar */}
            <button
              onClick={() => setIsViewerOpen(false)}
              className="absolute top-4 right-4 bg-white/20 hover:bg-white/30 text-white p-2 rounded-full"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
