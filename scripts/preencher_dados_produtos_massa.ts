import { Client } from 'pg';
import { parseBulkMasterNomeCompleto } from '../src/lib/parseNomeVeiculoPeca.js';
import dotenv from 'dotenv';
import path from 'path';

// Carrega o .env do backend
dotenv.config({ path: path.resolve(process.cwd(), 'backend', '.env') });

const DRY_RUN = process.argv.includes('--aplicar') ? false : true;

async function main() {
  console.log(`[INIT] Iniciando preenchimento em massa para TODOS os produtos com estoque`);
  console.log(`[MODO] ${DRY_RUN ? 'SIMULAÇÃO (--aplicar não informado)' : 'APLICAR (Salvando no banco)'}`);

  // Ajusta o host se estiver rodando local fora do docker
  let dbUrl = process.env.DATABASE_URL || '';
  if (dbUrl.includes('crm-loja_crm0loja')) {
    dbUrl = dbUrl.replace('crm-loja_crm0loja', 'localhost');
  }

  const client = new Client({ connectionString: dbUrl });
  try {
    await client.connect();
    console.log('[DB] Conectado ao banco de dados com sucesso.');
  } catch (err) {
    console.error('[DB] Erro ao conectar no banco de dados:', err);
    process.exit(1);
  }

  try {
    // 1. Carregar configuração e listas
    const configRes = await client.query('SELECT produto_descricao_padrao FROM configuracoes_empresa LIMIT 1');
    const descricaoPadrao = configRes.rows[0]?.produto_descricao_padrao || '';

    const categoriasRes = await client.query('SELECT id, nome FROM categorias');
    const categoriasMap = new Map();
    const categoriasNomes: string[] = [];
    for (const row of categoriasRes.rows) {
      categoriasMap.set(row.nome.toLowerCase(), row.id);
      categoriasNomes.push(row.nome);
    }

    const marcasRes = await client.query('SELECT nome FROM cat_marcas');
    const nomesMarcas = marcasRes.rows.map(r => r.nome);

    const modelosRes = await client.query('SELECT m.nome, ma.nome as marca_nome FROM cat_modelos m LEFT JOIN cat_marcas ma ON m.marca_id = ma.id');
    const nomesModelos = modelosRes.rows.map(r => r.nome);
    const marcaPorModeloNome = new Map<string, string>();
    for (const row of modelosRes.rows) {
      if (row.nome && row.marca_nome) {
        marcaPorModeloNome.set(row.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''), row.marca_nome);
      }
    }

    console.log(`[INFO] Carregadas ${categoriasNomes.length} categorias, ${nomesMarcas.length} marcas e ${nomesModelos.length} modelos.`);

    // 2. Buscar produtos com estoque > 0
    const produtosRes = await client.query(`
      SELECT id, nome, descricao, marca, modelo, ano_inicio, ano_fim, motorizacao, categoria_id 
      FROM produtos 
      WHERE estoque_atual > 0 
      ORDER BY created_at DESC
    `);

    const produtos = produtosRes.rows;
    console.log(`[INFO] Encontrados ${produtos.length} produtos para processar.`);

    let atualizados = 0;

    // 3. Processar cada produto
    for (const prod of produtos) {
      console.log(`\nProcessando: ${prod.nome}`);
      
      const parsed = parseBulkMasterNomeCompleto(prod.nome, {
        categoriasNomes,
        nomesModelos,
        nomesMarcas,
        marcaPorModeloNome
      });

      const updates: any = {};
      
      // Regra 1: Descrição Padrão apenas se estiver vazia
      const descAtual = (prod.descricao || '').trim();
      if (!descAtual && descricaoPadrao) {
        updates.descricao = descricaoPadrao;
      }

      // Regra 2: Marca e Modelo de acordo com o título (sobrescrevendo o que tiver)
      if (parsed.marca) updates.marca = parsed.marca;
      if (parsed.modelo_texto) updates.modelo = parsed.modelo_texto;
      if (parsed.ano_inicio !== null) updates.ano_inicio = parsed.ano_inicio;
      if (parsed.ano_fim !== null) updates.ano_fim = parsed.ano_fim;
      if (parsed.motorizacao) updates.motorizacao = parsed.motorizacao;
      
      if (parsed.categoria_nome) {
        const catId = categoriasMap.get(parsed.categoria_nome.toLowerCase());
        if (catId) {
          updates.categoria_id = catId;
        }
      }

      if (Object.keys(updates).length > 0) {
        console.log(`  Alterações propostas:`);
        for (const [k, v] of Object.entries(updates)) {
          // Truncate description for logs if it's too long
          const displayV = (k === 'descricao' && typeof v === 'string' && v.length > 50) ? v.substring(0, 50) + '...' : v;
          console.log(`    - ${k}: ${prod[k]} -> ${displayV}`);
        }

        if (!DRY_RUN) {
          const setFields = [];
          const values = [];
          let paramIdx = 1;
          for (const [k, v] of Object.entries(updates)) {
            setFields.push(`${k} = $${paramIdx}`);
            values.push(v);
            paramIdx++;
          }
          values.push(prod.id); // WHERE id = $paramIdx

          const updateQuery = `UPDATE produtos SET ${setFields.join(', ')} WHERE id = $${paramIdx}`;
          await client.query(updateQuery, values);
          console.log(`  [OK] Salvo no banco.`);
        }
        atualizados++;
      } else {
        console.log(`  Nenhuma alteração necessária.`);
      }
    }

    console.log(`\n[RESUMO] ${atualizados} produtos ${DRY_RUN ? 'precisam ser atualizados' : 'foram atualizados'}.`);
    
  } catch (err) {
    console.error('[ERRO]', err);
  } finally {
    await client.end();
  }
}

main();
