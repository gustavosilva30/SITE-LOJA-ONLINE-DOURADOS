import { Button } from '@/components/ui/button';
import { Phone } from 'lucide-react';
import { track } from '../lib/analytics';

interface WhatsAppButtonProps {
  message?: string;
  variant?: 'default' | 'outline' | 'secondary';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
}

export function WhatsAppButton({
  message = 'Olá, tenho uma dúvida sobre a loja Dourados Auto Peças',
  variant = 'default',
  size = 'default',
  className = ''
}: WhatsAppButtonProps) {
  const openWhatsApp = () => {
    track('click', 'whatsapp_button');
    window.open(`https://wa.me/5567999100220?text=${encodeURIComponent(message)}`, '_blank');
  };

  const isOutline = variant === 'outline';

  return (
    <Button
      onClick={openWhatsApp}
      size={size}
      className={`gap-2 transition-all shadow-sm ${
        isOutline
          ? 'bg-white hover:bg-emerald-50 text-emerald-600 border-2 border-emerald-300 hover:border-emerald-500 font-bold hover:text-emerald-700'
          : 'bg-emerald-600 hover:bg-emerald-700 text-white font-bold'
      } ${className}`}
    >
      <Phone className="w-4 h-4" />
      Falar no WhatsApp
    </Button>
  );
}
