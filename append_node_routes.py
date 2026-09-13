import sys

file_path = "c:/dev/crm-loja-final/backend/routes/mercadolivreRoutes.ts"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

new_routes = """
// GET /api/mercadolivre/vehicles/brands
router.get('/api/mercadolivre/vehicles/brands', requireStoreAdminCrm, async (req, res) => {
    try {
        const response = await axios.get(`${process.env.PYTHON_API_URL || 'http://localhost:8000'}/api/mercadolivre/vehicles/brands`);
        res.json(response.data);
    } catch (error: any) {
        console.error('[ML vehicles/brands] ERRO:', error.response?.data || error.message);
        res.status(500).json({ error: 'Erro ao buscar marcas' });
    }
});

// GET /api/mercadolivre/vehicles/categories/:categoryId
router.get('/api/mercadolivre/vehicles/categories/:categoryId', requireStoreAdminCrm, async (req, res) => {
    try {
        const response = await axios.get(`${process.env.PYTHON_API_URL || 'http://localhost:8000'}/api/mercadolivre/vehicles/categories/${req.params.categoryId}`);
        res.json(response.data);
    } catch (error: any) {
        console.error('[ML vehicles/categories] ERRO:', error.response?.data || error.message);
        res.status(500).json({ error: 'Erro ao buscar subcategorias' });
    }
});
"""

with open(file_path, "a", encoding="utf-8") as f:
    f.write("\n" + new_routes + "\n")

print("Appended Node routes successfully!")
