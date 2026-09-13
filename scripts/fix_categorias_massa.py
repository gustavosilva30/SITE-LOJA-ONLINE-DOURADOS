import asyncio
import os
import sys
import re

# Adjust path to import backend modules
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))

from app.db import get_db_pool

def norm_key(s: str) -> str:
    import unicodedata
    if not s:
        return ""
    # Remove accents
    s = ''.join(c for c in unicodedata.normalize('NFD', s)
                  if unicodedata.category(c) != 'Mn')
    s = s.lower()
    # Replace multiple spaces
    s = re.sub(r'\s+', ' ', s)
    return s.strip()

def expand_side_abbreviations(text: str) -> str:
    t = text
    t = re.sub(r'\ble\b', 'esq', t, flags=re.IGNORECASE)
    t = re.sub(r'\bld\b', 'dir', t, flags=re.IGNORECASE)
    t = re.sub(r'\bte\b', 'tras esq', t, flags=re.IGNORECASE)
    t = re.sub(r'\btd\b', 'tras dir', t, flags=re.IGNORECASE)
    t = re.sub(r'\bde\b', 'diant esq', t, flags=re.IGNORECASE)
    t = re.sub(r'\bdd\b', 'diant dir', t, flags=re.IGNORECASE)
    return t

def significant_category_parts(cat: str) -> list:
    parts = cat.strip().split()
    return [p for p in parts if p and not re.match(r'^(de|da|do|das|dos|e)$', p, re.IGNORECASE)]

def extrair_categoria_fuzzy(raw: str, categorias_dict: dict) -> str | None:
    t = raw.strip()
    if not t or not categorias_dict:
        return None
        
    expanded_text = expand_side_abbreviations(t)
    text_words_array = significant_category_parts(norm_key(expanded_text))
    text_words = set(text_words_array)
    
    matches = []
    
    for cat_id, cat_nome in categorias_dict.items():
        c = cat_nome.strip()
        if not c:
            continue
            
        cat_words = significant_category_parts(norm_key(c))
        if not cat_words:
            continue
            
        all_found = True
        for cw in cat_words:
            if cw not in text_words:
                all_found = False
                break
                
        if all_found:
            matches.append({
                "id": cat_id,
                "nome": c,
                "score": len(cat_words),
                "raw_len": len(c)
            })
            
    if matches:
        # Sort by score desc, then raw_len desc
        matches.sort(key=lambda x: (x["score"], x["raw_len"]), reverse=True)
        return matches[0]["id"]
        
    return None

async def main():
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        # Load all categories
        print("Carregando categorias...")
        cats_records = await conn.fetch("SELECT id, nome FROM categorias")
        categorias_dict = {str(r["id"]): r["nome"] for r in cats_records}
        print(f"Total de categorias carregadas: {len(categorias_dict)}")
        
        # Fetch products without category
        print("Buscando produtos sem categoria...")
        produtos = await conn.fetch("SELECT id, nome FROM produtos WHERE categoria_id IS NULL AND nome IS NOT NULL")
        print(f"Total de produtos sem categoria: {len(produtos)}")
        
        updates = 0
        
        for p in produtos:
            cat_id = extrair_categoria_fuzzy(p["nome"], categorias_dict)
            if cat_id:
                await conn.execute("UPDATE produtos SET categoria_id = $1 WHERE id = $2", cat_id, p["id"])
                updates += 1
                if updates % 100 == 0:
                    print(f"Atualizados {updates} produtos...")
                    
        print(f"Processo concluído! {updates} produtos foram categorizados automaticamente.")

if __name__ == "__main__":
    asyncio.run(main())
