# -*- coding: utf-8 -*-
import re
with open(r'c:\dev\crm-loja-final\backend\app\api\catalogo.py', 'r', encoding='utf-8') as f:
    text = f.read()

marca_target = '''    keys = list(campos.keys())
    set_clause = ", ".join([f"{k} = " for i, k in enumerate(keys)])
    values = [campos[k] for k in keys]
    values.append(id)
    row = await pool.fetchrow(
        f"UPDATE veiculos_marcas SET {set_clause} WHERE id = ::uuid RETURNING *",
        *values
    )
    return _row(row)'''

marca_replace = '''    keys = list(campos.keys())
    set_clause = ", ".join([f"{k} = " for i, k in enumerate(keys)])
    values = [campos[k] for k in keys]
    values.append(id)

    async with pool.acquire() as conn:
        async with conn.transaction():
            old_row = await conn.fetchrow("SELECT nome FROM veiculos_marcas WHERE id = ::uuid", id)
            if not old_row:
                raise HTTPException(404, "Marca nao encontrada")
                
            row = await conn.fetchrow(
                f"UPDATE veiculos_marcas SET {set_clause} WHERE id = ::uuid RETURNING *",
                *values
            )
            
            new_nome = campos.get("nome")
            if new_nome and new_nome != old_row["nome"]:
                await conn.execute("UPDATE veiculos_master SET marca =  WHERE marca = ", new_nome, old_row["nome"])
                
            return _row(row)'''

modelo_target = '''    keys = list(campos.keys())
    set_clause = ", ".join([f"{k} = " for i, k in enumerate(keys)])
    values = [campos[k] for k in keys]
    values.append(id)
    row = await pool.fetchrow(
        f"UPDATE veiculos_modelos SET {set_clause} WHERE id = ::uuid RETURNING *",
        *values
    )
    return _row(row)'''

modelo_replace = '''    keys = list(campos.keys())
    set_clause = ", ".join([f"{k} = " for i, k in enumerate(keys)])
    values = [campos[k] for k in keys]
    values.append(id)

    async with pool.acquire() as conn:
        async with conn.transaction():
            old_row = await conn.fetchrow("SELECT nome, marca_id FROM veiculos_modelos WHERE id = ::uuid", id)
            if not old_row:
                raise HTTPException(404, "Modelo nao encontrado")
                
            row = await conn.fetchrow(
                f"UPDATE veiculos_modelos SET {set_clause} WHERE id = ::uuid RETURNING *",
                *values
            )
            
            new_nome = campos.get("nome")
            if new_nome and new_nome != old_row["nome"]:
                marca_nome = await conn.fetchval("SELECT nome FROM veiculos_marcas WHERE id = ", old_row["marca_id"])
                if marca_nome:
                    await conn.execute(
                        "UPDATE veiculos_master SET modelo =  WHERE marca =  AND modelo = ",
                        new_nome, marca_nome, old_row["nome"]
                    )
                    
            return _row(row)'''

text = text.replace(marca_target, marca_replace)
text = text.replace(modelo_target, modelo_replace)

with open(r'c:\dev\crm-loja-final\backend\app\api\catalogo.py', 'w', encoding='utf-8') as f:
    f.write(text)
print('Done!')
