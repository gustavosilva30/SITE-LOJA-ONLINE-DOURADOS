import asyncio
import asyncpg
import os
from datetime import date

async def test():
    conn = await asyncpg.connect(os.environ["DATABASE_URL"])
    try:
        data_civil = "2026-04-22"
        dc = date.fromisoformat(data_civil)
        
        _ENTREGA_CREATED_CIVIL_SP = "(e.created_at AT TIME ZONE 'America/Sao_Paulo')::date"
        _VENDA_DATA_CIVIL_SP = "(v.data_venda AT TIME ZONE 'America/Sao_Paulo')::date"
        _VENDA_UPDATED_CIVIL_SP = "(v.updated_at AT TIME ZONE 'America/Sao_Paulo')::date"
        
        idx = 1
        conditions = []
        params = []
        
        conditions.append(
            f"""(
                {_ENTREGA_CREATED_CIVIL_SP} = ${idx}
                OR (
                    v.data_venda IS NOT NULL
                    AND {_VENDA_DATA_CIVIL_SP} = ${idx}
                )
                OR (
                    v.id IS NOT NULL
                    AND {_VENDA_UPDATED_CIVIL_SP} = ${idx}
                )
            )"""
        )
        params.append(dc)
        idx += 1
        
        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
        limit = 500
        offset = 0
        params.extend([limit, offset])
        
        sql = f"""
            SELECT
                e.*,
                json_build_object(
                    'id', v.id,
                    'numero_pedido', v.numero_pedido,
                    'status', v.status,
                    'total', v.total,
                    'total_pago', COALESCE(fl_totais.total_pago_calc, 0),
                    'forma_pagamento', v.forma_pagamento,
                    'clientes', json_build_object('nome', c.nome)
                ) AS vendas
            FROM entregas e
            LEFT JOIN vendas v ON e.venda_id = v.id
            LEFT JOIN clientes c ON v.cliente_id = c.id
            LEFT JOIN (
                SELECT venda_id, COALESCE(SUM(valor), 0) AS total_pago_calc
                FROM financeiro_lancamentos
                WHERE tipo = 'Receita' AND status = 'Pago'
                GROUP BY venda_id
            ) fl_totais ON fl_totais.venda_id = v.id
            {where}
            ORDER BY e.created_at DESC NULLS LAST
            LIMIT ${idx} OFFSET ${idx + 1}
        """
        
        print(f"SQL:\n{sql}")
        print(f"Params: {params}")
        
        rows = await conn.fetch(sql, *params)
        print(f"Result: {len(rows)} rows")
        
    except Exception as e:
        print(f"ERROR: {e}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(test())
