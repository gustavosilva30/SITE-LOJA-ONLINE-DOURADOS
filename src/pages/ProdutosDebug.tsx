import { useEffect, useState } from "react"
import { estoqueApi } from "@/lib/api"

interface Produto {
  id: string
  sku: string
  nome: string
  ativo: boolean
  preco: number
  created_at: string
}

export function ProdutosDebug() {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchProdutos()
  }, [])

  const fetchProdutos = async () => {
    setLoading(true)
    setError(null)
    
    try {
      console.log('Iniciando busca de produtos...')
      
      // Teste 1: lista curta (painel)
      console.log('Teste 1: API estoque painel limit 5')
      const res1 = await estoqueApi.listarProdutos({ painel: true, limit: 5, offset: 0 })
      const data1 = res1 && typeof res1 === 'object' && 'items' in res1 ? (res1 as { items: Produto[] }).items : []
      console.log('Resultado Teste 1:', { data1 })
      
      // Teste 2: lista maior
      console.log('Teste 2: API estoque painel')
      const res2 = await estoqueApi.listarProdutos({ painel: true, limit: 500, offset: 0, ordenar: 'created_at', direcao: 'desc' })
      const data2 = res2 && typeof res2 === 'object' && 'items' in res2 ? (res2 as { items: Produto[] }).items : []
      console.log('Resultado Teste 2:', { n: data2?.length })
      
      setProdutos(data2 || [])
      console.log('Produtos carregados:', data2?.length || 0)
      
    } catch (err: any) {
      console.error('Erro geral:', err)
      setError(`Erro geral: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const testConnection = async () => {
    try {
      console.log('Testando conexão API...')
      const res = await estoqueApi.listarProdutos({ painel: true, limit: 1, offset: 0 })
      console.log('Teste conexão:', res)
    } catch (err) {
      console.error('Erro teste conexão:', err)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Debug - Produtos</h1>
        <p className="text-muted-foreground">Página de diagnóstico para produtos</p>
      </div>

      <div className="space-y-4">
        {/* Status */}
        <div className="p-4 border rounded-lg">
          <h2 className="font-semibold mb-2">Status</h2>
          {loading && <p>Carregando...</p>}
          {error && <p className="text-red-500">Erro: {error}</p>}
          {!loading && !error && <p className="text-green-500">Sucesso! {produtos.length} produtos encontrados</p>}
        </div>

        {/* Ações */}
        <div className="p-4 border rounded-lg">
          <h2 className="font-semibold mb-2">Ações</h2>
          <div className="space-x-2">
            <button 
              onClick={fetchProdutos}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Recarregar Produtos
            </button>
            <button 
              onClick={testConnection}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
            >
              Testar Conexão
            </button>
          </div>
        </div>

        {/* Console Info */}
        <div className="p-4 border rounded-lg">
          <h2 className="font-semibold mb-2">Informações</h2>
          <p>Abra o console (F12) para ver logs detalhados</p>
          <p>URL Supabase: {import.meta.env.VITE_SUPABASE_URL}</p>
        </div>

        {/* Produtos */}
        {produtos.length > 0 && (
          <div className="p-4 border rounded-lg">
            <h2 className="font-semibold mb-2">Produtos Encontrados ({produtos.length})</h2>
            <div className="space-y-2">
              {produtos.slice(0, 10).map((produto) => (
                <div key={produto.id} className="p-2 border rounded">
                  <div><strong>ID:</strong> {produto.id}</div>
                  <div><strong>SKU:</strong> {produto.sku}</div>
                  <div><strong>Nome:</strong> {produto.nome}</div>
                  <div><strong>Ativo:</strong> {produto.ativo ? 'Sim' : 'Não'}</div>
                  <div><strong>Preço:</strong> R$ {produto.preco}</div>
                  <div><strong>Criado:</strong> {new Date(produto.created_at).toLocaleString()}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
