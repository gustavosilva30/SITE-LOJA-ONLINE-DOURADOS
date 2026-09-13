# -*- coding: utf-8 -*-
import re
with open(r'c:\dev\crm-loja-final\backend\app\api\catalogo.py', 'r', encoding='utf-8') as f:
    text = f.read()

marca_target = '''            if new_nome and new_nome != old_row["nome"]:
                await conn.execute("UPDATE veiculos_master SET marca =  WHERE marca = ", new_nome, old_row["nome"])'''

marca_replace = '''            if new_nome and new_nome != old_row["nome"]:
                await conn.execute("UPDATE veiculos_master SET marca =  WHERE marca ILIKE ", new_nome, old_row["nome"])'''

modelo_target = '''            if new_nome and new_nome != old_row["nome"]:
                marca_nome = await conn.fetchval("SELECT nome FROM veiculos_marcas WHERE id = ", old_row["marca_id"])
                if marca_nome:
                    await conn.execute(
                        "UPDATE veiculos_master SET modelo =  WHERE marca =  AND modelo = ",
                        new_nome, marca_nome, old_row["nome"]
                    )'''

modelo_replace = '''            if new_nome and new_nome != old_row["nome"]:
                marca_nome = await conn.fetchval("SELECT nome FROM veiculos_marcas WHERE id = ", old_row["marca_id"])
                if marca_nome:
                    await conn.execute(
                        "UPDATE veiculos_master SET modelo =  WHERE marca ILIKE  AND modelo ILIKE ",
                        new_nome, marca_nome, old_row["nome"]
                    )'''

text = text.replace(marca_target, marca_replace)
text = text.replace(modelo_target, modelo_replace)

with open(r'c:\dev\crm-loja-final\backend\app\api\catalogo.py', 'w', encoding='utf-8') as f:
    f.write(text)
print('Done!')
