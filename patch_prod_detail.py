import re

path = r"c:\dev\crm-loja-final\src\pages\ProdutoDetail.tsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace the first img (main image)
content = content.replace(
    '<img\n                    src={allImages[selectedImageIndex].storage_path}\n                    alt={product.nome}\n                    className="w-full h-full object-contain cursor-pointer"',
    '<img\n                    src={allImages[selectedImageIndex].storage_path}\n                    alt={product.nome}\n                    decoding="async"\n                    className="w-full h-full object-contain cursor-pointer"'
)

# Replace the second img (thumbnail images)
content = content.replace(
    '<img\n                        src={image.storage_path}\n                        alt={`${product.nome} ${index + 1}`}\n                        className="w-full h-full object-contain p-1"\n                      />',
    '<img\n                        src={image.storage_path}\n                        alt={`${product.nome} ${index + 1}`}\n                        loading="lazy"\n                        decoding="async"\n                        className="w-full h-full object-contain p-1"\n                      />'
)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("ProdutoDetail.tsx patched")
