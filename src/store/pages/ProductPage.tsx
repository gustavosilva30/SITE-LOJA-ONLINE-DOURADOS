import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  isProductDetailUuidSegment,
  storeProductDetailLink,
} from '@/lib/storeProductPath';
import { getApiBaseUrl } from '@/lib/apiBase';
import { Button } from '@/components/ui/button';
import { Package, ArrowLeft, ShoppingCart } from 'lucide-react';
import { StoreProduct } from '../types/store';
import { ProductDetail } from '../components/ProductDetail';
import { WhatsAppButton } from '../components/WhatsAppButton';
import { useCart } from '../hooks/useCart';
import { usePageTitle } from '../lib/usePageTitle';
import {
  STORE_ACCENT,
  STORE_NAVY,
  STORE_NAVY_LIGHT,
  STORE_ON_DARK,
  STORE_PUBLIC_SCOPE_CLASS,
} from '../storeTheme';

export function ProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<StoreProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { itemCount } = useCart();

  usePageTitle(
    product ? `${product.nome}${product.marca ? ` — ${product.marca}` : ''} | Dourados Auto Peças` : null,
    product
      ? `${product.nome}. ${product.marca ? `Peça ${product.marca}. ` : ''}Compre com entrega rápida ou retirada na loja em Dourados/MS.`
      : null,
  );

  useEffect(() => {
    if (slug) {
      fetchProduct(slug);
    }
  }, [slug]);

  const fetchProduct = async (productSlug: string) => {
    setLoading(true);
    try {
      const segment = encodeURIComponent(productSlug);
      const response = await fetch(`${getApiBaseUrl()}/api/store/products/${segment}`);
      const data = await response.json();

      if (response.ok) {
        const apiBase = getApiBaseUrl();
        const processedProduct = {
          ...data,
          imagem_url: data.imagem_url?.startsWith('/api')
            ? `${apiBase}${data.imagem_url}`
            : data.imagem_url,
          imagem_urls: Array.isArray(data.imagem_urls)
            ? data.imagem_urls.map((u: string) => u?.startsWith('/api') ? `${apiBase}${u}` : u)
            : data.imagem_urls,
          images: Array.isArray(data.images)
            ? data.images.map((img: any) => ({
                ...img,
                storage_path: img.storage_path?.startsWith('/api')
                  ? `${apiBase}${img.storage_path}`
                  : img.storage_path,
              }))
            : data.images,
        };

        const canonicalLink = storeProductDetailLink({
          id: processedProduct.id,
          slug: processedProduct.slug,
        });
        if (
          processedProduct.slug?.trim() &&
          isProductDetailUuidSegment(productSlug) &&
          canonicalLink !== `/p/${productSlug}`
        ) {
          navigate(canonicalLink, { replace: true });
          return;
        }

        setProduct(processedProduct);
      } else {
        setError(data.error || 'Produto não encontrado');
      }
    } catch (error) {
      setError('Erro ao carregar produto');
      console.error('Error fetching product:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={`min-h-screen bg-slate-50 flex items-center justify-center ${STORE_PUBLIC_SCOPE_CLASS}`}>
        <Package className="h-8 w-8 animate-spin" style={{ color: STORE_NAVY }} />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className={`min-h-screen bg-slate-50 flex items-center justify-center ${STORE_PUBLIC_SCOPE_CLASS}`}>
        <div className="text-center">
          <Package className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Produto não encontrado</h1>
          <p className="text-gray-500 mb-4">{error}</p>
          <Link to="/">
            <Button className={STORE_ON_DARK} style={{ backgroundColor: STORE_NAVY }}>
              Voltar para a loja
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-slate-50 ${STORE_PUBLIC_SCOPE_CLASS}`}>
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14 sm:h-16 gap-3">
            <div className="flex items-center gap-4 sm:gap-8 min-w-0">
              <Link to="/" className="flex items-center gap-2 sm:gap-3 shrink-0 group">
                <div
                  className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg flex items-center justify-center text-white"
                  style={{ backgroundColor: STORE_NAVY }}
                >
                  <Package className="h-5 w-5" strokeWidth={2.2} />
                </div>
                <span className="hidden sm:inline font-black text-sm sm:text-base truncate" style={{ color: STORE_NAVY }}>
                  Dourados Auto Peças
                </span>
              </Link>
              <Link
                to="/"
                className="flex items-center gap-1.5 text-sm font-bold hover:underline truncate"
                style={{ color: STORE_NAVY_LIGHT }}
              >
                <ArrowLeft className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">Voltar à loja</span>
                <span className="sm:hidden">Loja</span>
              </Link>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <Link to="/checkout" className="relative">
                <Button
                  size="sm"
                  className={`gap-2 font-bold border-0 h-9 sm:h-10 ${STORE_ON_DARK}`}
                  style={{ backgroundColor: STORE_NAVY_LIGHT }}
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span className="hidden sm:inline">Carrinho</span>
                  {itemCount > 0 && (
                    <span
                      className="absolute -top-2 -right-2 text-[10px] font-black rounded-full h-5 min-w-5 px-1 flex items-center justify-center text-black"
                      style={{ backgroundColor: STORE_ACCENT }}
                    >
                      {itemCount > 99 ? '99+' : itemCount}
                    </span>
                  )}
                </Button>
              </Link>
              <WhatsAppButton variant="outline" size="sm" className="hidden sm:flex font-bold border-slate-300" />
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ProductDetail product={product} />
      </div>
    </div>
  );
}
