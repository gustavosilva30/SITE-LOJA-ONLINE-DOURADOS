import os

path = r"c:\dev\crm-loja-final\src\pages\Produtos.tsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Fix the atendente_id overwrite
content = content.replace(
    "        else if (key === 'atendente_id') savePayload[key] = atendente?.id || null;",
    "        else if (key === 'atendente_id') { if (!currentEditing) savePayload[key] = atendente?.id || null; }"
)

# And also fix `localizacao_id` ? No, `localizacao_id` should still be sent as part of the form!
# The backend now handles it correctly if it didn't change.

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Frontend patched")
