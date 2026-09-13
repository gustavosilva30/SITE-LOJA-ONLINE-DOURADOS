import asyncio
import asyncpg
from decimal import Decimal
import os

async def main():
    pool = await asyncpg.create_pool('postgresql://postgres:postgres@localhost/crm_db')
    async with pool.acquire() as conn:
        records = await conn.fetch("SELECT m.*, u.nome FROM metas_vendedores m JOIN usuarios u ON m.atendente_id = u.id WHERE u.nome ILIKE '%MATEUS%'")
        for r in records:
            print(dict(r))
    await pool.close()

if __name__ == '__main__':
    asyncio.run(main())
