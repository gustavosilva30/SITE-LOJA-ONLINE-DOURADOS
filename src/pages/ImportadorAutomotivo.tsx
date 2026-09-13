import React, { useState } from 'react';
import { Upload, FileSpreadsheet, Settings, Play, Database, CheckCircle2, AlertTriangle, FileText } from 'lucide-react';

export default function ImportadorAutomotivo() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mappingMode, setMappingMode] = useState(false);
  const [missionMode, setMissionMode] = useState(false);
  const [smartColumns, setSmartColumns] = useState<any>({});
  
  // Fake tracking for UX
  const [progress, setProgress] = useState({
    total: 14500,
    processed: 0,
    success: 0,
    error: 0,
    speed: 0
  });

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped) processFileInitial(dropped);
  };

  const processFileInitial = (file: File) => {
    setFile(file);
    // Simular parse inicial e Mapeamento Inteligente
    setTimeout(() => {
      setSmartColumns({
        oem: 'COD_FORNECEDOR',
        descricao: 'NOME_PECA',
        fabricante: 'MARCA',
        preco_venda: 'VALOR_FINAL'
      });
      setMappingMode(true);
    }, 800);
  };

  const startMission = () => {
    setIsProcessing(true);
    setMappingMode(false);
    setMissionMode(true);

    // Simulate BullMQ chunk processing over time
    let currentProcessed = 0;
    const interval = setInterval(() => {
      currentProcessed += Math.floor(Math.random() * 200) + 50; // processa 50~250 itens por ciclo
      
      if (currentProcessed >= 14500) {
        currentProcessed = 14500;
        clearInterval(interval);
      }

      setProgress(prev => ({
        ...prev,
        processed: currentProcessed,
        success: Math.floor(currentProcessed * 0.98), // 98% sucesso
        error: Math.floor(currentProcessed * 0.02),
        speed: Math.floor(Math.random() * 100) + 150 // 150~250 itens/s
      }));
    }, 1000);
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen space-y-6">
      
      {/* Header Industrial */}
      <div className="flex justify-between items-end bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Database className="w-6 h-6 text-indigo-600" />
            Importador Automotivo Industrial
          </h1>
          <p className="text-sm text-gray-500 mt-1">100% Local • Parsing Independente • Integrado à Motor OEM</p>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 flex items-center gap-2">
            <Settings className="w-4 h-4" /> Templates
          </button>
        </div>
      </div>

      {!file && (
        <div 
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="border-2 border-dashed border-indigo-200 rounded-xl bg-white p-16 flex flex-col items-center justify-center cursor-pointer hover:bg-indigo-50/50 transition-colors"
        >
          <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mb-6">
            <Upload className="w-10 h-10 text-indigo-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-800 mb-2">Arraste seus catálogos para cá</h3>
          <p className="text-gray-500 mb-6 text-center max-w-md">
            Suportamos arquivos gigantes (XLSX, CSV, XML TecDoc e PDFs Estruturados). O processamento é todo feito localmente em background.
          </p>
          <div className="flex gap-4">
            <span className="flex items-center gap-1 text-sm font-medium text-green-700 bg-green-100 px-3 py-1 rounded-full"><FileSpreadsheet className="w-4 h-4" /> XLSX / CSV</span>
            <span className="flex items-center gap-1 text-sm font-medium text-orange-700 bg-orange-100 px-3 py-1 rounded-full"><FileText className="w-4 h-4" /> XML</span>
            <span className="flex items-center gap-1 text-sm font-medium text-red-700 bg-red-100 px-3 py-1 rounded-full"><FileText className="w-4 h-4" /> PDF Textual</span>
          </div>
        </div>
      )}

      {file && mappingMode && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100 bg-slate-50 flex justify-between items-center">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              Smart Mapping de Colunas Concluído
            </h3>
            <span className="text-sm font-medium text-indigo-600 bg-indigo-100 px-3 py-1 rounded-full">
              {file.name} (Aprox. 14.500 linhas)
            </span>
          </div>
          
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <p className="text-sm text-gray-600 bg-blue-50 p-3 rounded-lg border border-blue-100">
                Nosso motor heurístico leu os cabeçalhos do seu arquivo e mapeou automaticamente para os campos do sistema. Revise abaixo:
              </p>
              
              {Object.entries(smartColumns).map(([sysKey, fileCol]) => (
                <div key={sysKey} className="flex items-center gap-4">
                  <div className="w-1/3 text-right text-sm font-bold text-gray-700 uppercase">{sysKey}</div>
                  <div className="w-8 flex justify-center text-gray-400">→</div>
                  <select className="flex-1 px-3 py-2 text-sm border-gray-300 rounded-lg shadow-sm">
                    <option value={fileCol as string}>{fileCol as string}</option>
                  </select>
                </div>
              ))}
            </div>

            <div className="bg-gray-50 p-5 rounded-xl border border-gray-200 flex flex-col justify-center items-center text-center space-y-4">
              <AlertTriangle className="w-12 h-12 text-yellow-500" />
              <div>
                <h4 className="font-bold text-gray-800">Pronto para Enviar para Fila</h4>
                <p className="text-sm text-gray-500 mt-1">
                  Isso irá acordar o <strong>Motor OEM</strong> e <strong>Motor de Compatibilidade</strong> para tentar cruzar as 14.500 peças do arquivo. O progresso aparecerá no Dashboard.
                </p>
              </div>
              <button 
                onClick={startMission}
                className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-lg shadow flex items-center justify-center gap-2"
              >
                <Play className="w-5 h-5" /> Iniciar Processamento em Massa
              </button>
            </div>
          </div>
        </div>
      )}

      {missionMode && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100 bg-slate-900 flex justify-between items-center text-white">
            <h3 className="font-semibold flex items-center gap-2">
              <Play className="w-5 h-5 text-green-400" />
              Painel de Missão: Importação Industrial em Andamento
            </h3>
            <span className="text-sm font-medium bg-indigo-500/30 text-indigo-100 px-3 py-1 rounded-full">
              BullMQ Distributed Worker
            </span>
          </div>

          <div className="p-6">
            <div className="mb-2 flex justify-between text-sm font-medium text-gray-700">
              <span>Progresso Total: {((progress.processed / progress.total) * 100).toFixed(1)}%</span>
              <span>{progress.processed.toLocaleString()} / {progress.total.toLocaleString()} Linhas</span>
            </div>
            
            <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden shadow-inner">
              <div 
                className="bg-indigo-600 h-4 transition-all duration-500 ease-out" 
                style={{ width: `${(progress.processed / progress.total) * 100}%` }}
              ></div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-8">
              <div className="bg-green-50 rounded-lg p-4 border border-green-100 text-center">
                <p className="text-xs font-bold text-green-600 uppercase tracking-wider mb-1">Normalizados e Prontos</p>
                <p className="text-3xl font-black text-green-700">{progress.success.toLocaleString()}</p>
              </div>
              <div className="bg-red-50 rounded-lg p-4 border border-red-100 text-center">
                <p className="text-xs font-bold text-red-600 uppercase tracking-wider mb-1">Erros / Revisão</p>
                <p className="text-3xl font-black text-red-700">{progress.error.toLocaleString()}</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-100 text-center">
                <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">Velocidade</p>
                <p className="text-3xl font-black text-blue-700">{progress.speed} <span className="text-sm font-medium">linhas/s</span></p>
              </div>
              <div className="bg-purple-50 rounded-lg p-4 border border-purple-100 text-center">
                <p className="text-xs font-bold text-purple-600 uppercase tracking-wider mb-1">Tempo Restante (ETA)</p>
                <p className="text-3xl font-black text-purple-700">
                  {progress.processed === progress.total ? "Concluído" : `${Math.ceil((progress.total - progress.processed) / (progress.speed || 1))}s`}
                </p>
              </div>
            </div>
            
            {progress.processed === progress.total && (
              <div className="mt-6 flex justify-center">
                <button className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-lg shadow-lg flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" /> Ver Peças Importadas
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
