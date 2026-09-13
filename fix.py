import re
with open('backend/app/api/mercadolivre_ops.py', 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace('INSERT INTO vendas (cliente_id, total, status, origem_ml, ml_order_id, forma_pagamento, data_venda)', 'INSERT INTO vendas (cliente_id, atendente_id, total, status, origem_ml, ml_order_id, forma_pagamento, data_venda)')
content = content.replace('VALUES (\::uuid, \, \::status_venda, \, \, \::forma_pagamento, \)', 'VALUES (\::uuid, \::uuid, \, \::status_venda, \, \, \::forma_pagamento, \)')
content = content.replace('cliente_id,
                    float(total_amt),', 'cliente_id,
                    vendedor_online_id,
                    float(total_amt),')
content = content.replace('total_amt = 0
', 'total_amt = 0

                # Obter vendedor online (se houver)
                vendedor_online_id = await conn.fetchval(
                    "SELECT id FROM atendentes WHERE cargo ILIKE '%Vendedor Online%' LIMIT 1"
                )
')
with open('backend/app/api/mercadolivre_ops.py', 'w', encoding='utf-8') as f:
    f.write(content)

