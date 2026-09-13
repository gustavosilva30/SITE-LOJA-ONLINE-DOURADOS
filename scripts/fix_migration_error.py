import re

with open('backend/app/api/metas_vendedores.py', 'r', encoding='utf-8') as f:
    content = f.read()

produtos_query_new = """        try:
            produtos = await conn.fetch(
                \"\"\"
                SELECT p.atendente_id,
                       COUNT(*) FILTER (WHERE p.origem = 'Sucata' OR p.sucata_id IS NOT NULL) as pecas_sucata,
                       COUNT(*) FILTER (WHERE p.origem IS DISTINCT FROM 'Sucata' AND p.sucata_id IS NULL) as pecas_avulso
                FROM produtos p
                LEFT JOIN metas_vendedores m ON m.atendente_id = p.atendente_id AND m.mes_ano = $3
                WHERE p.created_at >= COALESCE(m.data_inicio::timestamp, $1::timestamp) 
                  AND p.created_at <= COALESCE(m.data_fim::timestamp + interval '23 hours 59 minutes 59 seconds', $2::timestamp)
                GROUP BY p.atendente_id
                \"\"\",
                di_dt, df_dt, ma
            )
        except asyncpg.exceptions.UndefinedColumnError:
            produtos = await conn.fetch(
                \"\"\"
                SELECT atendente_id,
                       COUNT(*) FILTER (WHERE origem = 'Sucata' OR sucata_id IS NOT NULL) as pecas_sucata,
                       COUNT(*) FILTER (WHERE origem IS DISTINCT FROM 'Sucata' AND sucata_id IS NULL) as pecas_avulso
                FROM produtos
                WHERE created_at >= $1::timestamp AND created_at <= $2::timestamp
                GROUP BY atendente_id
                \"\"\",
                di_dt, df_dt
            )"""

content = re.sub(r'        produtos = await conn.fetch\([\s\S]*?di_dt, df_dt, ma\n        \)', produtos_query_new, content)

fotos_query_new = """            try:
                fotos = await conn.fetch(
                    \"\"\"
                    SELECT f.atendente_id,
                           COUNT(DISTINCT f.produto_id) as com_foto,
                           SUM(f.quantidade_fotos) as total_fotos
                    FROM foto_contribuicoes f
                    LEFT JOIN metas_vendedores m ON m.atendente_id = f.atendente_id AND m.mes_ano = $3
                    WHERE f.created_at >= COALESCE(m.data_inicio::timestamp, $1::timestamp) 
                      AND f.created_at <= COALESCE(m.data_fim::timestamp + interval '23 hours 59 minutes 59 seconds', $2::timestamp)
                    GROUP BY f.atendente_id
                    \"\"\",
                    di_dt, df_dt, ma
                )
            except asyncpg.exceptions.UndefinedColumnError:
                fotos = await conn.fetch(
                    \"\"\"
                    SELECT atendente_id,
                           COUNT(DISTINCT produto_id) as com_foto,
                           SUM(quantidade_fotos) as total_fotos
                    FROM foto_contribuicoes
                    WHERE created_at >= $1::timestamp AND created_at <= $2::timestamp
                    GROUP BY atendente_id
                    \"\"\",
                    di_dt, df_dt
                )"""

content = re.sub(r'            fotos = await conn.fetch\([\s\S]*?di_dt, df_dt, ma\n            \)', fotos_query_new, content)

with open('backend/app/api/metas_vendedores.py', 'w', encoding='utf-8') as f:
    f.write(content)
