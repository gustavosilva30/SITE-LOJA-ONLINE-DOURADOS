import sys

file_path = "c:/dev/crm-loja-final/backend/app/api/mercadolivre.py"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

new_routes = """
@router.get("/vehicles/brands")
async def get_ml_vehicle_brands(
    db: asyncpg.Pool = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    \"\"\"Obtém as marcas do Mercado Livre (MLB1744).\"\"\"
    try:
        from app.services.mlCompatibilityService import MLCompatibilityService
        service = MLCompatibilityService(db)
        brands = await service.get_brands()
        return brands
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar marcas do ML: {e}")

@router.get("/vehicles/categories/{category_id}")
async def get_ml_vehicle_categories(
    category_id: str,
    db: asyncpg.Pool = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    \"\"\"Obtém os filhos de uma categoria de veículos do ML (para cascata Modelo -> Ano -> Versão).\"\"\"
    try:
        from app.services.mlCompatibilityService import MLCompatibilityService
        service = MLCompatibilityService(db)
        children = await service.get_category_children(category_id)
        return children
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar filhos da categoria {category_id}: {e}")
"""

with open(file_path, "a", encoding="utf-8") as f:
    f.write("\n" + new_routes + "\n")

print("Appended routes successfully!")
