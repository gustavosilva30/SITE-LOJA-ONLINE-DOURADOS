import { api } from "./api";

export interface VeiculoSugestao {
  id: string;
  marca: string;
  modelo: string;
  familia: string;
  versao: string;
  motorizacao: string;
  ano_inicio: number;
  ano_fim: number;
  matchType: "high" | "medium";
  score: number;
  autoSelect: boolean;
}

/**
 * Heurística de limpeza de nome de peças para extrair termos de busca do veículo
 */
export function extrairDadosDoNome(nome: string) {
  const textoOriginal = nome || "";
  let nomeLimpo = textoOriginal.toLowerCase();

  // 1. Extrair anos (formatos: 2008/2015, 2008-2015, 08/15, 2008)
  const rangeYearRegex = /\b(\d{2,4})[/-a\s]+(\d{2,4})\b/g;
  const singleYearRegex = /\b(\d{4})\b/g;

  const years: number[] = [];
  let match;

  // Tenta achar ranges de ano
  while ((match = rangeYearRegex.exec(nomeLimpo)) !== null) {
    let y1 = parseInt(match[1], 10);
    let y2 = parseInt(match[2], 10);

    // Tratar anos de 2 dígitos
    if (y1 < 100) y1 += y1 > 30 ? 1900 : 2000;
    if (y2 < 100) y2 += y2 > 30 ? 1900 : 2000;

    years.push(y1, y2);
  }

  // Tenta achar anos individuais se não achou ranges
  if (years.length === 0) {
    while ((match = singleYearRegex.exec(nomeLimpo)) !== null) {
      const y = parseInt(match[1], 10);
      if (y >= 1950 && y <= 2030) {
        years.push(y);
      }
    }
  }

  // Anos ordenados
  const minAno = years.length > 0 ? Math.min(...years) : null;
  const maxAno = years.length > 0 ? Math.max(...years) : null;

  // 2. Extrair motorização (formatos: 1.0, 1.6, 2.0, 2.4, 1.4, 1.8, 1.5, 1.3)
  const motorRegex = /\b(\d\.\d)\b/g;
  const motorizacoes: string[] = [];
  while ((match = motorRegex.exec(nomeLimpo)) !== null) {
    motorizacoes.push(match[1]);
  }

  // 3. Extrair gerações/famílias (ex: G3, G4, G5, G6, G7, G8, G1, G2, etc.)
  const geracaoRegex = /\b(g\d+)\b/gi;
  const geracoes: string[] = [];
  while ((match = geracaoRegex.exec(nomeLimpo)) !== null) {
    geracoes.push(match[1].toLowerCase());
  }

  // 4. Limpar palavras de ruído (peças, medidas, especificações)
  const noiseWords = [
    "alternador", "motor", "cambio", "agregado", "compressor", "arranque", "setor", 
    "coluna", "caixa", "direcao", "hidraulica", "eletrica", "disco", "freio", 
    "suspensao", "amortecedor", "mola", "bandeja", "pivo", "terminal", "bieleta", 
    "coxim", "suporte", "mangueira", "reservatorio", "modulo", "centralina", 
    "chicote", "sensor", "valvula", "bico", "injetor", "bobina", "vela", "cabo", 
    "filtro", "oleo", "ar", "combustivel", "cabine", "correia", "dentada", "tensor", 
    "polia", "bomba", "dagua", "vacuo", "cilindro", "mestre", "servo", "pinça", 
    "pastilha", "tambor", "sapata", "burrinho", "flexivel", "cano", "tubo", "barra", 
    "estabilizadora", "longarina", "travessa", "painel", "frontal", "alma", "paralama", 
    "teto", "folha", "porta", "tampa", "traseira", "vidro", "parabrisa", "vigia", 
    "lateral", "retrovisor", "maçaneta", "fechadura", "chave", "comutador", "miolo", 
    "palheta", "braço", "limpador", "esguicho", "tanque", "bocal", "boia", "gargalo", 
    "escapamento", "coletor", "admissao", "escape", "catalisador", "silencioso", 
    "intermediario", "ponteira", "protetor", "carter", "parabarro", "spoiler", 
    "aerofolio", "friso", "emblema", "adesivo", "tapete", "forro", "assoalho", 
    "instrumentos", "cluster", "velocimetro", "conta", "giros", "relogio", "computador", 
    "bordo", "volante", "airbag", "cinto", "seguranca", "banco", "assento", "encosto", 
    "cabeca", "apoio", "console", "central", "luvas", "cinzeiro", "acendedor", 
    "cigarros", "tomada", "12v", "usb", "radio", "cd", "player", "dvd", "multimidia", 
    "falante", "tweeter", "subwoofer", "antena", "potencia", "amplificador", 
    "crossover", "fio", "bateria", "ignicao", "distribuidor", "tbi", "egr", 
    "canister", "purga", "alivio", "prioridade", "wastegate", "turbina", "intercooler", 
    "pressurizacao", "abraçadeira", "junta", "cabecote", "tampas", "retentor", 
    "virabrequim", "comando", "esticador", "guia", "corrente", "engrenagem", 
    "bronzina", "biela", "fixo", "pistao", "anel", "camisa", "bloco", "embreagem", 
    "platô", "rolamento", "atuador", "pedal", "trambulador", "alavanca", "varao", 
    "satelite", "planetaria", "coroa", "pinhao", "diferencial", "eixo", "homocinetica", 
    "tulipa", "trizeta", "cubo", "roda", "parafuso", "prisioneiro", "porca", "calota", 
    "pneu", "liga", "leve", "ferro", "estepe", "macaco", "triangulo", "extintor", 
    "kit", "peca", "catalogo", "original", "usado", "novo", "par", "lado", 
    "esquerdo", "direito", "lh", "rh", "dianteiro", "traseiro", "amp", "90a", 
    "120a", "70a", "80a", "110a", "100a", "150a", "valeo", "bosch", "magneti", 
    "marelli", "denso", "delphi"
  ];

  // Remove ruídos, anos e motorização do texto do nome
  let cleaned = nomeLimpo
    .replace(/\d{2,4}[/-]\d{2,4}/g, " ")
    .replace(/\d\.\d/g, " ")
    .replace(/\b\d+a\b/g, " ")
    .replace(/\b\d+v\b/g, " ")
    .replace(/\b\d+amp\b/g, " ")
    .replace(/\b(g\d+)\b/gi, " ");

  // Remove stop words específicas
  noiseWords.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, "g");
    cleaned = cleaned.replace(regex, " ");
  });

  // Extrai tokens de busca válidos (maiores que 2 caracteres)
  const searchTokens = cleaned
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 2)
    .join(" ");

  return {
    minAno,
    maxAno,
    motorizacoes,
    geracoes,
    searchTokens: searchTokens.trim() || nomeLimpo
  };
}

/**
 * Busca veículos e calcula sugestões altamente compatíveis
 */
export async function obterSugestoesVeiculos(nomePeca: string): Promise<VeiculoSugestao[]> {
  if (!nomePeca || nomePeca.trim().length < 3) return [];

  const parsed = extrairDadosDoNome(nomePeca);
  if (!parsed.searchTokens) return [];

  try {
    // 1. Busca ampla no banco de dados usando tokens de marca/modelo/geração
    let veiculos: any[] = [];
    
    // Tenta primeiro a busca conjunta (caso seja um modelo composto como "Grand Siena" ou "Novo Uno")
    const data = await api.get(
      `/api/catalogo/versoes-veiculos?q=${encodeURIComponent(parsed.searchTokens)}&limit=1000`
    );
    const results = Array.isArray(data) ? data : data.items ?? [];
    
    if (results.length > 0) {
      veiculos = results;
    } else {
      // Se não retornou nada, é altamente provável que o usuário citou múltiplos modelos no nome da peça
      // (ex: "gol saveiro voyage fox"). Fazemos a busca individual por palavra-chave de cada modelo.
      const tokens = parsed.searchTokens.split(/\s+/).filter(t => t.length >= 3);
      if (tokens.length > 0) {
        const promises = tokens.map(token => 
          api.get(`/api/catalogo/versoes-veiculos?q=${encodeURIComponent(token)}&limit=1000`)
            .then(res => Array.isArray(res) ? res : res.items ?? [])
            .catch(() => [])
        );
        
        const arrays = await Promise.all(promises);
        const merged: Record<string, any> = {};
        arrays.forEach(arr => {
          arr.forEach((v: any) => {
            if (v && v.id) {
              merged[v.id] = v;
            }
          });
        });
        veiculos = Object.values(merged);
      }
    }

    if (!veiculos || veiculos.length === 0) return [];

    const sugestoes: VeiculoSugestao[] = [];

    // 2. Pontuar e filtrar cada veículo retornado
    veiculos.forEach((v: any) => {
      let score = 0;
      let matchesGeneration = false;
      let matchesMotor = false;
      let matchesYear = false;

      const vModelo = String(v.modelo || "").toLowerCase();
      const vFamilia = String(v.familia || "").toLowerCase();
      const vVersao = String(v.versao || "").toLowerCase();
      const vMotor = String(v.motorizacao || "").toLowerCase();
      const vAnoInicio = v.ano_inicio || 0;
      const vAnoFim = v.ano_fim || 9999;

      // --- FILTRO DE GERAÇÃO (se especificado no nome, ex: g5 g6) ---
      if (parsed.geracoes.length > 0) {
        const matchesAnyGen = parsed.geracoes.some(
          gen => vFamilia.includes(gen) || vVersao.includes(gen) || vModelo.includes(gen)
        );
        if (matchesAnyGen) {
          score += 40;
          matchesGeneration = true;
        } else {
          // Modelos no Brasil que usam a terminologia de geração G1-G8:
          // Gol, Saveiro, Voyage, Parati, Palio, Strada, Siena.
          // Se o modelo do carro NÃO usa geração (ex: Fox, Golf, Corsa, Corolla),
          // ele NÃO deve ser penalizado por não ter "g5" ou "g6" na família.
          const modelosComGeracao = ["gol", "saveiro", "voyage", "parati", "palio", "strada", "siena", "weekend"];
          const isModeloComGeracao = modelosComGeracao.some(m => vModelo.includes(m));
          
          if (!isModeloComGeracao) {
            matchesGeneration = true; // Não pune modelos sem geração
          } else {
            score -= 100; // Gol G4/G3 etc. é penalizado se especificou G5/G6
          }
        }
      } else {
        matchesGeneration = true;
      }

      // --- FILTRO DE MOTORIZAÇÃO (se especificado no nome, ex: 1.0 1.6) ---
      if (parsed.motorizacoes.length > 0) {
        const matchesAnyMotor = parsed.motorizacoes.some(m => vMotor.includes(m));
        if (matchesAnyMotor) {
          score += 30;
          matchesMotor = true;
        } else {
          score -= 50;
        }
      } else {
        matchesMotor = true;
      }

      // --- FILTRO E SOBREPOSIÇÃO DE ANOS (se especificado no nome, ex: 2008/2015) ---
      if (parsed.minAno !== null && parsed.maxAno !== null) {
        const overlap = !(vAnoFim < parsed.minAno || vAnoInicio > parsed.maxAno);
        if (overlap) {
          score += 40;
          matchesYear = true;

          // Bônus se os anos coincidem perfeitamente
          if (vAnoInicio === parsed.minAno || vAnoFim === parsed.maxAno) {
            score += 10;
          }
        } else {
          score -= 100;
        }
      } else {
        matchesYear = true;
      }

      // Se passou em pelo menos alguma validação essencial ou é do mesmo modelo
      // E o score não ficou muito negativo
      if (score >= -20) {
        const isHigh = matchesGeneration && matchesMotor && matchesYear;
        
        sugestoes.push({
          id: v.id,
          marca: v.marca,
          modelo: v.modelo,
          familia: v.familia || "",
          versao: v.versao || "",
          motorizacao: v.motorizacao || "",
          ano_inicio: vAnoInicio,
          ano_fim: v.ano_fim,
          matchType: isHigh ? "high" : "medium",
          score,
          autoSelect: isHigh
        });
      }
    });

    // Ordenar por score decrescente
    return sugestoes.sort((a, b) => {
      if (a.matchType !== b.matchType) {
        return a.matchType === "high" ? -1 : 1;
      }
      return b.score - a.score;
    });

  } catch (error) {
    console.error("Erro ao obter sugestões inteligentes de veículos:", error);
    return [];
  }
}
