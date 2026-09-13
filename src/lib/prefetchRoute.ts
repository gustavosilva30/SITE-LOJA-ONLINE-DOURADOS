// Prefetch on hover: dispara o dynamic import da rota assim que o mouse entra
// no link, deixando o chunk pronto antes do clique. Padrão usado por Vercel/Linear.
//
// Mapeia o primeiro segmento do path para o `import()` correspondente em App.tsx.
// Cada chave é importada uma única vez (browser cacheia a Promise).

const prefetchers: Record<string, () => Promise<unknown>> = {
  '': () => import('@/pages/Dashboard'),
  produtos: () => import('@/pages/Produtos'),
  'produtos-alteracao-massa': () => import('@/pages/ProdutosAlteracaoMassa'),
  'produtos-criacao-massa': () => import('@/pages/ProdutosCriacaoMassa'),
  orcamentos: () => import('@/pages/Orcamentos'),
  vendas: () => import('@/pages/Vendas_v2'),
  'vendas-concluidas': () => import('@/pages/VendasConcluidas'),
  financeiro: () => import('@/pages/Financeiro'),
  clientes: () => import('@/pages/Clientes'),
  entregas: () => import('@/pages/Entregas'),
  configuracoes: () => import('@/pages/Configuracoes'),
  transportadoras: () => import('@/pages/Transportadoras'),
  lembretes: () => import('@/pages/Lembretes'),
  relatorios: () => import('@/pages/Relatorios'),
  caixa: () => import('@/pages/Caixa'),
  fiscal: () => import('@/pages/Fiscal'),
  agenda: () => import('@/pages/Agenda'),
  'metas-vendedores': () => import('@/pages/MetasVendedores'),
  devolucoes: () => import('@/pages/Devolucoes'),
  indicacoes: () => import('@/pages/Indicacoes'),
  qr: () => import('@/pages/QrScanner'),
  sucatas: () => import('@/pages/Sucatas'),
  localizacoes: () => import('@/pages/Localizacoes'),
  catalogo: () => import('@/pages/Catalogo'),
  'banco-veiculos': () => import('@/pages/BancoVeiculos'),
}

const fired = new Set<string>()

export function prefetchRoute(href: string): void {
  if (!href) return
  // pega só o primeiro segmento útil: "/produtos?cat=1" -> "produtos"
  const seg = href.replace(/^\/+/, '').split(/[/?#]/)[0]
  if (fired.has(seg)) return
  const fn = prefetchers[seg]
  if (!fn) return
  fired.add(seg)
  // requestIdleCallback se disponível, senão microtask
  const run = () => { fn().catch(() => fired.delete(seg)) }
  const ric = (window as any).requestIdleCallback as ((cb: () => void) => void) | undefined
  if (ric) ric(run); else setTimeout(run, 0)
}
