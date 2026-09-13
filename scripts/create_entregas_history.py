import asyncpg
import asyncio

async def run():
    try:
        conn = await asyncpg.connect('postgresql://postgres:postgres@localhost:5432/crm-loja_banco')
        
        # 1. Create entregas_historico table
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS entregas_historico (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                entrega_id UUID NOT NULL REFERENCES entregas(id) ON DELETE CASCADE,
                atendente_id UUID REFERENCES atendentes(id) ON DELETE SET NULL,
                status_anterior TEXT,
                status_novo TEXT,
                mensagem TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        
        # 2. Add indices for performance
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_entregas_historico_entrega_id ON entregas_historico(entrega_id)")
        
        print("Tabela entregas_historico criada com sucesso.")
        await conn.close()
    except Exception as e:
        print(f"Erro ao criar tabela: {e}")

if __name__ == "__main__":
    asyncio.run(run())
