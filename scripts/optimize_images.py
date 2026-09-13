import os
import io
from minio import Minio
from PIL import Image
import time

# Configurações do MinIO via variáveis de ambiente do backend
MINIO_ENDPOINT = os.environ.get("MINIO_ENDPOINT", "minio:9000").replace("http://", "").replace("https://", "")
ACCESS_KEY = os.environ["MINIO_ACCESS_KEY"]
SECRET_KEY = os.environ["MINIO_SECRET_KEY"]
BUCKET_NAME = os.environ.get("MINIO_BUCKET", "produtos")

def optimize_image(data, filename):
    img = Image.open(io.BytesIO(data))
    original_size = len(data)
    
    # Formato de saída
    fmt = img.format
    if not fmt:
        # Tenta descobrir pela extensão
        ext = os.path.splitext(filename)[1].lower()
        if ext in ['.jpg', '.jpeg']: fmt = 'JPEG'
        elif ext == '.png': fmt = 'PNG'
        elif ext == '.webp': fmt = 'WEBP'
        else: return None, 0, 0

    # Otimização
    output = io.BytesIO()
    
    # Se for RGBA e o destino for JPEG, precisa converter
    if img.mode in ('RGBA', 'P') and fmt == 'JPEG':
        img = img.convert('RGB')

    if fmt == 'JPEG':
        img.save(output, format='JPEG', quality=80, optimize=True)
    elif fmt == 'PNG':
        img.save(output, format='PNG', optimize=True)
    elif fmt == 'WEBP':
        img.save(output, format='WEBP', quality=80, method=6)
    else:
        return None, 0, 0

    optimized_data = output.getvalue()
    optimized_size = len(optimized_data)
    
    return optimized_data, original_size, optimized_size

def run():
    # Nota: Dentro do container, talvez o endpoint precise ser diferente
    # Mas como o backend usa a URL do Easypanel, vamos tentar ela primeiro.
    # Se falhar, tentamos o nome do serviço 'minio:9000'
    
    client = Minio(
        "minio:9000", # Tenta conexão direta via Docker Network
        access_key=ACCESS_KEY,
        secret_key=SECRET_KEY,
        secure=False
    )

    print(f"Iniciando otimização do bucket '{BUCKET_NAME}'...")
    
    objects = client.list_objects(BUCKET_NAME, recursive=True)
    
    total_original = 0
    total_optimized = 0
    count = 0
    
    for obj in objects:
        if obj.is_dir:
            continue
            
        filename = obj.object_name
        ext = os.path.splitext(filename)[1].lower()
        
        if ext not in ['.jpg', '.jpeg', '.png', '.webp']:
            continue

        try:
            # Download
            response = client.get_object(BUCKET_NAME, filename)
            data = response.read()
            response.close()
            response.release_conn()
            
            # Optimize
            opt_data, old_s, new_s = optimize_image(data, filename)
            
            if opt_data and new_s < old_s:
                # Upload back
                client.put_object(
                    BUCKET_NAME, 
                    filename, 
                    io.BytesIO(opt_data), 
                    len(opt_data),
                    content_type=obj.content_type
                )
                total_original += old_s
                total_optimized += new_s
                count += 1
                print(f"[{count}] Otimizado: {filename} ({old_s//1024}KB -> {new_s//1024}KB)")
            else:
                # print(f"Ignorado (já otimizado ou não suportado): {filename}")
                pass
                
        except Exception as e:
            print(f"Erro ao processar {filename}: {e}")

    if count > 0:
        saved = total_original - total_optimized
        percent = (saved / total_original) * 100 if total_original > 0 else 0
        print("\n--- RESUMO ---")
        print(f"Total de imagens processadas: {count}")
        print(f"Espaço original: {total_original / (1024*1024):.2f} MB")
        print(f"Espaço otimizado: {total_optimized / (1024*1024):.2f} MB")
        print(f"Economia: {saved / (1024*1024):.2f} MB ({percent:.1f}%)")
    else:
        print("Nenhuma imagem precisou de otimização.")

if __name__ == "__main__":
    run()
