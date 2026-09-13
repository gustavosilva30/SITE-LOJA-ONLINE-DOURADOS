import { useState, useEffect, useCallback } from 'react';
import { getApiBaseUrl } from '@/lib/apiBase';
import { StoreOrderStatusResponse } from '../types/store';

export function useOrderStatus(orderId: string, token: string) {
  const [orderData, setOrderData] = useState<StoreOrderStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchOrderStatus = useCallback(async () => {
    try {
      setError(null);
      
      const response = await fetch(
        `${getApiBaseUrl()}/api/store/orders/${orderId}?token=${token}`
      );

      if (!response.ok) {
        if (response.status === 404) {
          setError('Pedido não encontrado ou token inválido');
        } else {
          setError('Erro ao carregar status do pedido');
        }
        return;
      }

      const data = await response.json();
      setOrderData(data);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error fetching order status:', error);
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  }, [orderId, token]);

  // Buscar inicial
  useEffect(() => {
    if (orderId && token) {
      fetchOrderStatus();
    }
  }, [fetchOrderStatus]);

  // Polling a cada 10 segundos para pedidos pendentes
  useEffect(() => {
    if (!orderData) return;

    const isPending = orderData.order.status === 'pending' || 
                     orderData.order.payment_status === 'pending';

    if (!isPending) return;

    const interval = setInterval(() => {
      fetchOrderStatus();
    }, 10000); // 10 segundos

    return () => clearInterval(interval);
  }, [orderData, fetchOrderStatus]);

  const refresh = useCallback(() => {
    setLoading(true);
    fetchOrderStatus();
  }, [fetchOrderStatus]);

  const isPaid = orderData?.order.payment_status === 'approved';
  const isCompleted = orderData?.order.status === 'delivered';
  const isCanceled = orderData?.order.status === 'canceled';

  return {
    orderData,
    loading,
    error,
    lastUpdate,
    refresh,
    isPaid,
    isCompleted,
    isCanceled
  };
}
