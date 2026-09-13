import os
import io
from minio import Minio
from PIL import Image
import time

ACCESS_KEY = os.environ["MINIO_ACCESS_KEY"]
SECRET_KEY = os.environ["MINIO_SECRET_KEY"]
BUCKET_NAME = os.environ.get("MINIO_BUCKET", "produtos")
LOG_FILE = "/tmp/optimization_progress.log"
STATE_FILE = "/tmp/processed_images.txt"

def optimize_image(data, filename):
    try:
        img = Image.open(io.BytesIO(data))
        original_size = len(data)
        
        fmt = img.format
        if not fmt:
            ext = os.path.splitext(filename)[1].lower()
            if ext in ['.jpg', '.jpeg']: fmt = 'JPEG'
            elif ext == '.png': fmt = 'PNG'
            elif ext == '.webp': fmt = 'WEBP'
            else: return None, 0, 0

        output = io.BytesIO()
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
    except Exception as e:
        return None, 0, 0

def run():
    client = Minio(
        "minio:9000",
        access_key=ACCESS_KEY,
        secret_key=SECRET_KEY,
        secure=False
    )

    processed = set()
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, "r") as f:
            processed = set(line.strip() for line in f)

    log = open(LOG_FILE, "a")
    state = open(STATE_FILE, "a")

    log.write(f"\n--- Inicando sessao em {time.ctime()} ---\n")
    log.flush()

    objects = client.list_objects(BUCKET_NAME, recursive=True)
    
    total_original = 0
    total_optimized = 0
    count = 0
    errors = 0
    
    for obj in objects:
        if obj.is_dir: continue
        filename = obj.object_name
        
        if filename in processed:
            continue
            
        ext = os.path.splitext(filename)[1].lower()
        if ext not in ['.jpg', '.jpeg', '.png', '.webp']: 
            continue

        try:
            response = client.get_object(BUCKET_NAME, filename)
            data = response.read()
            response.close()
            response.release_conn()
            
            opt_data, old_s, new_s = optimize_image(data, filename)
            
            if opt_data and new_s < (old_s * 0.95): # Economia de pelo menos 5%
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
            
            # Marca como processado mesmo que não tenha economizado (para não tentar de novo)
            state.write(filename + "\n")
            state.flush()
            
            if count > 0 and count % 100 == 0:
                log.write(f"[{time.ctime()}] Processadas {count} imagens. Economia total: {(total_original - total_optimized)/(1024*1024):.2f} MB\n")
                log.flush()
            
        except Exception as e:
            errors += 1
            log.write(f"Erro em {filename}: {e}\n")
            log.flush()

    saved = total_original - total_optimized
    log.write(f"\n--- FIM DA SESSAO ---\n")
    log.write(f"Otimizadas: {count}, Erros: {errors}\n")
    log.write(f"Economia nesta sessao: {saved / (1024*1024):.2f} MB\n")
    log.close()
    state.close()

if __name__ == "__main__":
    run()
