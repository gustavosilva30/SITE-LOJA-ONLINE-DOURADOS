import React from 'react';
import { CheckCircle2 } from 'lucide-react';

interface MasterPreviewProps {
  generatedName: string;
}

export function MasterPreview({ generatedName }: MasterPreviewProps) {
  return (
    <div className="bg-slate-900 rounded-lg p-4 shadow-inner border border-slate-700 mt-4">
      <div className="flex items-center text-slate-400 text-xs uppercase tracking-wider font-semibold mb-2">
        <CheckCircle2 className="w-4 h-4 mr-1.5 text-green-400" />
        Preview Master (Tempo Real)
      </div>
      <div className="text-white font-mono text-lg font-bold break-words tracking-tight leading-tight">
        {generatedName || 'AGUARDANDO DADOS...'}
      </div>
    </div>
  );
}
