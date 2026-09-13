import re

# 1. Patch api.ts
path_api = r"c:\dev\crm-loja-final\src\lib\api.ts"
with open(path_api, "r", encoding="utf-8") as f:
    api_content = f.read()

# Add busca to interface and query string
api_content = re.sub(
    r"(data: string\s+atendente_id\?: string\s+nivel\?: string)",
    r"\1\n    busca?: string",
    api_content
)

api_content = re.sub(
    r"(if \(params\.nivel\) q\.append\('nivel', params\.nivel\))",
    r"\1\n    if (params.busca) q.append('busca', params.busca)",
    api_content
)

with open(path_api, "w", encoding="utf-8") as f:
    f.write(api_content)
print("api.ts patched")

# 2. Patch LogsSistema.tsx
path_logs = r"c:\dev\crm-loja-final\src\pages\LogsSistema.tsx"
with open(path_logs, "r", encoding="utf-8") as f:
    logs_content = f.read()

if "filtroBusca" not in logs_content:
    logs_content = logs_content.replace(
        "const [filtroAtendente, setFiltroAtendente] = useState<string>('todos')",
        "const [filtroAtendente, setFiltroAtendente] = useState<string>('todos')\n  const [filtroBusca, setFiltroBusca] = useState<string>('')\n  const [debouncedBusca, setDebouncedBusca] = useState<string>('')"
    )
    
    # Add useEffect for debounce
    debounce_effect = """
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedBusca(filtroBusca)
    }, 500)
    return () => clearTimeout(timer)
  }, [filtroBusca])
    """
    logs_content = logs_content.replace(
        "const fetchLogs = useCallback(async () => {",
        debounce_effect + "\n  const fetchLogs = useCallback(async () => {"
    )

    # Pass debouncedBusca to API
    logs_content = logs_content.replace(
        "limit: 500,",
        "limit: 500,\n          busca: debouncedBusca || undefined,"
    )
    logs_content = logs_content.replace(
        "[dataDia, filtroAtendente, filtroNivel]",
        "[dataDia, filtroAtendente, filtroNivel, debouncedBusca]"
    )

    # UI Input field
    input_field = """          <div className="w-full sm:w-64">
            <Label className="text-xs mb-1 block">Buscar</Label>
            <Input 
              type="text" 
              placeholder="Ex: venda, produto, João..."
              value={filtroBusca} 
              onChange={e => setFiltroBusca(e.target.value)} 
            />
          </div>"""
          
    logs_content = logs_content.replace(
        "          <div className=\"flex flex-col gap-1\">\n            <Label className=\"text-xs\">Filtro Nível</Label>",
        input_field + "\n          <div className=\"flex flex-col gap-1\">\n            <Label className=\"text-xs\">Filtro Nível</Label>"
    )
    
    # Wait, there's `import { Input } from '@/components/ui/input'` maybe missing
    if "import { Input }" not in logs_content:
        logs_content = logs_content.replace(
            "import { Select",
            "import { Input } from '@/components/ui/input'\nimport { Select"
        )

    with open(path_logs, "w", encoding="utf-8") as f:
        f.write(logs_content)
    print("LogsSistema.tsx patched")
else:
    print("LogsSistema.tsx already patched")
