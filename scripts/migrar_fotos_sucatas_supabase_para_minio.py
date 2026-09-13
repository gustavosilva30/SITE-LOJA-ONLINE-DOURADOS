"""
Migra fotos de sucatas do Supabase Storage para MinIO e atualiza as URLs no banco.

Uso:
  python scripts/migrar_fotos_sucatas_supabase_para_minio.py

Variáveis de ambiente necessárias (mesmo .env do backend):
  DATABASE_URL          — postgres connection string
  MINIO_ENDPOINT        — ex: minio.seudominio.com.br
  MINIO_ACCESS_KEY
  MINIO_SECRET_KEY
  MINIO_BUCKET          — ex: produtos
  MINIO_USE_SSL         — true/false
  MINIO_PUBLIC_URL      — ex: https://midias.seudominio.com.br/produtos
"""

import asyncio
import os
import re
import httpx
from minio import Minio
import asyncpg
from dotenv import load_dotenv

load_dotenv()

SUPABASE_PATTERN = re.compile(
    r'https://[^/]+\.supabase\.co/storage/v1/object/public/produtos/(.+)'
)

async def main():
    db = await asyncpg.connect(os.environ["DATABASE_URL"])
    
    # Sanitiza o endpoint para o construtor do Minio
    endpoint_raw = os.environ["MINIO_ENDPOINT"]
    secure = os.environ.get("MINIO_USE_SSL", "true").lower() == "true"
    
    if "://" in endpoint_raw:
        from urllib.parse import urlparse
        parsed = urlparse(endpoint_raw)
        endpoint = parsed.netloc
        secure = parsed.scheme == "https"
    else:
        endpoint = endpoint_raw

    minio_client = Minio(
        endpoint,
        access_key=os.environ["MINIO_ACCESS_KEY"],
        secret_key=os.environ["MINIO_SECRET_KEY"],
        secure=secure,
    )
    bucket = os.environ.get("MINIO_BUCKET", "produtos")
    minio_public_url = os.environ["MINIO_PUBLIC_URL"].rstrip("/")

    rows = await db.fetch("SELECT id, fotos FROM sucatas WHERE fotos IS NOT NULL")
    print(f"Total de sucatas com fotos: {len(rows)}")

    async with httpx.AsyncClient(timeout=30) as http:
        for row in rows:
            sucata_id = row["id"]
            fotos_raw = row["fotos"]
            
            if not fotos_raw:
                continue
            
            import json
            if isinstance(fotos_raw, str):
                try:
                    fotos = json.loads(fotos_raw)
                except:
                    fotos = [fotos_raw]
            else:
                fotos = list(fotos_raw)
            
            novas_fotos = []
            alterado = False
            
            for url in fotos:
                m = SUPABASE_PATTERN.match(str(url or ""))
                if not m:
                    novas_fotos.append(url)
                    continue
                
                object_key = m.group(1)  # ex: sucatas/1774964571535-xxx.jpeg
                nova_url = f"{minio_public_url}/{object_key}"
                
                # Verifica se já existe no MinIO
                try:
                    minio_client.stat_object(bucket, object_key)
                    print(f"  [OK já existe] {object_key}")
                    novas_fotos.append(nova_url)
                    alterado = True
                    continue
                except Exception:
                    pass
                
                # Baixa do Supabase e envia para MinIO
                try:
                    resp = await http.get(url)
                    if resp.status_code != 200:
                        print(f"  [ERRO {resp.status_code}] {url} — mantendo URL original")
                        novas_fotos.append(url)
                        continue
                    
                    content_type = resp.headers.get("content-type", "image/jpeg")
                    data = resp.content
                    
                    from io import BytesIO
                    minio_client.put_object(
                        bucket, object_key, BytesIO(data), len(data),
                        content_type=content_type
                    )
                    print(f"  [MIGRADO] {object_key}")
                    novas_fotos.append(nova_url)
                    alterado = True
                    
                except Exception as e:
                    print(f"  [FALHA] {object_key}: {e} — mantendo URL original")
                    novas_fotos.append(url)
            
            if alterado:
                await db.execute(
                    "UPDATE sucatas SET fotos = $1 WHERE id = $2",
                    novas_fotos, sucata_id
                )
                print(f"Sucata {sucata_id}: {len(novas_fotos)} fotos atualizadas no banco")

    await db.close()
    print("Migração concluída.")

if __name__ == "__main__":
    asyncio.run(main())
