import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ImportadorVeiculos } from "@/components/ImportadorVeiculos";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Trash2, Pencil, Car, Upload, FileSpreadsheet, X, Check, Info, ChevronUp, ChevronDown, Loader2, Save, Settings2, LayoutGrid } from "lucide-react";
import { api } from "@/lib/api";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** Garante que a URL da imagem é válida e absoluta para evitar ERR_CACHE_OPERATION_NOT_SUPPORTED */
function safeImgUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("//")) return "https:" + trimmed;
  return "";
}

function LogoImg({ url, className }: { url: string | null | undefined; className?: string }) {
  const [error, setError] = useState(false);
  const safe = safeImgUrl(url);
  
  if (!safe || error) {
    return <Car className={className ?? "w-6 h-6 text-muted-foreground"} />;
  }
  
  return (
    <img
      src={safe}
      className={className ?? "w-8 h-8 object-contain"}
      alt=""
      onError={() => setError(true)}
    />
  );
}

export function BancoVeiculos() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("marcas");
  const [loading, setLoading] = useState(true);
  const [filtroMarca, setFiltroMarca] = useState("");
  const [vMarca, setVMarca] = useState("");
  const [vModelo, setVModelo] = useState("");
  const [searchVersao, setSearchVersao] = useState("");
  const [logoLoading, setLogoLoading] = useState<string | null>(null);

  // States
  const [marcas, setMarcas] = useState<any[]>([]);
  const [modelos, setModelos] = useState<any[]>([]);
  const [versoes, setVersoes] = useState<any[]>([]);
  const [isMarcaModalOpen, setIsMarcaModalOpen] = useState(false);
  const [isModeloModalOpen, setIsModeloModalOpen] = useState(false);
  const [isVersaoModalOpen, setIsVersaoModalOpen] = useState(false);
  const [marcaForm, setMarcaForm] = useState<any>({ id: null, nome: "", logo_url: "" });
  const [modeloForm, setModeloForm] = useState<any>({ id: null, marca_id: "", nome: "" });
  const [versaoForm, setVersaoForm] = useState<any>({ id: null, marca: "", modelo: "", familia: "", versao: "", motorizacao: "", ano_inicio: "", ano_fim: "", detalhes: "" });

  // Massa
  const [selectedVersoes, setSelectedVersoes] = useState<string[]>([]);
  const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);
  const [bulkEditForm, setBulkEditForm] = useState<any>({
    marca: "",
    modelo: "",
    familia: "",
    versao: "",
    motorizacao: "",
    ano_inicio: "",
    ano_fim: "",
    detalhes: ""
  });
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [versoesEdits, setVersoesEdits] = useState<Record<string, any>>({});
  const [bulkApplyValues, setBulkApplyValues] = useState<any>({});
  
  const [isBulkCreateModalOpen, setIsBulkCreateModalOpen] = useState(false);
  const [isBulkCreating, setIsBulkCreating] = useState(false);
  // Grid rows for bulk create (Excel-style)
  const [bulkCreateRows, setBulkCreateRows] = useState<any[]>([]);

  const addBulkCreateRow = () =>
    setBulkCreateRows(prev => [...prev, { marca: "", modelo: "", familia: "", versao: "", motorizacao: "", ano_inicio: "", ano_fim: "", detalhes: "" }]);

  const updateBulkCreateRow = (idx: number, field: string, value: string) =>
    setBulkCreateRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));

  const removeBulkCreateRow = (idx: number) =>
    setBulkCreateRows(prev => prev.filter((_, i) => i !== idx));

  // Paginação
  const [marcasVisiveis,  setMarcasVisiveis]  = useState(20);
  const [modelosVisiveis, setModelosVisiveis] = useState(20);
  const [versoesVisiveis, setVersoesVisiveis] = useState(20);
  const [versoesExpandidas, setVersoesExpandidas] = useState<string[]>([]);

  // Fetch functions
  const fetchMarcas = async () => {
    try {
      const data = await api.get("/api/catalogo/marcas-veiculos");
      setMarcas(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error("Erro ao carregar marcas");
    }
  };

  const fetchModelos = async () => {
    try {
      const qs = new URLSearchParams();
      if (filtroMarca) qs.set("marca_id", filtroMarca);
      const data = await api.get(`/api/catalogo/modelos-veiculos?${qs.toString()}`);
      setModelos(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error("Erro ao carregar modelos");
    }
  };

  const fetchVersoes = async () => {
    try {
      const qs = new URLSearchParams();
      if (vMarca) qs.set("marca", vMarca);
      if (vModelo) qs.set("modelo", vModelo);
      if (searchVersao) qs.set("q", searchVersao);
      qs.set("limit", "10000"); // retorna array direto (compat. legada)
      const data = await api.get(`/api/catalogo/versoes-veiculos?${qs.toString()}`);
      setVersoes(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error("Erro ao carregar versões");
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setMarcasVisiveis(20);
    setModelosVisiveis(20);
    setVersoesVisiveis(20);
    try {
      if (activeTab === "marcas") {
        await fetchMarcas();
      } else if (activeTab === "modelos") {
        await fetchModelos();
      } else if (activeTab === "versoes") {
        await fetchVersoes();
        // Carregar marcas e modelos para os selects de filtro
        if (marcas.length === 0) await fetchMarcas();
        if (modelos.length === 0) await fetchModelos();
      }
    } catch (error) {
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Carregar marcas e modelos para que os selects já estejam populados
    fetchMarcas();
    fetchModelos();
  }, []);

  useEffect(() => {
    fetchData();
  }, [activeTab, filtroMarca, vMarca, vModelo]);

  const handleSaveMarca = async () => {
    if (!marcaForm.nome) return toast.error("Nome é obrigatório");
    try {
      if (marcaForm.id) {
        await api.put(`/api/catalogo/marcas-veiculos/${marcaForm.id}`, marcaForm);
        toast.success("Marca atualizada");
      } else {
        await api.post("/api/catalogo/marcas-veiculos", marcaForm);
        toast.success("Marca criada");
      }
      setIsMarcaModalOpen(false);
      await fetchMarcas();
    } catch (error) {
      toast.error("Erro ao salvar marca");
    }
  };

  const handleImportMarcas = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      let rows = [];
      if (file.name.endsWith(".csv")) {
        const results = Papa.parse(evt.target.result, { header: true });
        rows = results.data;
      } else {
        const wb = XLSX.read(evt.target.result, { type: "binary" });
        rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      }
      try {
        const data = await api.post("/api/catalogo/marcas-veiculos/importar", { rows });
        toast.success(`${data.inseridos} marcas inseridas, ${data.ignorados} ignoradas`);
        fetchMarcas();
      } catch (error) {
        toast.error("Erro na importação");
      }
    };
    if (file.name.endsWith(".csv")) reader.readAsText(file);
    else reader.readAsBinaryString(file);
  };

  const handleSaveModelo = async () => {
    if (!modeloForm.marca_id || !modeloForm.nome) return toast.error("Preencha todos os campos");
    try {
      if (modeloForm.id) {
        await api.put(`/api/catalogo/modelos-veiculos/${modeloForm.id}`, modeloForm);
        toast.success("Modelo atualizado");
      } else {
        await api.post("/api/catalogo/modelos-veiculos", modeloForm);
        toast.success("Modelo criado");
      }
      setIsModeloModalOpen(false);
      await fetchModelos();
    } catch (error) {
      toast.error("Erro ao salvar modelo");
    }
  };

  const handleSaveVersao = async () => {
    if (!versaoForm.marca || !versaoForm.modelo) return toast.error("Marca e Modelo são obrigatórios");
    try {
      if (versaoForm.id) {
        await api.put(`/api/catalogo/versoes-veiculos/${versaoForm.id}`, versaoForm);
        toast.success("Versão atualizada");
      } else {
        await api.post("/api/catalogo/versoes-veiculos", versaoForm);
        toast.success("Versão criada");
      }
      setIsVersaoModalOpen(false);
      await fetchVersoes();
    } catch (error) {
      toast.error("Erro ao salvar versão");
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedVersoes.length) return;
    if (!confirm(`Deseja excluir permanentemente ${selectedVersoes.length} versões?`)) return;

    setIsBulkDeleting(true);
    try {
      await api.delete("/api/catalogo/versoes-veiculos/bulk/delete", { body: JSON.stringify({ ids: selectedVersoes }) });
      toast.success(`${selectedVersoes.length} versões excluídas.`);
      setSelectedVersoes([]);
      fetchVersoes();
    } catch (error) {
      toast.error("Erro ao excluir versões em massa");
    } finally {
      setIsBulkDeleting(false);
    }
  };


  const handleSaveBulk = async () => {
    const editIds = Object.keys(versoesEdits);
    if (editIds.length === 0) return toast.info("Nenhuma alteração para salvar");

    setIsBulkUpdating(true);
    let successCount = 0;
    try {
      // Fazemos updates individuais ou podemos criar um endpoint bulk que aceita lista
      // Para seguir o padrão do Estoque Alteração Massa, faremos o loop aqui
      for (const id of editIds) {
        const payload = versoesEdits[id];
        if (Object.keys(payload).length > 0) {
          await api.put(`/api/catalogo/versoes-veiculos/${id}`, payload);
          successCount++;
        }
      }
      toast.success(`${successCount} versões atualizadas com sucesso!`);
      setVersoesEdits({});
      setSelectedVersoes([]);
      setIsBulkEditModalOpen(false);
      fetchVersoes();
    } catch (error) {
      toast.error("Erro ao salvar algumas alterações");
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const updateBulkEdit = (id: string, field: string, value: any) => {
    setVersoesEdits(prev => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        [field]: value
      }
    }));
  };

  const applyToAllSelected = (field: string) => {
    const val = bulkApplyValues[field];
    if (val === undefined || val === "") return;

    const newEdits = { ...versoesEdits };
    selectedVersoes.forEach(id => {
      newEdits[id] = {
        ...(newEdits[id] || {}),
        [field]: val
      };
    });
    setVersoesEdits(newEdits);
    setBulkApplyValues({ ...bulkApplyValues, [field]: "" });
    toast.info(`Valor aplicado a todos em "${field}"`);
  };

  const handleBulkCreate = async () => {
    const validRows = bulkCreateRows.filter(r => r.marca && r.modelo);
    if (validRows.length === 0) {
      return toast.error("Adicione ao menos uma linha com Marca e Modelo preenchidos");
    }
    setIsBulkCreating(true);
    try {
      const res = await api.post("/api/catalogo/versoes-veiculos/importar", { rows: validRows });
      toast.success(`${res.inseridos} versões criadas, ${res.ignorados} ignoradas (duplicatas).`);
      setIsBulkCreateModalOpen(false);
      setBulkCreateRows([]);
      fetchVersoes();
    } catch (error) {
      toast.error("Erro na criação em massa");
    } finally {
      setIsBulkCreating(false);
    }
  };

  const toggleSelectVersao = (id: string) => {
    setSelectedVersoes(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAllVersoes = () => {
    const pageIds = (versoes || []).slice(0, versoesVisiveis).map(v => v.id);
    const allSelected = pageIds.every(id => selectedVersoes.includes(id));
    
    if (allSelected) {
      setSelectedVersoes(prev => prev.filter(id => !pageIds.includes(id)));
    } else {
      setSelectedVersoes(prev => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const handleLogoUpload = async (file: File) => {
    try {
      const formData = new FormData()
      formData.append('file', file)
      const result = await api.postMultipart(
        '/api/admin/upload-produto-imagem',
        formData
      )
      setMarcaForm(prev => ({ ...prev, logo_url: result.url }))
      toast.success("Logo atualizada com sucesso!")
    } catch (error) {
      toast.error("Erro ao fazer upload da logo")
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Car className="w-8 h-8" /> Banco de Veículos
        </h1>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="marcas">Marcas</TabsTrigger>
          <TabsTrigger value="modelos">Modelos</TabsTrigger>
          <TabsTrigger value="versoes">Versões</TabsTrigger>
        </TabsList>

        <TabsContent value="marcas" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Marcas de Veículos</CardTitle>
              <div className="flex gap-2">
                <div className="relative">
                  <Input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleImportMarcas} accept=".csv,.xlsx,.xls" />
                  <Button variant="outline" className="gap-2"><FileSpreadsheet className="w-4 h-4" /> Importar</Button>
                </div>
                <Button onClick={() => { setMarcaForm({ id: null, nome: "", logo_url: "" }); setIsMarcaModalOpen(true); }} className="gap-2">
                  <Plus className="w-4 h-4" /> Nova Marca
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Logo</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Qtd Modelos</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(marcas || []).slice(0, marcasVisiveis).map((m: any) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        <label
                          className="relative cursor-pointer group block w-10 h-10"
                          title={m.logo_url ? "Clique para trocar a logo" : "Clique para adicionar logo"}
                        >
                          {m.logo_url
                            ? <LogoImg url={m.logo_url} className="w-10 h-10 object-contain rounded border" />
                            : (
                              <div className="w-10 h-10 border-2 border-dashed border-muted-foreground/30 rounded flex items-center justify-center hover:border-primary/50 hover:bg-muted/30 transition-colors">
                                <Car className="w-5 h-5 text-muted-foreground/50" />
                              </div>
                            )
                          }
                          {/* Overlay de loading */}
                          {logoLoading === m.id && (
                            <div className="absolute inset-0 bg-white/60 dark:bg-black/60 rounded flex items-center justify-center z-10">
                              <Loader2 className="w-5 h-5 text-primary animate-spin" />
                            </div>
                          )}
                          {/* Overlay de hover */}
                          <div className="absolute inset-0 bg-black/40 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Upload className="w-3.5 h-3.5 text-white" />
                          </div>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={logoLoading === m.id}
                            onChange={async (e) => {
                              const file = e.target.files?.[0]
                              if (!file) return
                              
                              setLogoLoading(m.id)
                              const localUrl = URL.createObjectURL(file)
                              // Atualizar preview na lista imediatamente
                              setMarcas((prev: any[]) => prev.map((marca: any) =>
                                marca.id === m.id ? { ...marca, logo_url: localUrl } : marca
                              ))
                              try {
                                const formData = new FormData()
                                formData.append('file', file)
                                const result = await api.postMultipart('/api/admin/upload-produto-imagem', formData)
                                URL.revokeObjectURL(localUrl)
                                // Salvar no banco
                                await api.put(`/api/catalogo/marcas-veiculos/${m.id}`, { nome: m.nome, logo_url: result.url })
                                setMarcas((prev: any[]) => prev.map((marca: any) =>
                                  marca.id === m.id ? { ...marca, logo_url: result.url } : marca
                                ))
                                toast.success(`Logo da ${m.nome} atualizada!`)
                              } catch {
                                URL.revokeObjectURL(localUrl)
                                setMarcas((prev: any[]) => prev.map((marca: any) =>
                                  marca.id === m.id ? { ...marca, logo_url: m.logo_url } : marca
                                ))
                                toast.error("Erro ao fazer upload da logo")
                              } finally {
                                setLogoLoading(null)
                              }
                              e.target.value = ""
                            }}
                          />
                        </label>
                      </TableCell>
                      <TableCell className="font-bold">{m.nome}</TableCell>
                      <TableCell><Badge variant="secondary">{m.qtd_modelos}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => { setMarcaForm(m); setIsMarcaModalOpen(true); }}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={async () => { if(confirm("Excluir marca?")) { await api.delete(`/api/catalogo/marcas-veiculos/${m.id}`); fetchData(); } }}><Trash2 className="w-4 h-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                {marcas.length > marcasVisiveis && (
                  <caption className="mt-3 caption-bottom">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs"
                      onClick={() => setMarcasVisiveis(v => v + 20)}
                    >
                      Mostrar mais {Math.min(20, marcas.length - marcasVisiveis)} de {marcas.length - marcasVisiveis} restantes
                    </Button>
                  </caption>
                )}
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="modelos" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-4 flex-1">
                <CardTitle>Modelos</CardTitle>
                <select className="h-9 rounded-md border border-input px-3 text-sm" value={filtroMarca} onChange={(e) => setFiltroMarca(e.target.value)}>
                  <option value="">Todas as marcas</option>
                  {marcas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
              </div>
              <Button onClick={() => { setModeloForm({ id: null, marca_id: filtroMarca, nome: "" }); setIsModeloModalOpen(true); }} className="gap-2">
                <Plus className="w-4 h-4" /> Novo Modelo
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Marca</TableHead>
                    <TableHead>Qtd Versões</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(modelos || []).slice(0, modelosVisiveis).map((m: any) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-bold">{m.nome}</TableCell>
                      <TableCell>{m.marca_nome}</TableCell>
                      <TableCell><Badge variant="secondary">{m.qtd_versoes}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => { setModeloForm(m); setIsModeloModalOpen(true); }}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={async () => { if(confirm("Excluir modelo?")) { await api.delete(`/api/catalogo/modelos-veiculos/${m.id}`); fetchData(); } }}><Trash2 className="w-4 h-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                {modelos.length > modelosVisiveis && (
                  <caption className="mt-3 caption-bottom">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs"
                      onClick={() => setModelosVisiveis(v => v + 20)}
                    >
                      Mostrar mais {Math.min(20, modelos.length - modelosVisiveis)} de {modelos.length - modelosVisiveis} restantes
                    </Button>
                  </caption>
                )}
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="versoes" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-col space-y-4">
              <div className="flex justify-between items-center">
                <CardTitle>Banco de Versões (Master)</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => navigate("/banco-veiculos/versoes-massa")} className="gap-2 border-emerald-500/40 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
                    <LayoutGrid className="w-4 h-4" /> Grade / Planilha
                  </Button>
                  <Button variant="outline" onClick={() => setIsBulkCreateModalOpen(true)} className="gap-2 border-primary/30 text-primary hover:bg-primary/5">
                    <Plus className="w-4 h-4" /> Criação em Massa
                  </Button>
                  <Button onClick={() => { setVersaoForm({ id: null, marca: vMarca, modelo: vModelo, familia: "", versao: "", motorizacao: "", ano_inicio: "", ano_fim: "" }); setIsVersaoModalOpen(true); }} className="gap-2">
                    <Plus className="w-4 h-4" /> Nova Versão
                  </Button>
                </div>
              </div>
              <ImportadorVeiculos onImportado={() => fetchData()} />
              <div className="flex gap-4">
                <select className="h-9 rounded-md border border-input px-3 text-sm min-w-[150px]" value={vMarca} onChange={(e) => { setVMarca(e.target.value); setVModelo(""); setVersoesVisiveis(20); }}>
                  <option value="">Marca</option>
                  {marcas.map(m => <option key={m.id} value={m.nome}>{m.nome}</option>)}
                </select>
                <select className="h-9 rounded-md border border-input px-3 text-sm min-w-[150px]" value={vModelo} onChange={(e) => { setVModelo(e.target.value); setVersoesVisiveis(20); }} disabled={!vMarca}>
                  <option value="">Modelo</option>
                  {modelos.filter(m => !vMarca || m.marca_nome?.toLowerCase() === vMarca.toLowerCase()).map(m => <option key={m.id} value={m.nome}>{m.nome}</option>)}
                </select>
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Buscar versão, motorização..." className="pl-9" value={searchVersao} onChange={(e) => { setSearchVersao(e.target.value); setVersoesVisiveis(20); }} onKeyDown={(e) => e.key === "Enter" && fetchData()} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 rounded border-slate-300 accent-primary cursor-pointer"
                        checked={versoes.length > 0 && versoes.slice(0, versoesVisiveis).every(v => selectedVersoes.includes(v.id))}
                        onChange={toggleSelectAllVersoes}
                      />
                    </TableHead>
                    <TableHead>Veículo</TableHead>
                    <TableHead>Família</TableHead>
                    <TableHead>Versão</TableHead>
                    <TableHead>Motorização</TableHead>
                    <TableHead>Anos</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(versoes || []).slice(0, versoesVisiveis).map((v: any) => (
                    <React.Fragment key={v.id}>
                      <TableRow
                        className={cn(
                          v.detalhes ? "cursor-pointer hover:bg-muted/50" : "",
                          selectedVersoes.includes(v.id) ? "bg-primary/5 border-l-2 border-l-primary" : ""
                        )}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).tagName === 'INPUT') return;
                          if (v.detalhes) {
                            setVersoesExpandidas(prev =>
                              prev.includes(v.id) ? prev.filter(id => id !== v.id) : [...prev, v.id]
                            )
                          }
                        }}
                      >
                        <TableCell onClick={e => e.stopPropagation()}>
                          <input 
                            type="checkbox" 
                            className="w-4 h-4 rounded border-slate-300 accent-primary cursor-pointer"
                            checked={selectedVersoes.includes(v.id)}
                            onChange={() => toggleSelectVersao(v.id)}
                          />
                        </TableCell>
                        <TableCell className="font-bold">{v.marca} {v.modelo}</TableCell>
                        <TableCell>{v.familia}</TableCell>
                        <TableCell>{v.versao}</TableCell>
                        <TableCell>{v.motorizacao}</TableCell>
                        <TableCell>{v.ano_inicio} - {v.ano_fim || "Atual"}</TableCell>
                        <TableCell className="text-right">
                          {v.detalhes && (
                            <span
                              className="inline-flex items-center mr-2"
                              title="Ver detalhes"
                            >
                              {versoesExpandidas.includes(v.id)
                                ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                                : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                              }
                            </span>
                          )}
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setVersaoForm(v); setIsVersaoModalOpen(true); }}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={async (e) => {
                            e.stopPropagation();
                            if(confirm("Excluir versão?")) { await api.delete(`/api/catalogo/versoes-veiculos/${v.id}`); fetchData(); }
                          }}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                      {/* Linha expandida com detalhes */}
                      {v.detalhes && versoesExpandidas.includes(v.id) && (
                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                          <TableCell colSpan={7} className="py-2 px-4">
                            <div className="flex items-start gap-2 text-sm text-muted-foreground">
                              <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                              <p className="whitespace-pre-wrap leading-relaxed">{v.detalhes}</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  ))}
                </TableBody>
                {versoes.length > versoesVisiveis && (
                  <caption className="mt-3 caption-bottom">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs"
                      onClick={() => setVersoesVisiveis(v => v + 20)}
                    >
                      Mostrar mais {Math.min(20, versoes.length - versoesVisiveis)} de {versoes.length - versoesVisiveis} restantes
                    </Button>
                  </caption>
                )}
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal Marca */}
      <Modal title="Marca de Veículo" isOpen={isMarcaModalOpen} onClose={() => setIsMarcaModalOpen(false)}>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome da Marca</Label>
            <Input value={marcaForm.nome} onChange={e => setMarcaForm({ ...marcaForm, nome: e.target.value })} placeholder="Ex: Volkswagen" />
          </div>
          <div className="space-y-2">
            <Label>Logo da Marca</Label>
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-center relative">
                {marcaForm.logo_url ? (
                  <LogoImg url={marcaForm.logo_url} className="w-20 h-20 object-contain border rounded" />
                ) : (
                  <div className="w-20 h-20 border-2 border-dashed rounded flex items-center justify-center">
                    <Upload className="w-8 h-8 text-muted-foreground" />
                  </div>
                )}
                {logoLoading === 'modal' && (
                  <div className="absolute inset-0 bg-white/60 dark:bg-black/60 rounded flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  </div>
                )}
                {marcaForm.logo_url && safeImgUrl(marcaForm.logo_url) && !logoLoading && (
                  <button
                    type="button"
                    className="text-xs text-destructive hover:underline mt-1"
                    onClick={() => setMarcaForm((prev: any) => ({ ...prev, logo_url: "" }))}
                  >
                    Remover logo
                  </button>
                )}
              </div>
              <div className="flex-1">
                <Input
                  type="file"
                  accept="image/*"
                  disabled={logoLoading === 'modal'}
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return

                    setLogoLoading('modal')
                    // 1. Mostrar preview LOCAL imediatamente
                    const localUrl = URL.createObjectURL(file)
                    setMarcaForm((prev: any) => ({ ...prev, logo_url: localUrl }))

                    // 2. Fazer upload em background
                    try {
                      const formData = new FormData()
                      formData.append('file', file)
                      const result = await api.postMultipart('/api/admin/upload-produto-imagem', formData)
                      
                      // 3. Substituir URL local pela URL definitiva do MinIO
                      URL.revokeObjectURL(localUrl)
                      setMarcaForm((prev: any) => ({ ...prev, logo_url: result.url }))
                      toast.success("Logo atualizada com sucesso!")
                    } catch {
                      URL.revokeObjectURL(localUrl)
                      toast.error("Erro ao fazer upload da imagem")
                      setMarcaForm((prev: any) => ({ ...prev, logo_url: "" }))
                    } finally {
                      setLogoLoading(null)
                    }
                    e.target.value = ""
                  }}
                  className="cursor-pointer"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Clique para selecionar uma imagem (JPG, PNG, etc.)
                </p>
              </div>
            </div>
          </div>
          <Button onClick={handleSaveMarca} className="w-full">Salvar</Button>
        </div>
      </Modal>

      {/* Modal Modelo */}
      <Modal title="Modelo de Veículo" isOpen={isModeloModalOpen} onClose={() => setIsModeloModalOpen(false)}>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Marca</Label>
            <select className="w-full h-10 rounded-md border border-input px-3" value={modeloForm.marca_id} onChange={e => setModeloForm({ ...modeloForm, marca_id: e.target.value })}>
              <option value="">Selecione...</option>
              {marcas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Nome do Modelo</Label>
            <Input value={modeloForm.nome} onChange={e => setModeloForm({ ...modeloForm, nome: e.target.value })} placeholder="Ex: Gol" />
          </div>
          <Button onClick={handleSaveModelo} className="w-full">Salvar</Button>
        </div>
      </Modal>

      {/* Modal Versão (Individual) */}
      <Modal title="Versão de Veículo" isOpen={isVersaoModalOpen} onClose={() => setIsVersaoModalOpen(false)} className="max-w-2xl">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Marca</Label>
            <select className="w-full h-10 rounded-md border border-input px-3" value={versaoForm.marca} onChange={e => setVersaoForm({ ...versaoForm, marca: e.target.value })}>
              <option value="">Selecione...</option>
              {marcas.map(m => <option key={m.id} value={m.nome}>{m.nome}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Modelo</Label>
            <select className="w-full h-10 rounded-md border border-input px-3" value={versaoForm.modelo} onChange={e => setVersaoForm({ ...versaoForm, modelo: e.target.value })} disabled={!versaoForm.marca}>
              <option value="">Selecione...</option>
              {modelos.filter(m => m.marca_nome?.toLowerCase() === versaoForm.marca?.toLowerCase()).map(m => <option key={m.id} value={m.nome}>{m.nome}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Família/Geração</Label>
            <Input value={versaoForm.familia} onChange={e => setVersaoForm({ ...versaoForm, familia: e.target.value })} placeholder="Ex: Gol G5" />
          </div>
          <div className="space-y-2">
            <Label>Versão</Label>
            <Input value={versaoForm.versao} onChange={e => setVersaoForm({ ...versaoForm, versao: e.target.value })} placeholder="Ex: Trend, Comfortline" />
          </div>
          <div className="space-y-2">
            <Label>Motorização</Label>
            <Input value={versaoForm.motorizacao} onChange={e => setVersaoForm({ ...versaoForm, motorizacao: e.target.value })} placeholder="Ex: 1.0 8V" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label>Ano Início</Label>
              <Input type="number" value={versaoForm.ano_inicio} onChange={e => setVersaoForm({ ...versaoForm, ano_inicio: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Ano Fim</Label>
              <Input type="number" value={versaoForm.ano_fim} onChange={e => setVersaoForm({ ...versaoForm, ano_fim: e.target.value })} />
            </div>
          </div>
          <div className="col-span-2 space-y-2">
            <Label>Detalhes / Observações</Label>
            <textarea
              className="w-full min-h-[100px] rounded-md border border-input px-3 py-2 text-sm bg-background resize-y focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Ex: Câmbio automático de 6 velocidades, freios ABS de série, direção elétrica..."
              value={versaoForm.detalhes || ""}
              onChange={e => setVersaoForm({ ...versaoForm, detalhes: e.target.value })}
              maxLength={2000}
            />
            <p className="text-xs text-muted-foreground text-right">
              {(versaoForm.detalhes || "").length}/2000
            </p>
          </div>
          <Button onClick={handleSaveVersao} className="col-span-2 w-full">Salvar</Button>
        </div>
      </Modal>

      {/* Modal Alteração em Massa (Estilo Planilha/Estoque) */}
      <Modal 
        title={`Alteração em Massa - ${selectedVersoes.length} Itens`} 
        isOpen={isBulkEditModalOpen} 
        onClose={() => setIsBulkEditModalOpen(false)} 
        className="max-w-[95vw] w-full h-[90vh]"
      >
        <div className="flex flex-col h-full space-y-4 overflow-hidden">
          {/* Header de Ações Rápidas */}
          <div className="flex items-center gap-4 bg-muted/30 p-3 rounded-lg border">
            <div className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Aplicar a todos:</span>
            </div>
            <div className="flex gap-2 flex-1 items-center">
               <select 
                 className="h-8 rounded-md border border-input px-2 text-xs bg-background"
                 value={bulkApplyValues.field || ""}
                 onChange={(e) => setBulkApplyValues({ ...bulkApplyValues, field: e.target.value })}
               >
                 <option value="">Selecione o campo...</option>
                 <option value="marca">Marca</option>
                 <option value="modelo">Modelo</option>
                 <option value="familia">Família</option>
                 <option value="versao">Versão</option>
                 <option value="motorizacao">Motorização</option>
                 <option value="ano_inicio">Ano Início</option>
                 <option value="ano_fim">Ano Fim</option>
               </select>

               {bulkApplyValues.field === 'marca' ? (
                 <select 
                    className="h-8 rounded-md border border-input px-2 text-xs bg-background min-w-[150px]"
                    value={bulkApplyValues.marca || ""}
                    onChange={(e) => setBulkApplyValues({ ...bulkApplyValues, marca: e.target.value })}
                 >
                   <option value="">Selecione a marca...</option>
                   {marcas.map(m => <option key={m.id} value={m.nome}>{m.nome}</option>)}
                 </select>
               ) : bulkApplyValues.field === 'modelo' ? (
                  <Input 
                    placeholder="Nome do modelo..." 
                    className="h-8 w-40 text-xs" 
                    value={bulkApplyValues.modelo || ""}
                    onChange={(e) => setBulkApplyValues({ ...bulkApplyValues, modelo: e.target.value })}
                  />
               ) : bulkApplyValues.field ? (
                 <Input 
                   placeholder="Valor..." 
                   className="h-8 w-40 text-xs" 
                   value={bulkApplyValues[bulkApplyValues.field] || ""}
                   onChange={(e) => setBulkApplyValues({ ...bulkApplyValues, [bulkApplyValues.field]: e.target.value })}
                 />
               ) : null}

               {bulkApplyValues.field && (
                 <Button 
                   size="sm" 
                   variant="secondary" 
                   className="h-8 px-3 text-[10px] font-black uppercase"
                   onClick={() => applyToAllSelected(bulkApplyValues.field)}
                 >
                   <Check className="w-3 h-3 mr-1" /> Aplicar
                 </Button>
               )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsBulkEditModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleSaveBulk} disabled={isBulkUpdating || Object.keys(versoesEdits).length === 0}>
                {isBulkUpdating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Salvar {Object.keys(versoesEdits).length} Alterações
              </Button>
            </div>
          </div>

          {/* Grid de Edição */}
          <div className="flex-1 overflow-auto border rounded-xl bg-background shadow-inner">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 z-20 bg-slate-900 text-white shadow-md">
                <tr>
                  <th className="p-3 text-[10px] font-black uppercase tracking-widest border-r border-slate-800 w-12 text-center">#</th>
                  <th className="p-3 text-[10px] font-black uppercase tracking-widest border-r border-slate-800 min-w-[150px]">Marca</th>
                  <th className="p-3 text-[10px] font-black uppercase tracking-widest border-r border-slate-800 min-w-[200px]">Modelo</th>
                  <th className="p-3 text-[10px] font-black uppercase tracking-widest border-r border-slate-800 min-w-[180px]">Família</th>
                  <th className="p-3 text-[10px] font-black uppercase tracking-widest border-r border-slate-800 min-w-[180px]">Versão</th>
                  <th className="p-3 text-[10px] font-black uppercase tracking-widest border-r border-slate-800 min-w-[150px]">Motorização</th>
                  <th className="p-3 text-[10px] font-black uppercase tracking-widest border-r border-slate-800 w-24 text-center">Ano Ini</th>
                  <th className="p-3 text-[10px] font-black uppercase tracking-widest border-r border-slate-800 w-24 text-center">Ano Fim</th>
                  <th className="p-3 text-[10px] font-black uppercase tracking-widest min-w-[300px]">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {selectedVersoes.map((id, idx) => {
                  const v = versoes.find(item => item.id === id);
                  if (!v) return null;
                  
                  const getVal = (f: string) => versoesEdits[id]?.[f] !== undefined ? versoesEdits[id][f] : (v[f] || "");

                  return (
                    <tr key={id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-2 border-r text-xs text-center text-muted-foreground font-mono bg-muted/5">{idx + 1}</td>
                      
                      <td className="p-2 border-r">
                        <select 
                          className="w-full h-8 px-2 rounded border border-transparent hover:border-border focus:border-primary text-xs bg-transparent transition-all outline-none"
                          value={getVal('marca')}
                          onChange={(e) => updateBulkEdit(id, 'marca', e.target.value)}
                        >
                          {marcas.map(m => <option key={m.id} value={m.nome}>{m.nome}</option>)}
                        </select>
                      </td>
                      
                      <td className="p-2 border-r">
                        <input 
                          className="w-full h-8 px-2 rounded border border-transparent hover:border-border focus:border-primary text-xs bg-transparent transition-all outline-none"
                          value={getVal('modelo')}
                          onChange={(e) => updateBulkEdit(id, 'modelo', e.target.value)}
                        />
                      </td>

                      <td className="p-2 border-r">
                        <input 
                          className="w-full h-8 px-2 rounded border border-transparent hover:border-border focus:border-primary text-xs bg-transparent transition-all outline-none"
                          value={getVal('familia')}
                          placeholder="Família/Geração"
                          onChange={(e) => updateBulkEdit(id, 'familia', e.target.value)}
                        />
                      </td>

                      <td className="p-2 border-r">
                        <input 
                          className="w-full h-8 px-2 rounded border border-transparent hover:border-border focus:border-primary text-xs bg-transparent transition-all outline-none font-medium"
                          value={getVal('versao')}
                          placeholder="Versão"
                          onChange={(e) => updateBulkEdit(id, 'versao', e.target.value)}
                        />
                      </td>

                      <td className="p-2 border-r">
                        <input 
                          className="w-full h-8 px-2 rounded border border-transparent hover:border-border focus:border-primary text-xs bg-transparent transition-all outline-none text-blue-600 dark:text-blue-400"
                          value={getVal('motorizacao')}
                          placeholder="1.0, 1.6, Turbo..."
                          onChange={(e) => updateBulkEdit(id, 'motorizacao', e.target.value)}
                        />
                      </td>

                      <td className="p-2 border-r">
                        <input 
                          type="number"
                          className="w-full h-8 px-2 rounded border border-transparent hover:border-border focus:border-primary text-xs bg-transparent transition-all outline-none text-center font-mono"
                          value={getVal('ano_inicio')}
                          onChange={(e) => updateBulkEdit(id, 'ano_inicio', e.target.value)}
                        />
                      </td>

                      <td className="p-2 border-r">
                        <input 
                          type="number"
                          className="w-full h-8 px-2 rounded border border-transparent hover:border-border focus:border-primary text-xs bg-transparent transition-all outline-none text-center font-mono"
                          value={getVal('ano_fim')}
                          onChange={(e) => updateBulkEdit(id, 'ano_fim', e.target.value)}
                        />
                      </td>

                      <td className="p-2">
                        <input 
                          className="w-full h-8 px-2 rounded border border-transparent hover:border-border focus:border-primary text-xs bg-transparent transition-all outline-none italic text-muted-foreground"
                          value={getVal('detalhes')}
                          placeholder="Observações..."
                          onChange={(e) => updateBulkEdit(id, 'detalhes', e.target.value)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      {/* Modal Criação em Massa — Grade Excel */}
      <Modal 
        title="Criação de Versões em Massa" 
        isOpen={isBulkCreateModalOpen} 
        onClose={() => { setIsBulkCreateModalOpen(false); setBulkCreateRows([]); }} 
        className="max-w-[95vw] w-full h-[90vh]"
      >
        <div className="flex flex-col h-full space-y-4 overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-3 bg-muted/30 border p-3 rounded-xl">
            <Button size="sm" variant="secondary" className="gap-2 h-9 font-black uppercase text-xs" onClick={addBulkCreateRow}>
              <Plus className="w-3.5 h-3.5" /> Adicionar Linha
            </Button>
            <span className="text-xs text-muted-foreground">
              {bulkCreateRows.filter(r => r.marca && r.modelo).length} válidas de {bulkCreateRows.length} linhas
            </span>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" onClick={() => { setIsBulkCreateModalOpen(false); setBulkCreateRows([]); }}>Cancelar</Button>
              <Button 
                onClick={handleBulkCreate} 
                disabled={isBulkCreating || bulkCreateRows.filter(r => r.marca && r.modelo).length === 0}
                className="gap-2"
              >
                {isBulkCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Criar {bulkCreateRows.filter(r => r.marca && r.modelo).length} Versões
              </Button>
            </div>
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-auto border rounded-xl bg-background shadow-inner">
            <table className="w-full border-collapse text-left" style={{ minWidth: "1200px" }}>
              <thead className="sticky top-0 z-20 bg-slate-900 text-white shadow-md">
                <tr>
                  <th className="p-3 text-[10px] font-black uppercase tracking-widest border-r border-slate-800 w-12 text-center">#</th>
                  <th className="p-3 text-[10px] font-black uppercase tracking-widest border-r border-slate-800 min-w-[140px] text-red-400">Marca *</th>
                  <th className="p-3 text-[10px] font-black uppercase tracking-widest border-r border-slate-800 min-w-[160px] text-red-400">Modelo *</th>
                  <th className="p-3 text-[10px] font-black uppercase tracking-widest border-r border-slate-800 min-w-[150px]">Família</th>
                  <th className="p-3 text-[10px] font-black uppercase tracking-widest border-r border-slate-800 min-w-[160px]">Versão</th>
                  <th className="p-3 text-[10px] font-black uppercase tracking-widest border-r border-slate-800 min-w-[130px]">Motorização</th>
                  <th className="p-3 text-[10px] font-black uppercase tracking-widest border-r border-slate-800 w-20 text-center">Ano Ini</th>
                  <th className="p-3 text-[10px] font-black uppercase tracking-widest border-r border-slate-800 w-20 text-center">Ano Fim</th>
                  <th className="p-3 text-[10px] font-black uppercase tracking-widest border-r border-slate-800 flex-1">Detalhes</th>
                  <th className="p-3 text-[10px] font-black uppercase tracking-widest w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {bulkCreateRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-16 text-muted-foreground">
                      <div className="flex flex-col items-center gap-3">
                        <Plus className="w-10 h-10 text-muted-foreground/30" />
                        <p className="text-sm font-bold">Nenhuma linha adicionada</p>
                        <Button size="sm" variant="secondary" onClick={addBulkCreateRow} className="gap-2">
                          <Plus className="w-3.5 h-3.5" /> Adicionar primeira linha
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : bulkCreateRows.map((row, idx) => {
                  const isValid = row.marca && row.modelo;
                  return (
                    <tr key={idx} className={cn(
                      "hover:bg-muted/20 transition-colors",
                      isValid ? "" : "bg-red-50/30 dark:bg-red-950/10"
                    )}>
                      <td className="p-2 border-r text-[10px] text-center text-muted-foreground font-mono bg-muted/5">{idx + 1}</td>
                      
                      <td className="p-1 border-r">
                        <select
                          className={cn("w-full h-8 px-2 rounded border text-xs bg-transparent transition-all outline-none focus:border-primary",
                            row.marca ? "border-transparent hover:border-border" : "border-red-300 dark:border-red-700"
                          )}
                          value={row.marca}
                          onChange={e => updateBulkCreateRow(idx, 'marca', e.target.value)}
                        >
                          <option value="">Selecionar...</option>
                          {marcas.map(m => <option key={m.id} value={m.nome}>{m.nome}</option>)}
                        </select>
                      </td>

                      <td className="p-1 border-r">
                        <input
                          className={cn("w-full h-8 px-2 rounded border text-xs bg-transparent transition-all outline-none focus:border-primary",
                            row.modelo ? "border-transparent hover:border-border" : "border-red-300 dark:border-red-700"
                          )}
                          value={row.modelo}
                          placeholder="Ex: Gol"
                          onChange={e => updateBulkCreateRow(idx, 'modelo', e.target.value)}
                        />
                      </td>

                      {['familia', 'versao', 'motorizacao'].map(f => (
                        <td key={f} className="p-1 border-r">
                          <input
                            className="w-full h-8 px-2 rounded border border-transparent hover:border-border focus:border-primary text-xs bg-transparent transition-all outline-none"
                            value={(row as any)[f]}
                            placeholder={f === 'motorizacao' ? '1.0, 1.6...' : ''}
                            onChange={e => updateBulkCreateRow(idx, f, e.target.value)}
                          />
                        </td>
                      ))}

                      <td className="p-1 border-r">
                        <input type="number" className="w-full h-8 px-2 rounded border border-transparent hover:border-border focus:border-primary text-xs bg-transparent transition-all outline-none text-center font-mono"
                          value={row.ano_inicio} placeholder="2010" onChange={e => updateBulkCreateRow(idx, 'ano_inicio', e.target.value)} />
                      </td>
                      <td className="p-1 border-r">
                        <input type="number" className="w-full h-8 px-2 rounded border border-transparent hover:border-border focus:border-primary text-xs bg-transparent transition-all outline-none text-center font-mono"
                          value={row.ano_fim} placeholder="2015" onChange={e => updateBulkCreateRow(idx, 'ano_fim', e.target.value)} />
                      </td>
                      <td className="p-1 border-r">
                        <input className="w-full h-8 px-2 rounded border border-transparent hover:border-border focus:border-primary text-xs bg-transparent transition-all outline-none italic"
                          value={row.detalhes} placeholder="Observações..." onChange={e => updateBulkCreateRow(idx, 'detalhes', e.target.value)} />
                      </td>
                      <td className="p-1">
                        <Button variant="ghost" size="icon" className="w-7 h-7 text-destructive hover:bg-destructive/10" onClick={() => removeBulkCreateRow(idx)}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add row button at the bottom */}
          {bulkCreateRows.length > 0 && (
            <Button variant="outline" className="w-full gap-2 border-dashed" onClick={addBulkCreateRow}>
              <Plus className="w-4 h-4" /> Adicionar outra linha
            </Button>
          )}
        </div>
      </Modal>

      {/* Barra de Ações em Massa (Floating) */}
      {selectedVersoes.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-6 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300 border border-slate-700">
          <div className="flex items-center gap-3 pr-6 border-r border-slate-700">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center font-bold text-sm">
              {selectedVersoes.length}
            </div>
            <span className="text-sm font-bold uppercase tracking-widest text-slate-400">Selecionados</span>
          </div>
          
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              className="text-white hover:bg-white/10 gap-2 h-10 px-4 text-xs font-black uppercase tracking-widest"
              onClick={() => setIsBulkEditModalOpen(true)}
            >
              <Pencil className="w-4 h-4 text-blue-400" /> Editar
            </Button>
            
            <Button 
              variant="ghost" 
              className="text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 gap-2 h-10 px-4 text-xs font-black uppercase tracking-widest"
              onClick={handleBulkDelete}
              disabled={isBulkDeleting}
            >
              {isBulkDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Excluir
            </Button>
            
            <Button 
              variant="ghost" 
              className="text-slate-400 hover:bg-white/10 gap-2 h-10 px-4 text-xs font-black uppercase tracking-widest"
              onClick={() => setSelectedVersoes([])}
            >
              <X className="w-4 h-4" /> Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}