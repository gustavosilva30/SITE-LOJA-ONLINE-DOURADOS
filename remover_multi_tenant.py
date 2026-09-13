import re

path = r"c:\dev\crm-loja-final\AGENTS.md"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Remove section 3 entirely
pattern_sec3 = r"# 3\. MULTI-TENANCY / ISOLAMENTO ENTRE EMPRESAS\n\nTodas as consultas.*?Um usuário de uma empresa jamais pode acessar dados de outra empresa, mesmo conhecendo o ID do registro\.\n\n---\n\n"
content = re.sub(pattern_sec3, "", content, flags=re.DOTALL)

# Also fix the numbering if desired, but for now just removing it is fine.
# We also have in rule 4: "2. pertence à empresa correta;" -> let's remove that line.
content = content.replace("2. pertence à empresa correta;\n", "")

# In rule 6: remove "empresa_id"
content = content.replace("empresa_id\n", "")

# In rule 14: remove "qual empresa"
content = content.replace("qual empresa\n", "")

# In rule 16 (PIX): remove "validação do pedido/empresa" and replace with "validação do pedido"
content = content.replace("validação do pedido/empresa.", "validação do pedido.")

# In rule 20 (Cupons): remove "empresa;"
content = content.replace("validade;\n* empresa;\n* limite", "validade;\n* limite")

# In rule 25 (Storage): remove "empresa do "
content = content.replace("pertence à empresa do usuário", "pertence ao usuário/sistema")

# In rule 40 (LGPD): remove "Nunca retornar dados pessoais de uma empresa para outra."
content = content.replace("Nunca retornar dados pessoais de uma empresa para outra.\n\n", "")

# In rule 42 (Regra IA): remove Tenant section
pattern_tenant = r"### Tenant\n\n> O recurso pertence à empresa correta\?\n\n"
content = re.sub(pattern_tenant, "", content)

# In rule 44 (Teste obrigatório): remove "empresa_id alterado" and "usuário A → recurso da empresa B"
content = content.replace("* empresa;\n", "")
content = content.replace("usuário A → recurso da empresa B\n", "")
content = content.replace("empresa_id alterado\n", "")

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("AGENTS.md atualizado sem multi-tenant.")
