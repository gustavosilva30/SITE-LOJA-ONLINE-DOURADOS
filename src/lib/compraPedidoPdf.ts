import type { jsPDF } from 'jspdf'
import { fmtDate, formatNumCompraPedido } from '@/lib/format'

export type CompraPedidoPdfEmpresa = {
  nome_fantasia?: string | null
  razao_social?: string | null
  telefone?: string | null
  email?: string | null
  endereco?: string | null
  cnpj?: string | null
}

export type CompraPedidoPdfItem = {
  codigo: string
  descricao: string
  quantidade: number
  unidade: string
  observacao?: string | null
}

export type CompraPedidoPdfPayload = {
  numero: number
  status: string
  createdAt: string
  fornecedorNome: string
  fornecedorContato?: string | null
  fornecedorEmail?: string | null
  fornecedorCnpj?: string | null
  observacoes?: string | null
  empresa: CompraPedidoPdfEmpresa | null
  itens: CompraPedidoPdfItem[]
  solicitanteNome?: string | null
}

const statusLabel: Record<string, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado ao fornecedor',
  recebido: 'Recebido',
  cancelado: 'Cancelado',
}

function empresaLinha(e: CompraPedidoPdfEmpresa | null): string {
  if (!e) return ''
  return (e.nome_fantasia || e.razao_social || '').trim()
}

/** Gera PDF A4 profissional do pedido de compra. */
export async function buildCompraPedidoPdf(p: CompraPedidoPdfPayload): Promise<jsPDF> {
  const { jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 16
  let y = margin

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(15, 23, 42)
  doc.text(empresaLinha(p.empresa) || 'Pedido de compra', margin, y)
  y += 7

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(71, 85, 105)
  const emp = p.empresa
  if (emp?.cnpj) {
    doc.text(`CNPJ: ${emp.cnpj}`, margin, y)
    y += 4
  }
  if (emp?.endereco) {
    const lines = doc.splitTextToSize(emp.endereco, pageW - margin * 2)
    doc.text(lines, margin, y)
    y += lines.length * 4
  }
  if (emp?.telefone || emp?.email) {
    doc.text([emp?.telefone, emp?.email].filter(Boolean).join(' · '), margin, y)
    y += 5
  }

  y += 4
  doc.setDrawColor(226, 232, 240)
  doc.line(margin, y, pageW - margin, y)
  y += 8

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(15, 23, 42)
  doc.text(
    p.numero > 0 ? `PEDIDO DE COMPRA Nº ${formatNumCompraPedido(p.numero)}` : 'PEDIDO DE COMPRA (rascunho — guarde para obter número)',
    margin,
    y
  )
  y += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(71, 85, 105)
  doc.text(`Data: ${fmtDate(p.createdAt)}`, margin, y)
  y += 4
  doc.text(`Situação: ${statusLabel[p.status] || p.status}`, margin, y)
  y += 8

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(15, 23, 42)
  doc.text('Fornecedor', margin, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(30, 41, 59)
  doc.text(p.fornecedorNome || '—', margin, y)
  y += 4
  if (p.fornecedorCnpj) {
    doc.text(`CNPJ: ${p.fornecedorCnpj}`, margin, y)
    y += 4
  }
  if (p.fornecedorContato) {
    doc.text(`Contato: ${p.fornecedorContato}`, margin, y)
    y += 4
  }
  if (p.fornecedorEmail) {
    doc.text(`E-mail: ${p.fornecedorEmail}`, margin, y)
    y += 4
  }
  y += 4

  if (p.solicitanteNome) {
    doc.setTextColor(71, 85, 105)
    doc.text(`Solicitante (loja): ${p.solicitanteNome}`, margin, y)
    y += 6
  }

  const body = p.itens.map((it, idx) => [
    String(idx + 1),
    it.codigo || '—',
    it.descricao || '—',
    it.unidade || 'UN',
    String(it.quantidade),
    (it.observacao || '').trim() || '—',
  ])

  autoTable(doc, {
    startY: y,
    head: [['#', 'Código', 'Descrição', 'Un.', 'Qtd', 'Obs.']],
    body,
    styles: { fontSize: 8, cellPadding: 2.5, textColor: [30, 41, 59] },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: 255,
      fontStyle: 'bold',
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 28 },
      2: { cellWidth: 62 },
      3: { cellWidth: 14, halign: 'center' },
      4: { cellWidth: 16, halign: 'right' },
      5: { cellWidth: 36 },
    },
    margin: { left: margin, right: margin },
  })

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 40
  let footY = finalY + 10

  if (p.observacoes?.trim()) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(15, 23, 42)
    doc.text('Observações gerais', margin, footY)
    footY += 5
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(71, 85, 105)
    const obsLines = doc.splitTextToSize(p.observacoes.trim(), pageW - margin * 2)
    doc.text(obsLines, margin, footY)
    footY += obsLines.length * 4 + 6
  }

  const signY = Math.max(footY, 250)
  doc.setDrawColor(203, 213, 225)
  doc.line(margin, signY, margin + 70, signY)
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  doc.text('Assinatura / carimbo fornecedor', margin, signY + 4)

  doc.setFontSize(7)
  doc.setTextColor(148, 163, 184)
  doc.text(
    `Documento gerado em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date())}`,
    margin,
    doc.internal.pageSize.getHeight() - 10
  )

  return doc
}

export function downloadCompraPedidoPdf(doc: jsPDF, numero: number) {
  doc.save(`pedido-compra-${formatNumCompraPedido(numero)}.pdf`)
}

export function printCompraPedidoPdf(doc: jsPDF) {
  const blob = doc.output('blob')
  const url = URL.createObjectURL(blob)
  const w = window.open(url)
  if (w) {
    const onLoad = () => {
      w.print()
      w.removeEventListener('load', onLoad)
    }
    w.addEventListener('load', onLoad)
  } else {
    URL.revokeObjectURL(url)
  }
}
