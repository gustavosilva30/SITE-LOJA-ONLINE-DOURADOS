import re

with open('src/pages/MetasVendedores.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add calculateWorkingDays function
calc_fn = """
function calculateWorkingDays(startDateStr: string, endDateStr: string) {
    if (!startDateStr || !endDateStr) return { dias_uteis: 0, sabados: 0 };
    const start = new Date(`${startDateStr}T12:00:00Z`);
    const end = new Date(`${endDateStr}T12:00:00Z`);
    if (start > end) return { dias_uteis: 0, sabados: 0 };
    
    let uteis = 0;
    let sabados = 0;
    const current = new Date(start);
    while (current <= end) {
        const day = current.getUTCDay();
        if (day >= 1 && day <= 5) uteis++;
        else if (day === 6) sabados++;
        current.setUTCDate(current.getUTCDate() + 1);
    }
    return { dias_uteis: uteis, sabados: sabados };
}
"""
content = content.replace("const emptyForm = {", calc_fn + "\nconst emptyForm = {")

# 2. Add data_inicio and data_fim to emptyForm
content = content.replace(
    "meta_carros_desmontados: ''\n}",
    "meta_carros_desmontados: '',\n    data_inicio: '',\n    data_fim: ''\n}"
)

# 3. Add to handleSave payload
content = content.replace(
    "meta_carros_desmontados: parseInt(form.meta_carros_desmontados) || 0,",
    "meta_carros_desmontados: parseInt(form.meta_carros_desmontados) || 0,\n                data_inicio: form.data_inicio || null,\n                data_fim: form.data_fim || null,"
)

# 4. Add to handleEdit payload
content = content.replace(
    "meta_carros_desmontados: String(atendente.meta_carros_desmontados_cfg || ''),",
    "meta_carros_desmontados: String(atendente.meta_carros_desmontados_cfg || ''),\n            data_inicio: atendente.data_inicio || '',\n            data_fim: atendente.data_fim || '',"
)

# 5. Add UI fields to the modal, under "Cadastro de Produtos" section
ui_fields = """
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Data Inicial (Contagem de Cadastros)</Label>
                                <Input type="date" value={form.data_inicio} onChange={e => {
                                    const data_inicio = e.target.value;
                                    const { dias_uteis, sabados } = calculateWorkingDays(data_inicio, form.data_fim);
                                    setForm(f => ({ ...f, data_inicio, dias_uteis: String(dias_uteis), sabados: String(sabados) }));
                                }} />
                            </div>
                            <div className="space-y-2">
                                <Label>Data Final</Label>
                                <Input type="date" value={form.data_fim} onChange={e => {
                                    const data_fim = e.target.value;
                                    const { dias_uteis, sabados } = calculateWorkingDays(form.data_inicio, data_fim);
                                    setForm(f => ({ ...f, data_fim, dias_uteis: String(dias_uteis), sabados: String(sabados) }));
                                }} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">"""

content = content.replace(
    '<div className="grid grid-cols-2 gap-4">\n                            <div className="space-y-2">\n                                <Label>Dias Úteis no Mês</Label>',
    ui_fields + '\n                            <div className="space-y-2">\n                                <Label>Dias Úteis no Mês (Editável)</Label>'
)

with open('src/pages/MetasVendedores.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
