import React, { useState } from 'react';
import { FilePdf, CircleNotch } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { Button } from './ui/button';
import { toast } from 'sonner';

// IMPORTANTE: nada de @react-pdf/renderer no topo. Ele só é importado
// dentro do handler do clique, mantendo o chunk inicial leve.

interface GenerateCatalogButtonProps {
  vehicleId: string;
  className?: string;
}

type CatalogData = { vehicle: any; products: any[] };

async function buildAndDownloadPdf(
  variant: 'grade' | 'tabela',
  data: CatalogData,
) {
  const [{ pdf }, { CatalogPDF }, { CatalogTablePDF }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('./CatalogPDF'),
    import('./CatalogTablePDF'),
  ]);

  const doc =
    variant === 'grade'
      ? <CatalogPDF vehicle={data.vehicle} products={data.products} />
      : <CatalogTablePDF vehicle={data.vehicle} products={data.products} />;

  const blob = await pdf(doc as any).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const tipo = variant === 'grade' ? 'Catalogo' : 'Planilha';
  a.download = `${tipo}_${data.vehicle.marca}_${data.vehicle.modelo}_${data.vehicle.codigo}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const GenerateCatalogButton: React.FC<GenerateCatalogButtonProps> = ({ vehicleId, className }) => {
  const [loadingFetch, setLoadingFetch] = useState(false);
  const [data, setData] = useState<CatalogData | null>(null);
  const [genVariant, setGenVariant] = useState<null | 'grade' | 'tabela'>(null);

  const fetchCatalogData = async () => {
    setLoadingFetch(true);
    try {
      const response = await api.get(`/api/catalog/${vehicleId}`);
      setData(response);
      toast.success('Dados carregados — escolha o formato do PDF.');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao buscar dados do catálogo');
    } finally {
      setLoadingFetch(false);
    }
  };

  const handleGenerate = async (variant: 'grade' | 'tabela') => {
    if (!data) return;
    setGenVariant(variant);
    try {
      await buildAndDownloadPdf(variant, data);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao gerar PDF');
    } finally {
      setGenVariant(null);
    }
  };

  if (loadingFetch) {
    return (
      <Button disabled className={`gap-2 bg-slate-100 text-slate-400 border-none ${className || ''}`}>
        <CircleNotch className="animate-spin" size={20} />
        Carregando...
      </Button>
    );
  }

  if (data) {
    return (
      <div className={`flex flex-col gap-2 ${className || ''}`}>
        <Button
          onClick={() => handleGenerate('grade')}
          disabled={genVariant !== null}
          className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl shadow-lg shadow-emerald-100"
        >
          {genVariant === 'grade' ? (
            <>
              <CircleNotch className="animate-spin" size={20} />
              Gerando PDF...
            </>
          ) : (
            <>
              <FilePdf size={20} weight="fill" />
              Baixar Catálogo (Grade)
            </>
          )}
        </Button>

        <Button
          onClick={() => handleGenerate('tabela')}
          disabled={genVariant !== null}
          className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl shadow-lg shadow-blue-100"
        >
          {genVariant === 'tabela' ? (
            <>
              <CircleNotch className="animate-spin" size={20} />
              Gerando Planilha...
            </>
          ) : (
            <>
              <FilePdf size={20} weight="fill" />
              Baixar Planilha (Tabela)
            </>
          )}
        </Button>
      </div>
    );
  }

  return (
    <Button
      onClick={fetchCatalogData}
      className={`gap-2 bg-slate-900 hover:bg-black text-white font-black rounded-xl shadow-lg ${className || ''}`}
    >
      <FilePdf size={20} />
      Gerar Catálogo
    </Button>
  );
};
