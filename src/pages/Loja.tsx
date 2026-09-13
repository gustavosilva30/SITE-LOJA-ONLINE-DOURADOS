import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search, ShoppingCart, Package, Filter, ChevronDown } from 'lucide-react'
import { Link } from 'react-router-dom'
import { storeProductDetailLink } from '@/lib/storeProductPath'
import { getApiBaseUrl } from '@/lib/apiBase'
import { STORE_LOCATION } from '@/lib/storeLocation'

interface Product {
  id: string
  sku: string
  nome: string
  descricao: string | null
  public_price: number
  estoque_atual: number
  slug: string
  marca: string | null
  categoria_id: string | null
  categoria_nome: string | null
  imagem_url: string | null
  imagem_urls: string[]
}

interface Category {
  id: string
  nome: string
  descricao: string | null
}

export function Loja() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedBrand, setSelectedBrand] = useState('')
  const [sortBy, setSortBy] = useState('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [allBrands, setAllBrands] = useState<string[]>([])
  const [showFilters, setShowFilters] = useState(false)
  const [cartCount, setCartCount] = useState(0)

  useEffect(() => {
    fetchCategories()
    fetchBrands()
    loadCartCount()
  }, [])

  useEffect(() => {
    fetchProducts()
  }, [currentPage, searchTerm, selectedCategory, selectedBrand, sortBy, sortOrder])

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '20',
        sortBy,
        sortOrder
      })

      if (searchTerm) params.append('q', searchTerm)
      if (selectedCategory) params.append('category', selectedCategory)
      if (selectedBrand) params.append('brand', selectedBrand)

      const response = await fetch(`${getApiBaseUrl()}/api/store/products?${params}`)
      const data = await response.json()

      if (response.ok) {
        setProducts(data.products)
        setTotalPages(data.pagination.pages)
      } else {
        console.error('Error fetching products:', data.error)
      }
    } catch (error) {
      console.error('Error fetching products:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchCategories = async () => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/store/categories`)
      const data = await response.json()

      if (response.ok) {
        setCategories(data)
      }
    } catch (error) {
      console.error('Error fetching categories:', error)
    }
  }

  const fetchBrands = async () => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/store/brands`)
      const data = await response.json()
      if (response.ok) {
        setAllBrands(data)
      }
    } catch (error) {
      console.error('Error fetching brands:', error)
    }
  }

  const loadCartCount = () => {
    const cart = localStorage.getItem('dourados_store_cart')
    if (cart) {
      const items = JSON.parse(cart)
      setCartCount(items.reduce((sum: number, item: any) => sum + item.quantity, 0))
    }
  }

  const addToCart = (product: Product) => {
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

  const clearFilters = () => {
    setSearchTerm('')
    setSelectedCategory('')
    setSelectedBrand('')
    setSortBy('created_at')
    setSortOrder('desc')
    setCurrentPage(1)
  }

  if (loading && currentPage === 1) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Package className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F2F2F2] store-public-scope font-sans">
      {import.meta.env.DEV && (
        <div className="bg-yellow-500 text-black text-center py-2 font-bold text-sm">
          ⚠️ Você está na versão legada. Esta rota será removida em breve.
        </div>
      )}
      {/* Header Estilo PitStop */}
      <header className="bg-primary text-white sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between py-4 gap-4">
            <Link to="/" className="flex items-center space-x-2 shrink-0">
              <Package className="h-8 w-8 text-accent" />
              <span className="text-xl font-bold tracking-tight">Dourados <span className="text-accent">Auto Peças</span></span>
            </Link>

            {/* Busca Centralizada */}
            <div className="relative flex-1 max-w-2xl w-full">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
              <Input
                placeholder="O que você está procurando hoje? (Ex: Amortecedor, Pastilha...)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-12 py-6 bg-white text-gray-900 border-none rounded-full focus-visible:ring-2 focus-visible:ring-accent"
              />
            </div>

            <div className="flex items-center space-x-6">
              <nav className="hidden lg:flex space-x-6 font-medium">
                <Link to="/loja" className="hover:text-accent transition-colors">Loja</Link>
                <Link to="/contato" className="hover:text-accent transition-colors">Contato</Link>
              </nav>
              
              <Link to="/checkout" className="relative group">
                <div className="bg-accent p-2 rounded-full text-primary hover:bg-white transition-all">
                  <ShoppingCart className="w-6 h-6" />
                  {cartCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center border-2 border-primary">
                      {cartCount}
                    </span>
                  )}
                </div>
              </Link>
            </div>
          </div>
        </div>

        {/* Sub-header / Categorias Quick Access */}
        <div className="bg-white/10 border-t border-white/5 hidden md:block">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center h-10 space-x-8 text-xs uppercase font-bold tracking-widest overflow-x-auto no-scrollbar">
            {categories.slice(0, 8).map(cat => (
              <button 
                key={cat.id} 
                onClick={() => setSelectedCategory(cat.id)}
                className={`hover:text-accent transition-colors whitespace-nowrap ${selectedCategory === cat.id ? 'text-accent border-b-2 border-accent' : ''}`}
              >
                {cat.nome}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex justify-end">
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-2"
          >
            <Filter className="w-4 h-4" />
            Filtros
            <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </Button>
        </div>

          {showFilters && (
            <Card className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary"
                  >
                    <option value="">Todas</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Marca</label>
                  <select
                    value={selectedBrand}
                    onChange={(e) => setSelectedBrand(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary"
                  >
                    <option value="">Todas</option>
                    {allBrands.map((brand) => (
                      <option key={brand} value={brand}>
                        {brand}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ordenar por</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary"
                  >
                    <option value="created_at">Mais novos</option>
                    <option value="nome">Nome</option>
                    <option value="public_price">Preço</option>
                    <option value="estoque_atual">Estoque</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <Button variant="outline" onClick={clearFilters} className="w-full">
                    Limpar filtros
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Products Grid */}
        {products.length === 0 ? (
          <div className="text-center py-12">
            <Package className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum produto encontrado</h3>
            <p className="text-gray-500">Tente ajustar seus filtros ou termos de busca</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {products.map((product) => (
                <Card key={product.id} className="group border-none shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 bg-white overflow-hidden flex flex-col">
                  <Link to={storeProductDetailLink(product)} className="flex-1">
                    <div className="relative aspect-[4/3] bg-gray-50 overflow-hidden p-4">
                      {product.imagem_url ? (
                        <img
                          src={product.imagem_url}
                          alt={product.nome}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="h-12 w-12 text-gray-300" />
                        </div>
                      )}
                      
                      {/* Badge de Categoria Estilo PitStop */}
                      {product.categoria_nome && (
                        <div className="absolute top-2 left-2">
                          <Badge className="bg-accent text-primary font-bold border-none text-[10px] uppercase tracking-tighter">
                            {product.categoria_nome}
                          </Badge>
                        </div>
                      )}
                    </div>

                    <div className="p-4 space-y-3">
                      <div className="min-h-[48px]">
                        <h3 className="font-semibold text-gray-800 text-sm line-clamp-2 leading-tight group-hover:text-primary transition-colors">
                          {product.nome}
                        </h3>
                      </div>
                      
                      <div className="space-y-1">
                        {product.marca && (
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{product.marca}</p>
                        )}
                        <div className="flex flex-col">
                          <span className="text-xl font-extrabold text-primary">
                            {formatPrice(product.public_price)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                  
                  <div className="p-4 pt-0">
                    <Button
                      onClick={() => addToCart(product)}
                      disabled={product.estoque_atual === 0}
                      className="w-full bg-primary hover:bg-accent hover:text-primary text-white font-bold uppercase text-xs tracking-widest py-5 rounded-md transition-all group-hover:scale-[1.02]"
                    >
                      <ShoppingCart className="w-4 h-4 mr-2" />
                      {product.estoque_atual === 0 ? 'Indisponível' : 'Comprar'}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center space-x-2 mt-8">
                <Button
                  variant="outline"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(currentPage - 1)}
                >
                  Anterior
                </Button>
                <span className="text-sm text-gray-600">
                  Página {currentPage} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(currentPage + 1)}
                >
                  Próxima
                </Button>
              </div>
            )}
          </>
        )}

      {/* Footer */}
      <footer className="bg-gray-900 text-white mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <Package className="h-6 w-6" />
                <span className="text-lg font-bold">Dourados Auto Peças</span>
              </div>
              <p className="text-gray-400">
                Sua loja de confiança para autopeças em Dourados e região.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Links Úteis</h3>
              <ul className="space-y-2 text-gray-400">
                <li><Link to="/loja" className="hover:text-white">Loja</Link></li>
                <li><Link to="/contato" className="hover:text-white">Contato</Link></li>
                <li><a href={`https://wa.me/${STORE_LOCATION.whatsappNumber}`} target="_blank" rel="noopener noreferrer" className="hover:text-white">WhatsApp</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Contato</h3>
              <ul className="space-y-2 text-gray-400">
                <li>{STORE_LOCATION.phoneDisplay}</li>
                <li>pecasdourados@hotmail.com</li>
                <li>{STORE_LOCATION.fullAddress.split('-')[0].trim()}</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; {new Date().getFullYear()} Dourados Auto Peças. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
