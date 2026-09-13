import React, { useState } from 'react';
import { Bot, Sparkles, Loader2 } from 'lucide-react';

interface AiInputProps {
  onExtract: (text: string) => Promise<void>;
  isLoading: boolean;
}

export function AiInput({ onExtract, isLoading }: AiInputProps) {
  const [text, setText] = useState('');

  const handleExtract = async () => {
    if (!text.trim()) return;
    await onExtract(text);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all">
      <div className="p-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center text-sm font-medium text-gray-700">
          <Bot className="w-5 h-5 mr-2 text-blue-600" />
          Entrada Rápida IA
        </div>
      </div>
      <textarea
        className="w-full p-4 border-0 focus:ring-0 resize-none text-gray-700 text-base"
        rows={4}
        placeholder="Digite algo como:&#10;farol gol g5 mascara negra lado esquerdo 2009 2012"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={isLoading}
      />
      <div className="p-3 bg-gray-50 border-t border-gray-200 flex justify-end">
        <button
          onClick={handleExtract}
          disabled={isLoading || !text.trim()}
          className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processando IA...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              Extrair com IA
            </>
          )}
        </button>
      </div>
    </div>
  );
}
