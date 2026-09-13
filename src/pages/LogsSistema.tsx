import { useCallback, useEffect, useState } from 'react'
import { configuracoesApi, atendentesApi } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ScrollText, RefreshCw } from 'lucide-react'
import { fmtDateTime } from '@/lib/format'

type LogRow = {
  id: string
  created_at: string
  atendente_id: string | null
  nivel: string
  acao: string | null
  mensagem: string
  codigo_erro: string | null
  detalhe: string | null
  origem: string | null
  atendentes?: { nome: string } | { nome: string }[] | null
}

function nomeAtendenteLog(row: LogRow): string {
  const a = row.atendentes as { nome?: string } | { nome?: string }[] | null | undefined
  if (!a) return '—'
  if (Array.isArray(a)) return a[0]?.nome || '—'
  return a.nome || '—'
}

export function LogsSistema() {
  const today = new Date().toLocaleDateString('en-CA')
  const [dataDia, setDataDia] = useState(today)
  const [filtroAtendente, setFiltroAtendente] = useState<string>('todos')
  const [filtroBusca, setFiltroBusca] = useState<string>('')
  const [debouncedBusca, setDebouncedBusca] = useState<string>('')
  const [filtroNivel, setFiltroNivel] = useState<string>('todos')
  const [logs, setLogs] = useState<LogRow[]>([])
  const [atendentes, setAtendentes] = useState<{ id: string; nome: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    atendentesApi
      .listar({ limit: 500 })
      .then((data) =>
        setAtendentes(
          (data || []).map((a: { id: string; nome?: string }) => ({ id: a.id, nome: a.nome || '' })),
        ),
      )
      .catch(() => setAtendentes([]))
  }, [])

  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedBusca(filtroBusca)
    }, 500)
    return () => clearTimeout(timer)
  }, [filtroBusca])
    
  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const data = await configuracoesApi.listarSistemaLogs({
        data: dataDia,
        atendente_id: filtroAtendente !== 'todos' ? filtroAtendente : undefined,
        nivel: filtroNivel !== 'todos' ? filtroNivel : undefined,
        limit: 500,
          busca: debouncedBusca || undefined,
      })
      setLogs((data as LogRow[]) || [])
    } catch (e) {
      console.error(e)
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [dataDia, filtroAtendente, filtroNivel, debouncedBusca])

  useEffect(() => {
    void fetchLogs()
  }, [fetchLogs])

  const nivelVariant = (n: string) => {
    if (n === 'erro') return 'destructive' as const
    if (n === 'acao') return 'default' as const
    return 'secondary' as const
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ScrollText className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Registro de atividades</h1>
            <p className="text-sm text-muted-foreground">
              Auditoria de todos os atendentes (vendas, produtos, financeiro, etc., quando registrado no sistema). Use o filtro &quot;Atendente&quot; para restringir. Erros do front também aparecem aqui. Os dados vêm da API (PostgreSQL na VPS), sem depender do Supabase.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => void fetchLogs()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 items-end">
          <div className="space-y-1.5">
            <Label>Dia</Label>
            <Input type="date" value={dataDia} onChange={(e) => setDataDia(e.target.value)} className="w-[160px]" />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select
              value={filtroNivel}
              onChange={(e) => setFiltroNivel(e.target.value)}
              className="h-10 min-w-[140px]"
            >
              <option value="todos">Todos</option>
              <option value="acao">Atividades</option>
              <option value="erro">Erros</option>
              <option value="info">Info</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Atendente</Label>
            <Select
              value={filtroAtendente}
              onChange={(e) => setFiltroAtendente(e.target.value)}
              className="h-10 min-w-[200px]"
            >
              <option value="todos">Todos os atendentes</option>
              {(atendentes || []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap w-[170px]">Data e hora</TableHead>
                  <TableHead className="w-[90px]">Tipo</TableHead>
                  <TableHead>Atendente</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Mensagem</TableHead>
                  <TableHead className="w-[120px]">Código</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                      Carregando…
                    </TableCell>
                  </TableRow>
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                      Nenhum registro neste período.
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs whitespace-nowrap">
                        {fmtDateTime(row.created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={nivelVariant(row.nivel)} className="text-[10px] uppercase">
                          {row.nivel}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{nomeAtendenteLog(row)}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground max-w-[140px] truncate" title={row.acao || ''}>
                        {row.acao || '—'}
                      </TableCell>
                      <TableCell className="text-sm max-w-md">
                        <div>{row.mensagem}</div>
                        {row.detalhe ? (
                          <pre className="mt-1 text-[10px] text-muted-foreground whitespace-pre-wrap break-all max-h-20 overflow-y-auto">
                            {row.detalhe}
                          </pre>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-rose-600 dark:text-rose-400">
                        {row.codigo_erro || '—'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
