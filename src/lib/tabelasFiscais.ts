/**
 * Tabelas fiscais de referência (CFOP saída, CSOSN, CST ICMS, origem, PIS/COFINS).
 * Usadas em FiscalSelect (Configurações, Fiscal, Produtos).
 */

export type FiscalOption = { value: string; label: string }

export const CSOSN_OPTIONS: FiscalOption[] = [
  { value: "101", label: "Tributada pelo Simples Nacional com permissão de crédito" },
  { value: "102", label: "Tributada pelo Simples Nacional sem permissão de crédito" },
  { value: "103", label: "Isenção do ICMS no Simples Nacional para faixa de receita bruta" },
  { value: "201", label: "Tributada pelo Simples Nacional com permissão de crédito e com cobrança do ICMS por ST" },
  { value: "202", label: "Tributada pelo Simples Nacional sem permissão de crédito e com cobrança do ICMS por ST" },
  { value: "203", label: "Isenção do ICMS no Simples Nacional para faixa de receita bruta e com cobrança do ICMS por ST" },
  { value: "300", label: "Imune" },
  { value: "400", label: "Não tributada pelo Simples Nacional" },
  {
    value: "500",
    label: "ICMS cobrado anteriormente por substituição tributária (substituído) ou por antecipação",
  },
  { value: "900", label: "Outros" },
]

export const CST_ICMS_OPTIONS: FiscalOption[] = [
  { value: "00", label: "Tributada integralmente" },
  { value: "10", label: "Tributada e com cobrança do ICMS por substituição tributária" },
  { value: "20", label: "Com redução de base de cálculo" },
  { value: "30", label: "Isenta ou não tributada e com cobrança do ICMS por substituição tributária" },
  { value: "40", label: "Isenta" },
  { value: "41", label: "Não tributada" },
  { value: "50", label: "Suspensão" },
  { value: "51", label: "Diferimento" },
  { value: "60", label: "ICMS cobrado anteriormente por substituição tributária" },
  { value: "70", label: "Com redução de base de cálculo e cobrança do ICMS por ST" },
  { value: "90", label: "Outras" },
]

export const ICMS_ORIGEM_OPTIONS: FiscalOption[] = [
  { value: "0", label: "Nacional, exceto as indicadas nos códigos 3, 4, 5 e 8" },
  { value: "1", label: "Estrangeira — importação direta, exceto a indicada no código 6" },
  { value: "2", label: "Estrangeira — adquirida no mercado interno, exceto a indicada no código 7" },
  {
    value: "3",
    label: "Nacional, mercadoria ou bem com conteúdo de importação superior a 40% e inferior ou igual a 70%",
  },
  {
    value: "4",
    label: "Nacional, cuja produção tenha sido feita em conformidade com os processos produtivos básicos",
  },
  { value: "5", label: "Nacional, mercadoria ou bem com conteúdo de importação inferior ou igual a 40%" },
  {
    value: "6",
    label: "Estrangeira — importação direta, sem similar nacional, constante em lista da CAMEX e gás natural",
  },
  {
    value: "7",
    label: "Estrangeira — adquirida no mercado interno, sem similar nacional, em lista da CAMEX e gás natural",
  },
  { value: "8", label: "Nacional, mercadoria ou bem com conteúdo de importação superior a 70%" },
]

export const CST_PIS_SAIDA: FiscalOption[] = [
  { value: "01", label: "Operação tributável com alíquota básica" },
  { value: "02", label: "Operação tributável com alíquota diferenciada" },
  { value: "03", label: "Operação tributável com alíquota por unidade de medida de produto" },
  { value: "04", label: "Operação tributável — monofásica — revenda a alíquota zero" },
  { value: "05", label: "Operação tributável por substituição tributária" },
  { value: "06", label: "Operação tributável a alíquota zero" },
  { value: "07", label: "Operação isenta da contribuição" },
  { value: "08", label: "Operação sem incidência da contribuição" },
  { value: "09", label: "Operação com suspensão da contribuição" },
  { value: "49", label: "Outras operações de saída" },
  { value: "99", label: "Outras operações" },
]

export const CST_COFINS_SAIDA: FiscalOption[] = [
  { value: "01", label: "Operação tributável com alíquota básica" },
  { value: "02", label: "Operação tributável com alíquota diferenciada" },
  { value: "03", label: "Operação tributável com alíquota por unidade de medida de produto" },
  { value: "04", label: "Operação tributável — monofásica — revenda a alíquota zero" },
  { value: "05", label: "Operação tributável por substituição tributária" },
  { value: "06", label: "Operação tributável a alíquota zero" },
  { value: "07", label: "Operação isenta da contribuição" },
  { value: "08", label: "Operação sem incidência da contribuição" },
  { value: "09", label: "Operação com suspensão da contribuição" },
  { value: "49", label: "Outras operações de saída" },
  { value: "99", label: "Outras operações" },
]

export const FISCAL_REGIME_TRIBUTARIO_OPTIONS: FiscalOption[] = [
  { value: "1", label: "1 — Simples Nacional" },
  {
    value: "2",
    label: "2 — Simples Nacional — excesso de sublimite de receita bruta",
  },
  { value: "3", label: "3 — Regime Normal" },
]

/** CFOP de saída (5xxx, 6xxx, 7xxx) — mais usados em vendas. */
const CFOP_SAIDA_PART1: FiscalOption[] = [
  { value: "1411", label: "Devolução de venda de mercadoria sujeita a ST" },
  { value: "2411", label: "Devolução de venda de mercadoria sujeita a ST (interestadual)" },
  { value: "5101", label: "Venda de produção do estabelecimento" },
  { value: "5102", label: "Venda de mercadoria adquirida ou recebida de terceiros" },
  { value: "5103", label: "Venda de produção do estabelecimento efetuada fora do estabelecimento" },
  {
    value: "5104",
    label: "Venda de mercadoria adquirida ou recebida de terceiros, efetuada fora do estabelecimento",
  },
  { value: "5105", label: "Venda de produção do estabelecimento que não deva por ele transitar" },
  {
    value: "5106",
    label: "Venda de mercadoria adquirida ou recebida de terceiros que não deva por ele transitar",
  },
  { value: "5109", label: "Venda de produção do estabelecimento destinada ao exterior" },
  { value: "5110", label: "Venda de mercadoria adquirida ou recebida de terceiros destinada ao exterior" },
  {
    value: "5111",
    label: "Venda de produção do estabelecimento remetida anteriormente em consignação industrial",
  },
  {
    value: "5112",
    label:
      "Venda de mercadoria adquirida ou recebida de terceiros remetida anteriormente em consignação mercantil",
  },
  {
    value: "5113",
    label: "Venda de produção do estabelecimento remetida anteriormente em consignação mercantil",
  },
  {
    value: "5114",
    label:
      "Venda de mercadoria adquirida ou recebida de terceiros remetida anteriormente em consignação industrial",
  },
  {
    value: "5115",
    label:
      "Venda de mercadoria adquirida ou recebida de terceiros, recebida anteriormente em consignação mercantil",
  },
  {
    value: "5116",
    label: "Venda de produção do estabelecimento originada de encomenda para entrega futura",
  },
  {
    value: "5117",
    label:
      "Venda de mercadoria adquirida ou recebida de terceiros, originada de encomenda para entrega futura",
  },
  {
    value: "5118",
    label:
      "Venda de produção do estabelecimento entregue ao destinatário por conta e ordem do adquirente originário",
  },
  {
    value: "5119",
    label:
      "Venda de mercadoria adquirida ou recebida de terceiros entregue ao destinatário por conta e ordem do adquirente originário",
  },
  {
    value: "5120",
    label:
      "Venda de mercadoria adquirida ou recebida de terceiros entregue ao destinatário pelo vendedor remetente",
  },
  {
    value: "5122",
    label:
      "Venda de produção do estabelecimento remetida para industrialização, por conta e ordem do adquirente",
  },
  {
    value: "5123",
    label:
      "Venda de mercadoria adquirida ou recebida de terceiros remetida para industrialização, por conta e ordem do adquirente",
  },
  { value: "5124", label: "Industrialização efetuada para outra empresa" },
  {
    value: "5125",
    label:
      "Industrialização efetuada para outra empresa quando a mercadoria remetida para utilização no processo de industrialização não transitar pelo estabelecimento adquirente",
  },
  { value: "5151", label: "Transferência de produção do estabelecimento" },
  { value: "5152", label: "Transferência de mercadoria adquirida ou recebida de terceiros" },
  { value: "5153", label: "Transferência de energia elétrica" },
  {
    value: "5155",
    label: "Transferência de produção do estabelecimento, que não deva por ele transitar",
  },
  {
    value: "5156",
    label: "Transferência de mercadoria adquirida ou recebida de terceiros, que não deva por ele transitar",
  },
  { value: "5201", label: "Devolução de compra para industrialização ou produção rural" },
  { value: "5202", label: "Devolução de compra para comercialização" },
  { value: "6201", label: "Devolução de compra para industrialização ou produção rural (Outro Estado)" },
  { value: "6202", label: "Devolução de compra para comercialização (Outro Estado)" },
  { value: "1202", label: "Devolução de venda de mercadoria adquirida ou recebida de terceiros" },
  { value: "2202", label: "Devolução de venda de mercadoria adquirida ou recebida de terceiros (Outro Estado)" },
  {
    value: "5208",
    label: "Devolução de mercadoria recebida em transferência para industrialização ou produção rural",
  },
  {
    value: "5209",
    label: "Devolução de mercadoria recebida em transferência para comercialização",
  },
  { value: "5210", label: "Devolução de compra para utilização na prestação de serviço" },
  {
    value: "5301",
    label:
      "Venda de produção do estabelecimento, cujo ICMS foi recolhido anteriormente em substituição tributária",
  },
  {
    value: "5302",
    label:
      "Venda de mercadoria adquirida ou recebida de terceiros em operação com mercadoria sujeita ao regime de substituição tributária",
  },
  {
    value: "5303",
    label:
      "Venda de mercadoria adquirida ou recebida de terceiros em operação com mercadoria sujeita ao regime de substituição tributária, na condição de contribuinte substituído",
  },
  {
    value: "5304",
    label:
      "Venda de mercadoria adquirida ou recebida de terceiros em operação com mercadoria sujeita ao regime de substituição tributária na condição de contribuinte substituto",
  },
  { value: "5351", label: "Venda de produção do estabelecimento" },
  { value: "5352", label: "Venda de mercadoria adquirida ou recebida de terceiros" },
  {
    value: "5353",
    label: "Venda de produção do estabelecimento, de mercadoria sujeita ao regime de substituição tributária",
  },
  {
    value: "5354",
    label:
      "Venda de mercadoria com ST adquirida ou recebida de terceiros, sujeita ao regime de substituição tributária",
  },
  { value: "5355", label: "Venda de produção do estabelecimento de produto não tributado" },
  { value: "5356", label: "Venda de mercadoria de terceiros de produto não tributado" },
  { value: "5357", label: "Venda de produção do estabelecimento de produto isento" },
  { value: "5358", label: "Venda de mercadoria de terceiros de produto isento" },
  { value: "5359", label: "Venda de produção do estabelecimento" },
  { value: "5360", label: "Venda de mercadoria de terceiros" },
  {
    value: "5401",
    label:
      "Venda de produção do estabelecimento em operação com produto sujeito ao regime de substituição tributária",
  },
  {
    value: "5402",
    label:
      "Venda de produção do estabelecimento de produto sujeito ao regime de substituição tributária, em operação entre contribuintes substitutos",
  },
  {
    value: "5403",
    label:
      "Venda de mercadoria sujeita ao regime de substituição tributária adquirida ou recebida de terceiros em operação com produto sujeito ao regime de substituição tributária",
  },
  {
    value: "5405",
    label:
      "Venda de mercadoria adquirida ou recebida de terceiros em operação com mercadoria sujeita ao regime de substituição tributária (ICMS-ST retido)",
  },
  {
    value: "5408",
    label:
      "Transferência de produção do estabelecimento em operação com produto sujeito ao regime de substituição tributária",
  },
  {
    value: "5409",
    label:
      "Transferência de mercadoria adquirida ou recebida de terceiros em operação com mercadoria sujeita ao regime de substituição tributária",
  },
  {
    value: "5410",
    label:
      "Devolução de compra para industrialização ou produção rural em operação com mercadoria sujeita ao regime de substituição tributária",
  },
  {
    value: "5411",
    label:
      "Devolução de compra para comercialização em operação com mercadoria sujeita ao regime de substituição tributária",
  },
  { value: "5412", label: "Devolução de bem do ativo imobilizado" },
  { value: "5413", label: "Devolução de mercadoria destinada ao uso ou consumo" },
  {
    value: "5414",
    label: "Remessa de produção do estabelecimento para venda fora do estabelecimento",
  },
  {
    value: "5415",
    label: "Remessa de mercadoria adquirida ou recebida de terceiros para venda fora do estabelecimento",
  },
  {
    value: "5501",
    label: "Remessa de produção do estabelecimento com fim específico de exportação",
  },
  {
    value: "5502",
    label: "Remessa de mercadoria adquirida ou recebida de terceiros com fim específico de exportação",
  },
  { value: "5503", label: "Devolução de mercadoria recebida com fim específico de exportação" },
  { value: "5504", label: "Remessa de mercadoria para formação de lote de exportação" },
  {
    value: "5505",
    label: "Remessa de mercadoria recebida de terceiros para formação de lote de exportação",
  },
  { value: "5601", label: "Transferência de crédito de ICMS acumulado" },
  { value: "5602", label: "Transferência de saldo devedor de ICMS" },
  { value: "5603", label: "Ressarcimento de ICMS retido por substituição tributária" },
  {
    value: "5605",
    label: "Transferência de saldo credor de ICMS para outro estabelecimento da mesma empresa",
  },
  {
    value: "5651",
    label:
      "Venda de combustível ou lubrificante de produção do estabelecimento destinado à industrialização subsequente",
  },
  {
    value: "5652",
    label:
      "Venda de combustível ou lubrificante de produção do estabelecimento destinado à comercialização",
  },
  {
    value: "5653",
    label:
      "Venda de combustível ou lubrificante de produção do estabelecimento destinado a consumidor ou usuário final",
  },
  {
    value: "5654",
    label:
      "Venda de combustível ou lubrificante adquirido ou recebido de terceiros destinado à industrialização subsequente",
  },
  {
    value: "5655",
    label:
      "Venda de combustível ou lubrificante adquirido ou recebido de terceiros destinado à comercialização",
  },
  {
    value: "5656",
    label:
      "Venda de combustível ou lubrificante adquirido ou recebido de terceiros destinado a consumidor ou usuário final",
  },
  {
    value: "5667",
    label: "Venda de combustível ou lubrificante a consumidor ou usuário final estabelecido em outro estado",
  },
  { value: "5751", label: "Venda de energia elétrica para distribuição ou comercialização" },
  { value: "5752", label: "Venda de energia elétrica para estabelecimentos de produção rural" },
  { value: "5753", label: "Venda de energia elétrica para consumidor não industrial" },
  { value: "5754", label: "Venda de energia elétrica para consumidor industrial" },
  { value: "5755", label: "Venda de energia elétrica para poder público" },
  { value: "5756", label: "Venda de energia elétrica para uso na pecuária" },
  { value: "5757", label: "Venda de energia elétrica para uso na agropecuária" },
  {
    value: "5900",
    label: "Outras saídas de mercadorias ou prestações de serviços não especificados",
  },
  { value: "5910", label: "Remessa em bonificação, doação ou brinde" },
  { value: "5911", label: "Remessa de amostra grátis" },
  {
    value: "5912",
    label: "Remessa de mercadoria ou bem para demonstração, mostruário ou exposição",
  },
  { value: "5913", label: "Remessa de mercadoria ou bem para demonstração e posterior venda" },
  { value: "5914", label: "Remessa de mercadoria ou bem para exposição ou feira" },
  { value: "5915", label: "Remessa de mercadoria ou bem para conserto ou reparo" },
  { value: "5916", label: "Remessa de mercadoria ou bem para industrialização" },
  { value: "5917", label: "Remessa de mercadoria em consignação mercantil ou industrial" },
  { value: "5918", label: "Remessa de mercadoria em consignação industrial" },
  {
    value: "5919",
    label: "Devolução simbólica de mercadoria vendida ou utilizada em processo industrial",
  },
  { value: "5920", label: "Remessa de vasilhame ou sacaria" },
  { value: "5921", label: "Remessa de industrialização para outro estabelecimento" },
  { value: "5922", label: "Lançamento efetuado a título de simples faturamento" },
  { value: "5923", label: "Remessa de mercadoria por conta e ordem de terceiros" },
  { value: "5924", label: "Remessa para industrialização por conta e ordem" },
  {
    value: "5925",
    label: "Retorno de mercadoria recebida para industrialização ou produção rural",
  },
  {
    value: "5926",
    label:
      "Lançamento efetuado a título de reclassificação de mercadoria decorrente de formação de kit ou de sua desagregação",
  },
  { value: "5927", label: "Lançamento efetuado a título de baixa de estoque" },
  { value: "5928", label: "Lançamento efetuado a título de devolução de mercadoria usada" },
  {
    value: "5929",
    label:
      "Lançamento efetuado em decorrência de emissão de documento fiscal relativo a operação ou prestação também acobertada por documento fiscal",
  },
  {
    value: "5931",
    label:
      "Lançamento efetuado pelo tomador do serviço de transporte quando a responsabilidade de retenção do imposto for atribuída ao remetente",
  },
  {
    value: "5932",
    label:
      "Prestação de serviço de transporte iniciada em unidade da Federação diversa daquela onde inscrito o prestador",
  },
  { value: "5933", label: "Prestação de serviço tributado pelo ISSQN" },
  {
    value: "5934",
    label: "Remessa simbólica de mercadoria depositada em armazém geral ou depósito fechado",
  },
  {
    value: "5949",
    label: "Outra saída de mercadoria ou prestação de serviço não especificado",
  },
]

const CFOP_SAIDA_PART2: FiscalOption[] = [
  { value: "6101", label: "Venda de produção do estabelecimento (interestadual)" },
  {
    value: "6102",
    label: "Venda de mercadoria adquirida ou recebida de terceiros (interestadual)",
  },
  {
    value: "6107",
    label: "Venda de produção do estabelecimento destinada ao exterior (interestadual)",
  },
  {
    value: "6108",
    label:
      "Venda de mercadoria adquirida ou recebida de terceiros destinada ao exterior (interestadual)",
  },
  {
    value: "6110",
    label:
      "Venda de mercadoria adquirida ou recebida de terceiros, destinada ao exterior, não realizada através de armazém alfandegado ou entreposto aduaneiro",
  },
  {
    value: "6251",
    label: "Venda de energia elétrica para distribuição ou comercialização (interestadual)",
  },
  {
    value: "6301",
    label: "Venda de produção do estabelecimento sujeita ao ICMS-ST (interestadual)",
  },
  {
    value: "6302",
    label:
      "Venda de mercadoria adquirida ou recebida de terceiros sujeita ao ICMS-ST (interestadual)",
  },
  {
    value: "6401",
    label: "Venda de produção com ST por antecipação (interestadual)",
  },
  {
    value: "6403",
    label: "Venda de mercadoria com ST já retida (interestadual)",
  },
  {
    value: "6404",
    label: "Venda de mercadoria com ST por força de convênio (interestadual)",
  },
  {
    value: "6949",
    label: "Outra saída de mercadoria ou prestação de serviço não especificado (interestadual)",
  },
  { value: "7101", label: "Venda de produção do estabelecimento (exportação)" },
  {
    value: "7102",
    label: "Venda de mercadoria adquirida ou recebida de terceiros (exportação)",
  },
]

export const CFOP_SAIDA: FiscalOption[] = [...CFOP_SAIDA_PART1, ...CFOP_SAIDA_PART2]

export const CFOP_ENTRADA: FiscalOption[] = [
  { value: "1102", label: "Compra para comercialização" },
  { value: "2102", label: "Compra para comercialização (interestadual)" },
  { value: "1202", label: "Devolução de venda de mercadoria adquirida ou recebida de terceiros" },
  { value: "2202", label: "Devolução de venda de mercadoria adquirida ou recebida de terceiros (interestadual)" },
  { value: "1403", label: "Compra para comercialização com mercadoria sujeita ao regime de ST" },
  { value: "2403", label: "Compra para comercialização com mercadoria sujeita ao regime de ST (interestadual)" },
  { value: "1411", label: "Devolução de venda de mercadoria sujeita a ST" },
  { value: "2411", label: "Devolução de venda de mercadoria sujeita a ST (interestadual)" },
  { value: "1949", label: "Outra entrada de mercadoria ou prestação de serviço não especificada" },
  { value: "2949", label: "Outra entrada de mercadoria ou prestação de serviço não especificada (interestadual)" },
  { value: "3102", label: "Compra para comercialização (importação)" }
]

/** Normaliza CSOSN gravado com zero à esquerda (ex.: 0500) para o código da tabela (500). */
export function normalizeCsosnStored(raw: string | null | undefined): string {
  let s = String(raw ?? "")
    .trim()
    .replace(/\D/g, "")
  if (!s) return "500"
  s = s.replace(/^0+/, "") || "0"
  return s
}
