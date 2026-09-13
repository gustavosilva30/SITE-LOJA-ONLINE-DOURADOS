import asyncpg
import asyncio

async def run():
    try:
        conn = await asyncpg.connect('postgresql://postgres:postgres@localhost:5432/crm-loja_banco')
        await conn.execute('ALTER TABLE entregas ADD COLUMN IF NOT EXISTS forma_pagamento TEXT')
        print("Coluna forma_pagamento adicionada com sucesso.")
        await conn.close()
    except Exception as e:
        print(f"Erro ao adicionar coluna: {e}")

if __name__ == "__main__":
    asyncio.run(run())
