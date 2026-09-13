import psycopg2
import sys

def run():
    try:
        conn = psycopg2.connect('postgresql://postgres:postgres@localhost:5432/crm-loja_banco')
        cur = conn.cursor()
        
        # 1. Create entregas_historico table
        cur.execute("""
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
        cur.execute("CREATE INDEX IF NOT EXISTS idx_entregas_historico_entrega_id ON entregas_historico(entrega_id)")
        
        conn.commit()
        cur.close()
        conn.close()
        print("Tabela entregas_historico criada com sucesso.")
    except Exception as e:
        print(f"Erro ao criar tabela: {e}")
        sys.exit(1)

if __name__ == "__main__":
    run()
