import React, { useState, useEffect } from 'react';
import { mercadoLivreApi } from '@/lib/api';
import { Loader2, Search, Car, AlertTriangle, Copy, Check } from 'lucide-react';

interface MLVehicleNode {
  id: string;
  name: string;
}

interface MLVehicleTrim {
  product_id: string;
  name: string | null;
  marca: string | null;
  modelo: string | null;
  ano: string | null;
  versao: string | null;
  motorizacao: string | null;
  specs: Record<string, string>;
}

const SPEC_LABELS: Record<string, string> = {
  TRIM: 'Versão',
  FUEL_TYPE: 'Combustível',
  TRANSMISSION: 'Câmbio',
  DOORS: 'Portas',
  ENGINE: 'Motor',
  ENGINE_DISPLACEMENT: 'Cilindrada',
  VEHICLE_BODY_TYPE: 'Carroceria',
  TRACTION_CONTROL: 'Tração',
};

export default function MLVehicleExplorer() {
  const [brands, setBrands] = useState<MLVehicleNode[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState<MLVehicleNode | null>(null);

  const [models, setModels] = useState<MLVehicleNode[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [selectedModel, setSelectedModel] = useState<MLVehicleNode | null>(null);

  const [years, setYears] = useState<MLVehicleNode[]>([]);
  const [loadingYears, setLoadingYears] = useState(false);
  const [selectedYear, setSelectedYear] = useState<MLVehicleNode | null>(null);

  const [trims, setTrims] = useState<MLVehicleTrim[]>([]);
  const [loadingTrims, setLoadingTrims] = useState(false);
  const [selectedTrim, setSelectedTrim] = useState<MLVehicleTrim | null>(null);

  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    loadBrands();
  }, []);

  const loadBrands = async () => {
    try {
      setLoadingBrands(true);
      setErro(null);
      // api.get devolve o JSON já parseado (não é axios): usar a resposta direta.
      const res = await mercadoLivreApi.getMlVehicleBrands();
      setBrands(Array.isArray(res) ? res : []);
      if (!Array.isArray(res) || !res.length) {
        // Lista vazia com HTTP 200 é falha silenciosa do backend, não ausência de dados.
        setErro("O backend retornou zero marcas. Verifique os logs do serviço — a API do ML não deveria responder vazio aqui.");
      }
    } catch (e) {
      console.error("Erro ao carregar marcas ML", e);
      setErro("Não foi possível carregar as marcas do Mercado Livre.");
    } finally {
      setLoadingBrands(false);
    }
  };

  const loadModels = async (brandId: string) => {
    try {
      setLoadingModels(true);
      setErro(null);
      const res = await mercadoLivreApi.listarModelosVeiculos(brandId);
      setModels(Array.isArray(res) ? res : []);
      if (!Array.isArray(res) || !res.length) setErro("O Mercado Livre não retornou modelos para esta marca.");
    } catch (e) {
      console.error("Erro ao carregar modelos ML", e);
      setErro("Não foi possível carregar os modelos desta marca.");
    } finally {
      setLoadingModels(false);
    }
  };

  const loadYears = async (brandId: string, modelId: string) => {
    try {
      setLoadingYears(true);
      setErro(null);
      const res = await mercadoLivreApi.listarAnosVeiculos(brandId, modelId);
      setYears(Array.isArray(res) ? res : []);
    } catch (e) {
      console.error("Erro ao carregar anos ML", e);
      setErro("Não foi possível carregar os anos deste modelo.");
    } finally {
      setLoadingYears(false);
    }
  };

  const loadTrims = async (brandId: string, modelId: string, yearId: string) => {
    try {
      setLoadingTrims(true);
      setErro(null);
      const res = await mercadoLivreApi.listarVersoesVeiculos(brandId, modelId, yearId);
      setTrims(Array.isArray(res) ? res : []);
    } catch (e) {
      console.error("Erro ao carregar versões ML", e);
      setErro("Não foi possível carregar as versões deste ano.");
    } finally {
      setLoadingTrims(false);
    }
  };

  const resetFrom = (level: 'brand' | 'model' | 'year') => {
    if (level === 'brand') {
      setModels([]); setSelectedModel(null);
    }
    if (level === 'brand' || level === 'model') {
      setYears([]); setSelectedYear(null);
    }
    setTrims([]); setSelectedTrim(null);
  };

  const handleBrandChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const node = brands.find(b => b.id === e.target.value) || null;
    setSelectedBrand(node);
    resetFrom('brand');
    if (node) loadModels(node.id);
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const node = models.find(m => m.id === e.target.value) || null;
    setSelectedModel(node);
    resetFrom('model');
    if (node && selectedBrand) loadYears(selectedBrand.id, node.id);
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const node = years.find(y => y.id === e.target.value) || null;
    setSelectedYear(node);
    resetFrom('year');
    if (node && selectedBrand && selectedModel) loadTrims(selectedBrand.id, selectedModel.id, node.id);
  };

  const handleTrimChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedTrim(trims.find(t => t.product_id === e.target.value) || null);
  };

  const copiarProductId = async () => {
    if (!selectedTrim?.product_id) return;
    await navigator.clipboard.writeText(selectedTrim.product_id);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
            <Car className="w-6 h-6 text-blue-600" />
            Explorador de Veículos do Mercado Livre
        </h1>
        <p className="text-muted-foreground mt-1">
            Navegue pelo catálogo oficial de veículos do Mercado Livre (domínio MLB-CARS_AND_VANS).
            Cada versão tem um <strong>product_id</strong> — é ele que o ML usa para vincular a compatibilidade de uma peça.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow border p-6 space-y-6">

        {erro && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {erro}
            </div>
        )}

        {/* Cascade Dropdowns */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

            {/* Brands */}
            <div className="space-y-2">
                <label className="text-sm font-semibold">1. Marca {brands.length > 0 && <span className="text-gray-400 font-normal ml-1">({brands.length})</span>}</label>
                <div className="relative">
                    <select
                        className="w-full h-10 px-3 py-2 border rounded-md disabled:bg-gray-100 disabled:opacity-50 appearance-none bg-white"
                        value={selectedBrand?.id || ""}
                        onChange={handleBrandChange}
                        disabled={loadingBrands}
                    >
                        <option value="">Selecione uma marca...</option>
                        {brands.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>
                    {loadingBrands && <Loader2 className="w-4 h-4 absolute right-3 top-3 animate-spin text-gray-400" />}
                </div>
            </div>

            {/* Models */}
            <div className="space-y-2">
                <label className="text-sm font-semibold">2. Modelo {models.length > 0 && <span className="text-gray-400 font-normal ml-1">({models.length})</span>}</label>
                <div className="relative">
                    <select
                        className="w-full h-10 px-3 py-2 border rounded-md disabled:bg-gray-100 disabled:opacity-50 appearance-none bg-white"
                        value={selectedModel?.id || ""}
                        onChange={handleModelChange}
                        disabled={loadingModels || !selectedBrand}
                    >
                        <option value="">{loadingModels ? "Carregando modelos..." : "Selecione um modelo..."}</option>
                        {models.map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                    </select>
                    {loadingModels && <Loader2 className="w-4 h-4 absolute right-3 top-3 animate-spin text-gray-400" />}
                </div>
            </div>

            {/* Years */}
            <div className="space-y-2">
                <label className="text-sm font-semibold">3. Ano {years.length > 0 && <span className="text-gray-400 font-normal ml-1">({years.length})</span>}</label>
                <div className="relative">
                    <select
                        className="w-full h-10 px-3 py-2 border rounded-md disabled:bg-gray-100 disabled:opacity-50 appearance-none bg-white"
                        value={selectedYear?.id || ""}
                        onChange={handleYearChange}
                        disabled={loadingYears || !selectedModel}
                    >
                        <option value="">{loadingYears ? "Carregando anos..." : "Selecione o ano..."}</option>
                        {years.map(y => (
                            <option key={y.id} value={y.id}>{y.name}</option>
                        ))}
                    </select>
                    {loadingYears && <Loader2 className="w-4 h-4 absolute right-3 top-3 animate-spin text-gray-400" />}
                </div>
            </div>

            {/* Trims */}
            <div className="space-y-2">
                <label className="text-sm font-semibold">4. Versão {trims.length > 0 && <span className="text-gray-400 font-normal ml-1">({trims.length})</span>}</label>
                <div className="relative">
                    <select
                        className="w-full h-10 px-3 py-2 border rounded-md disabled:bg-gray-100 disabled:opacity-50 appearance-none bg-white"
                        value={selectedTrim?.product_id || ""}
                        onChange={handleTrimChange}
                        disabled={loadingTrims || !selectedYear}
                    >
                        <option value="">{loadingTrims ? "Carregando versões..." : "Selecione a versão..."}</option>
                        {trims.map(t => (
                            <option key={t.product_id} value={t.product_id}>{t.versao || t.name}</option>
                        ))}
                    </select>
                    {loadingTrims && <Loader2 className="w-4 h-4 absolute right-3 top-3 animate-spin text-gray-400" />}
                </div>
            </div>

        </div>

        {/* Results Panel */}
        <div className="mt-8 p-4 bg-gray-50 border rounded-lg">
            <h3 className="font-semibold text-lg flex items-center gap-2 mb-4">
                <Search className="w-5 h-5 text-gray-500" />
                Veículo Selecionado
            </h3>

            {!selectedBrand ? (
                <div className="text-gray-500 text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Selecione as opções acima para visualizar.
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div className="p-3 bg-white border rounded">
                        <div className="text-xs text-gray-500 uppercase font-bold">Marca</div>
                        <div className="font-semibold">{selectedBrand.name}</div>
                    </div>
                    <div className="p-3 bg-white border rounded opacity-90">
                        <div className="text-xs text-gray-500 uppercase font-bold">Modelo</div>
                        <div className="font-semibold">{selectedModel ? selectedModel.name : "—"}</div>
                    </div>
                    <div className="p-3 bg-white border rounded opacity-90">
                        <div className="text-xs text-gray-500 uppercase font-bold">Ano</div>
                        <div className="font-semibold">{selectedYear ? selectedYear.name : "—"}</div>
                    </div>
                    <div className="p-3 bg-white border rounded opacity-90">
                        <div className="text-xs text-gray-500 uppercase font-bold">Versão</div>
                        <div className="font-semibold">{selectedTrim ? (selectedTrim.versao || selectedTrim.name) : "—"}</div>
                    </div>
                </div>
            )}

            {selectedTrim && (
                <>
                    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 text-blue-900 rounded text-sm">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div>
                                <div className="text-xs uppercase font-bold text-blue-700">Product ID no catálogo do ML</div>
                                <div className="font-mono text-base font-semibold">{selectedTrim.product_id}</div>
                            </div>
                            <button
                                onClick={copiarProductId}
                                className="h-9 px-3 border border-blue-300 bg-white rounded flex items-center gap-2 text-sm hover:bg-blue-50"
                            >
                                {copiado ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                                {copiado ? "Copiado" : "Copiar"}
                            </button>
                        </div>
                        <p className="mt-2 text-xs">
                            É esse id que vai no envio de compatibilidade do anúncio
                            (<code>POST /items/&#123;item_id&#125;/compatibilities</code>).
                        </p>
                    </div>

                    <div className="mt-4">
                        <div className="text-xs text-gray-500 uppercase font-bold mb-2">Ficha do veículo</div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            {Object.entries(selectedTrim.specs || {}).map(([k, v]) => (
                                <div key={k} className="p-2 bg-white border rounded">
                                    <div className="text-xs text-gray-500">{SPEC_LABELS[k] || k}</div>
                                    <div className="font-medium">{v}</div>
                                </div>
                            ))}
                        </div>
                        {selectedTrim.name && (
                            <p className="mt-3 text-xs text-gray-500">
                                Nome no catálogo: <span className="font-medium text-gray-700">{selectedTrim.name}</span>
                            </p>
                        )}
                    </div>
                </>
            )}
        </div>

      </div>
    </div>
  );
}
