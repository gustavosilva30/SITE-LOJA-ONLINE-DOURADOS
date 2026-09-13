import psycopg2
import sys
import os

def run():
    try:
        conn = psycopg2.connect(os.environ["DATABASE_URL"])
        cur = conn.cursor()
        
        # Get PK of entregas table
        cur.execute("""
            SELECT
                a.attname,
                format_type(a.atttypid, a.atttypmod) AS data_type
            FROM
                pg_index i
            JOIN
                pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
            WHERE
                i.indrelid = 'public.entregas'::regclass
                AND i.indisprimary;
        """)
        rows = cur.fetchall()
        print(f"Primary Key of 'entregas': {rows}")
        
        # Get all unique constraints
        cur.execute("""
            SELECT conname, pg_get_constraintdef(c.oid)
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE n.nspname = 'public' AND c.conrelid = 'public.entregas'::regclass;
        """)
        constraints = cur.fetchall()
        print(f"Constraints of 'entregas': {constraints}")

        cur.close()
        conn.close()
    except Exception as e:
        print(f"Erro: {e}")
        sys.exit(1)

if __name__ == "__main__":
    run()
