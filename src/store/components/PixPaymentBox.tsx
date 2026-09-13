import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { StorePayment } from '../types/store';

interface PixPaymentBoxProps {
  payment: StorePayment;
  onStatusChange?: (status: string) => void;
}

export function PixPaymentBox({ payment, onStatusChange }: PixPaymentBoxProps) {
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState<string>('');

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getTimeLeft = () => {
    if (!payment.pix_expiration_date) return '';
    
    const now = new Date();
    const expiration = new Date(payment.pix_expiration_date);
    const diff = expiration.getTime() - now.getTime();
    
    if (diff <= 0) return 'Expirado';
    
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Atualizar contador
  useState(() => {
    if (payment.status === 'pending' && payment.pix_expiration_date) {
      const timer = setInterval(() => {
        setTimeLeft(getTimeLeft());
      }, 1000);
      
      return () => clearInterval(timer);
    }
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Aguardando pagamento';
      case 'approved':
        return 'Pagamento aprovado';
      case 'rejected':
        return 'Pagamento rejeitado';
      case 'cancelled':
        return 'Pagamento cancelado';
      default:
        return status;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4" />;
      case 'approved':
        return <CheckCircle2 className="w-4 h-4" />;
      case 'rejected':
      case 'cancelled':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return null;
    }
  };

  if (payment.status === 'approved') {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <CheckCircle2 className="mx-auto h-16 w-16 text-green-500 mb-4" />
          <h3 className="text-xl font-semibold text-green-800 mb-2">Pagamento Aprovado!</h3>
          <p className="text-gray-600">Seu pagamento foi confirmado e estamos preparando seu pedido.</p>
        </CardContent>
      </Card>
    );
  }

  if (['rejected', 'cancelled'].includes(payment.status)) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <AlertCircle className="mx-auto h-16 w-16 text-red-500 mb-4" />
          <h3 className="text-xl font-semibold text-red-800 mb-2">Pagamento Não Realizado</h3>
          <p className="text-gray-600">
            {payment.status === 'rejected' 
              ? 'Seu pagamento foi rejeitado. Tente novamente.' 
              : 'Pagamento cancelado. Faça um novo pedido.'
            }
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Pague com Pix</span>
          <Badge className={getStatusColor(payment.status)}>
            {getStatusIcon(payment.status)}
            <span className="ml-1">{getStatusText(payment.status)}</span>
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* QR Code */}
        {payment.pix_qr_code_base64 && (
          <div className="text-center">
            <div className="bg-white border rounded-lg p-4 inline-block">
              <img
                src={`data:image/png;base64,${payment.pix_qr_code_base64}`}
                alt="QR Code PIX"
                className="w-48 h-48 mx-auto"
              />
            </div>
            <p className="text-sm text-gray-600 mt-2">Escaneie o QR Code acima</p>
          </div>
        )}

        {/* Código Copia e Cola */}
        {payment.pix_copy_paste && (
          <div>
            <p className="text-sm text-gray-600 mb-2">Ou copie o código Pix:</p>
            <div className="bg-gray-50 border rounded-lg p-3">
              <div className="font-mono text-sm break-all mb-3">
                {payment.pix_copy_paste}
              </div>
              <Button
                onClick={() => copyToClipboard(payment.pix_copy_paste!)}
                variant="outline"
                className="w-full gap-2"
              >
                {copied ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copiar código
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Tempo restante */}
        {payment.pix_expiration_date && (
          <div className="text-center">
            <p className="text-sm text-gray-600">
              Tempo restante: <span className="font-semibold">{getTimeLeft()}</span>
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Vencimento: {new Date(payment.pix_expiration_date).toLocaleString('pt-BR')}
            </p>
          </div>
        )}

        {/* Instruções */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-semibold text-blue-800 mb-2">Como pagar:</h4>
          <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
            <li>Abra o app do seu banco</li>
            <li>Escolha a opção Pix</li>
            <li>Escaneie o QR Code ou cole o código</li>
            <li>Confirme os dados e pague</li>
            <li>Aguarde a confirmação (até 1 minuto)</li>
          </ol>
        </div>

        {/* Valor */}
        <div className="text-center border-t pt-4">
          <p className="text-sm text-gray-600">Valor a pagar:</p>
          <p className="text-2xl font-bold text-primary">
            {new Intl.NumberFormat('pt-BR', {
              style: 'currency',
              currency: 'BRL'
            }).format(payment.amount)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
