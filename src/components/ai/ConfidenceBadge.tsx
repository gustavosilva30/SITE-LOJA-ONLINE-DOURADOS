import React from 'react';
import { ShieldAlert, ShieldCheck, Shield } from 'lucide-react';

interface ConfidenceBadgeProps {
  score: number; // 0 to 1
}

export function ConfidenceBadge({ score }: ConfidenceBadgeProps) {
  let colorClass = 'bg-red-100 text-red-800 border-red-200';
  let Icon = ShieldAlert;
  let label = 'Baixa Confiança';

  if (score >= 0.8) {
    colorClass = 'bg-green-100 text-green-800 border-green-200';
    Icon = ShieldCheck;
    label = 'Alta Confiança';
  } else if (score >= 0.5) {
    colorClass = 'bg-yellow-100 text-yellow-800 border-yellow-200';
    Icon = Shield;
    label = 'Confiança Média';
  }

  return (
    <div className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${colorClass}`}>
      <Icon className="w-3.5 h-3.5 mr-1" />
      {label} ({(score * 100).toFixed(0)}%)
    </div>
  );
}
