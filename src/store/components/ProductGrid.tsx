import { StoreProduct } from '../types/store';
import { ProductCard } from './ProductCard';
import { STORE_NAVY } from '../storeTheme';

interface ProductGridProps {
  products: StoreProduct[];
  loading?: boolean;
  showAddToCart?: boolean;
}

export function ProductGrid({ products, loading = false, showAddToCart = true }: ProductGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="animate-pulse">
            <div className="bg-white rounded-2xl border-2 border-slate-100 p-4 shadow-sm">
              <div className="aspect-square bg-slate-200/80 rounded-xl mb-4" />
              <div className="h-3.5 bg-slate-200 rounded-lg mb-2" />
              <div className="h-3.5 bg-slate-200 rounded-lg w-3/4 mb-4" />
              <div className="h-7 rounded-lg w-1/2" style={{ backgroundColor: `${STORE_NAVY}22` }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="text-center py-16 px-4 rounded-2xl border-2 border-dashed border-slate-200 bg-white">
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 text-white"
          style={{ backgroundColor: STORE_NAVY }}
        >
          <svg className="w-8 h-8 opacity-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        </div>
        <h3 className="text-lg font-black mb-2" style={{ color: STORE_NAVY }}>
          Nenhum produto encontrado
        </h3>
        <p className="text-slate-600 text-sm max-w-md mx-auto">Ajuste a busca, o departamento ou os filtros para ver mais resultados.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
      {products.map((product) => (
        <ProductCard 
          key={product.id} 
          product={product} 
          showAddToCart={showAddToCart}
        />
      ))}
    </div>
  );
}
