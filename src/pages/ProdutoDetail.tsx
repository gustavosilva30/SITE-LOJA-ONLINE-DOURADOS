import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ImageViewer } from '@/components/ImageViewer'
import { 
  ShoppingCart, 
  Package, 
  Phone, 
  ArrowLeft, 
  CheckCircle2,
  Truck,
  Shield,
  Clock
} from 'lucide-react'
import { getApiBaseUrl } from '@/lib/apiBase'

interface Product {
  id: string
  sku: string
  nome: string
  descricao: string | null
  public_price: number
  estoque_atual: number
  slug: string
  marca: string | null
  part_number: string | null
  categoria_nome: string | null
  imagem_url: string | null
  imagem_urls: string[]
  images: ProductImage[]
  compatibilities: Compatibility[]
}

interface ProductImage {
  id: string
  storage_path: string
  is_primary: boolean
  display_order: number
}

interface Compatibility {
  marca: string
  modelo: string
  ano: string
  versao: string
}

export function ProdutoDetail() {
  const { slug } = useParams<{ slug: string }>()
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cartCount, setCartCount] = useState(0)
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)
  const [isViewerOpen, setIsViewerOpen] = useState(false)

  useEffect(() => {
    if (slug) {
      fetchProduct(slug)
    }
    loadCartCount()
  }, [slug])

  const fetchProduct = async (productSlug: string) => {
    setLoading(true)
    try {
      const response = await fetch(
        `${getApiBaseUrl()}/api/store/products/${encodeURIComponent(productSlug)}`,
      )
      const data = await response.json()

      if (response.ok) {
        setProduct(data)
        // Configurar imagem selecionada
        if (data.imagem_url && data.images.length === 0) {
          data.images = [{ id: 'main', storage_path: data.imagem_url, is_primary: true, display_order: 0 }]
        }
      } else {
        setError(data.error || 'Produto não encontrado')
      }
    } catch (error) {
      setError('Erro ao carregar produto')
      console.error('Error fetching product:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadCartCount = () => {
    const cart = localStorage.getItem('dourados_store_cart')
    if (cart) {
      const items = JSON.parse(cart)
      setCartCount(items.reduce((sum: number, item: any) => sum + item.quantity, 0))
    }
  }

  const addToCart = () => {
    if (!product || product.estoque_atual === 0) return

    const cart = localStorage.getItem('dourados_store_cart')
    const items = cart ? JSON.parse(cart) : []

    const existingIndex = items.findIndex((item: any) => item.product_id === product.id)

    if (existingIndex > -1) {
      items[existingIndex].quantity += 1
    } else {
      items.push({
        product_id: product.id,
        slug: product.slug,
        nome: product.nome,
        sku: product.sku,
        public_price: product.public_price,
        imagem_url: product.imagem_url,
        quantity: 1
      })
    }

    localStorage.setItem('dourados_store_cart', JSON.stringify(items))
    loadCartCount()
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(price)
  }

  const openWhatsApp = () => {
    const message = `Olá, tenho interesse no produto: ${product?.nome} (${product?.sku})`
    window.open(`https://wa.me/5567999999999?text=${encodeURIComponent(message)}`, '_blank')
  }

  const allImages = product ? [
    ...(product.imagem_url ? [{ id: 'main', storage_path: product.imagem_url, is_primary: true, display_order: -1 }] : []),
    ...product.images
  ].sort((a, b) => a.display_order - b.display_order) : []

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Package className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Package className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Produto não encontrado</h1>
          <p className="text-gray-500 mb-4">{error}</p>
          <Link to="/loja">
            <Button>Voltar para a loja</Button>
          </Link>
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
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-8">
              <Link to="/" className="flex items-center space-x-2">
                <Package className="h-8 w-8 text-primary" />
                <span className="text-xl font-bold text-gray-900">Dourados Auto Peças</span>
              </Link>
            </div>
            <Link to="/checkout" className="relative">
              <Button variant="outline" size="sm" className="gap-2">
                <ShoppingCart className="w-4 h-4" />
                Carrinho
                {cartCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-primary text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    {cartCount}
                  </span>
                )}
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <nav className="flex mb-8" aria-label="Breadcrumb">
          <ol className="flex items-center space-x-2">
            <li>
              <Link to="/loja" className="text-gray-500 hover:text-primary">
                Loja
              </Link>
            </li>
            <li className="flex items-center">
              <span className="mx-2 text-gray-400">/</span>
              <span className="text-gray-900">{product.nome}</span>
            </li>
          </ol>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Images */}
          <div className="space-y-4">
            <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden p-8">
              {allImages[selectedImageIndex] ? (
                <img
                  src={allImages[selectedImageIndex].storage_path}
                  alt={product.nome}
                  className="w-full h-full object-contain cursor-pointer"
                  onClick={() => setIsViewerOpen(true)}
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
                    className={`aspect-square bg-gray-100 rounded overflow-hidden border-2 transition-colors ${
                      selectedImageIndex === index ? 'border-primary' : 'border-transparent'
                    }`}
                  >
                    <img
                      src={image.storage_path}
                      alt={`${product.nome} ${index + 1}`}
                      className="w-full h-full object-contain p-1"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Info */}
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{product.nome}</h1>
              <div className="flex items-center space-x-4 text-sm text-gray-600">
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

            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold text-primary">{formatPrice(product.public_price)}</p>
                <Badge variant={product.estoque_atual > 5 ? 'default' : 'secondary'} className="mt-2">
                  {product.estoque_atual > 0 ? `${product.estoque_atual} unidades em estoque` : 'Sem estoque'}
                </Badge>
              </div>
            </div>

            {product.descricao && (
              <div>
                <h3 className="text-lg font-semibold mb-2">Descrição</h3>
                <p className="text-gray-600 whitespace-pre-wrap">{product.descricao}</p>
              </div>
            )}

            {product.part_number && (
              <div>
                <h3 className="text-lg font-semibold mb-2">Código OEM</h3>
                <p className="text-gray-600">{product.part_number}</p>
              </div>
            )}

            {/* Compatibilidades */}
            {product.compatibilities && product.compatibilities.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-4">Compatibilidade</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Marca</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Modelo</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ano</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Versão</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {product.compatibilities.map((compat, index) => (
                        <tr key={index}>
                          <td className="px-4 py-2 text-sm text-gray-900">{compat.marca}</td>
                          <td className="px-4 py-2 text-sm text-gray-900">{compat.modelo}</td>
                          <td className="px-4 py-2 text-sm text-gray-900">{compat.ano}</td>
                          <td className="px-4 py-2 text-sm text-gray-900">{compat.versao}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Benefits */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center space-x-3">
                <Shield className="h-5 w-5 text-primary" />
                <span className="text-sm text-gray-600">Garantia de qualidade</span>
              </div>
              <div className="flex items-center space-x-3">
                <Truck className="h-5 w-5 text-primary" />
                <span className="text-sm text-gray-600">Entrega rápida</span>
              </div>
              <div className="flex items-center space-x-3">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <span className="text-sm text-gray-600">Produtos verificados</span>
              </div>
              <div className="flex items-center space-x-3">
                <Clock className="h-5 w-5 text-primary" />
                <span className="text-sm text-gray-600">Envio imediato</span>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-4">
              <Button
                onClick={addToCart}
                disabled={product.estoque_atual === 0}
                className="w-full gap-2"
                size="lg"
              >
                <ShoppingCart className="w-5 h-5" />
                {product.estoque_atual === 0 ? 'Sem estoque' : 'Adicionar ao carrinho'}
              </Button>

              <Button
                variant="outline"
                onClick={openWhatsApp}
                className="w-full gap-2"
              >
                <Phone className="w-5 h-5" />
                Falar no WhatsApp
              </Button>
            </div>
          </div>
        </div>

        {/* Back button */}
        <div className="mt-12">
          <Link to="/loja">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Voltar para a loja
            </Button>
          </Link>
        </div>
      </div>

      {/* Image Viewer */}
      {isViewerOpen && (
        <ImageViewer
          isOpen={isViewerOpen}
          images={allImages.map(img => img.storage_path)}
          initialIndex={selectedImageIndex}
          onClose={() => setIsViewerOpen(false)}
        />
      )}
    </div>
  )
}
