import React from 'react';
import { Car, CheckCircle, AlertTriangle, HelpCircle, XCircle } from 'lucide-react';
import { PecaCompatibilidadeLike } from '../../lib/nomePecaMaster';

interface CompatibilidadeAvancada {
  veiculoAlvo: {
    marca: string;
    modelo: string;
    familia?: string;
    ano_inicio?: number;
    ano_fim?: number;
  };
  score: number;
  nivel: 'Exata' | 'Alta' | 'Provável' | 'Manual';
  justificativa: string[];
}

interface CompatibilidadePreviewProps {
  compatibilidades: PecaCompatibilidadeLike[];
  avancadas?: CompatibilidadeAvancada[];
}

export function CompatibilidadePreview({ compatibilidades, avancadas }: CompatibilidadePreviewProps) {
  if ((!compatibilidades || compatibilidades.length === 0) && (!avancadas || avancadas.length === 0)) {
    return (
      <div className="text-sm text-gray-500 italic">
        Nenhuma compatibilidade detectada pela IA.
      </div>
    );
  }

  // Se tivermos as avançadas, renderizamos por grupos
  if (avancadas && avancadas.length > 0) {
    const grupos = {
      'Exata': avancadas.filter(a => a.nivel === 'Exata'),
      'Alta': avancadas.filter(a => a.nivel === 'Alta'),
      'Provável': avancadas.filter(a => a.nivel === 'Provável'),
      'Manual': avancadas.filter(a => a.nivel === 'Manual'),
    };

    const getColor = (nivel: string) => {
      switch (nivel) {
        case 'Exata': return 'bg-green-50 text-green-700 border-green-200';
        case 'Alta': return 'bg-blue-50 text-blue-700 border-blue-200';
        case 'Provável': return 'bg-yellow-50 text-yellow-700 border-yellow-200';
        default: return 'bg-orange-50 text-orange-700 border-orange-200';
      }
    };

    const getIcon = (nivel: string) => {
      switch (nivel) {
        case 'Exata': return <CheckCircle className="w-4 h-4 mr-1.5 opacity-70" />;
        case 'Alta': return <Car className="w-4 h-4 mr-1.5 opacity-70" />;
        case 'Provável': return <AlertTriangle className="w-4 h-4 mr-1.5 opacity-70" />;
        default: return <HelpCircle className="w-4 h-4 mr-1.5 opacity-70" />;
      }
    };

    return (
      <div className="space-y-4">
        {Object.entries(grupos).map(([nivel, items]) => {
          if (items.length === 0) return null;
          return (
            <div key={nivel} className="space-y-2">
              <h4 className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1">
                {nivel} ({items.length})
              </h4>
              <div className="flex flex-wrap gap-2">
                {items.map((item, idx) => {
                  const v = item.veiculoAlvo;
                  const title = [v.marca, v.modelo, v.familia].filter(Boolean).join(' ');
                  const years = v.ano_inicio || v.ano_fim ? `(${v.ano_inicio || '?'}/${v.ano_fim || '?'})` : '';
                  return (
                    <div
                      key={idx}
                      className={`inline-flex flex-col px-3 py-1.5 rounded-md text-sm font-medium border cursor-pointer hover:shadow-sm transition-shadow ${getColor(nivel)}`}
                      title={item.justificativa.join(' | ')}
                    >
                      <div className="flex items-center">
                        {getIcon(nivel)}
                        <span>{title} {years}</span>
                      </div>
                      <div className="text-[10px] font-normal opacity-70 mt-0.5 ml-5">
                        Score: {item.score}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Fallback para o visual antigo (compatibilidades raw da IA)
  return (
    <div className="flex flex-wrap gap-2">
      {compatibilidades.map((c, idx) => {
        const title = [c.marca, c.modelo, c.familia].filter(Boolean).join(' ');
        const years = c.ano ? `(${c.ano})` : '';

        return (
          <span
            key={idx}
            className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-50 text-gray-700 border border-gray-200"
          >
            <Car className="w-4 h-4 mr-1.5 opacity-70" />
            {title} {years}
          </span>
        );
      })}
    </div>
  );
}
