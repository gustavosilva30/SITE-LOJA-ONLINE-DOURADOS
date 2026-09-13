import React, { useState } from 'react';
import { estoqueApi } from '@/lib/api';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Upload, Trash2, Eye } from 'lucide-react';

interface PublishMarketplaceButtonProps {
  productId: string;
  isPublished: boolean;
  productName: string;
  productPrice: number;
  productHasPhoto?: boolean;
  onPublishChange?: (published: boolean) => void;
}

export function PublishMarketplaceButton({
  productId,
  isPublished,
  productName,
  productPrice,
  productHasPhoto = true,
  onPublishChange
}: PublishMarketplaceButtonProps) {
  const [loading, setLoading] = useState(false);

  const publishToMarketplace = async () => {
    if (!(Number(productPrice) > 0)) {
      alert('❌ Produto com preço 0 não pode ser publicado automaticamente na loja online. Defina um valor de venda maior que 0.')
      return
    }
    if (!productHasPhoto) {
      alert('❌ Produto sem foto não pode ser publicado na loja online. Adicione pelo menos 1 foto.')
      return
    }
    setLoading(true);
    
    try {
      await estoqueApi.atualizarProduto(productId, {
        is_published: true,
        public_price: Number(productPrice),
      });
      alert(`✅ "${productName}" publicado no marketplace!`);
      if (onPublishChange) {
        onPublishChange(true);
      }
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error: unknown) {
      console.error('Erro ao publicar produto:', error);
      const msg = error instanceof Error ? error.message : String(error);
      alert(`❌ Falha ao publicar: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const unpublishFromMarketplace = async () => {
    setLoading(true);
    
    try {
      await estoqueApi.atualizarProduto(productId, {
        is_published: false,
      });
      alert(`📦 "${productName}" removido do marketplace`);
      if (onPublishChange) {
        onPublishChange(false);
      }
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error: unknown) {
      console.error('Erro ao remover produto:', error);
      const msg = error instanceof Error ? error.message : String(error);
      alert(`❌ Falha ao remover: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  if (isPublished) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
          <Eye className="w-3 h-3 mr-1" /> Publicado
        </Badge>
        <Button
          variant="outline"
          size="sm"
          onClick={unpublishFromMarketplace}
          disabled={loading}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="w-4 h-4 mr-1" />
          {loading ? '...' : 'Remover da loja'}
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="default"
      size="sm"
      onClick={publishToMarketplace}
      disabled={loading}
      className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
    >
      <Upload className="w-4 h-4 mr-1" />
      {loading ? 'Publicando...' : 'Publicar na loja'}
    </Button>
  );
}
