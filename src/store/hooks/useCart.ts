import { useState, useEffect } from 'react';
import { StoreCartItem } from '../types/store';

const CART_STORAGE_KEY = 'dourados_store_cart';

export function useCart() {
  const [items, setItems] = useState<StoreCartItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Carregar carrinho do localStorage
  useEffect(() => {
    loadCart();
  }, []);

  const loadCart = () => {
    try {
      const cart = localStorage.getItem(CART_STORAGE_KEY);
      if (cart) {
        setItems(JSON.parse(cart));
      }
    } catch (error) {
      console.error('Error loading cart:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveCart = (newItems: StoreCartItem[]) => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(newItems));
      setItems(newItems);
    } catch (error) {
      console.error('Error saving cart:', error);
    }
  };

  const addItem = (item: Omit<StoreCartItem, 'quantity'>) => {
    const existingIndex = items.findIndex(i => i.product_id === item.product_id);
    
    let newItems: StoreCartItem[];
    
    if (existingIndex > -1) {
      // Incrementar quantidade, se houver estoque
      newItems = items.map((i, index) => {
        if (index === existingIndex) {
          const nextQty = i.quantity + 1;
          if (nextQty > i.estoque_disponivel) {
            return i; // Ignora e não incrementa se exceder o estoque
          }
          return { ...i, quantity: nextQty };
        }
        return i;
      });
    } else {
      // Adicionar novo item se houver estoque
      if (item.estoque_disponivel <= 0) {
        return; // Não adiciona se estoque for 0 ou menor
      }
      newItems = [...items, { ...item, quantity: 1 }];
    }
    
    saveCart(newItems);
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(productId);
      return;
    }
    
    const newItems = items.map(item => {
      if (item.product_id === productId) {
        const validatedQty = Math.min(quantity, item.estoque_disponivel);
        return { ...item, quantity: validatedQty };
      }
      return item;
    });
    
    saveCart(newItems);
  };

  const removeItem = (productId: string) => {
    const newItems = items.filter(item => item.product_id !== productId);
    saveCart(newItems);
  };

  const clearCart = () => {
    localStorage.removeItem(CART_STORAGE_KEY);
    setItems([]);
  };

  const getTotalItems = () => {
    return items.reduce((sum, item) => sum + item.quantity, 0);
  };

  const getTotalPrice = () => {
    return items.reduce((sum, item) => sum + (item.public_price * item.quantity), 0);
  };

  const isInCart = (productId: string) => {
    return items.some(item => item.product_id === productId);
  };

  const getItemQuantity = (productId: string) => {
    const item = items.find(i => i.product_id === productId);
    return item?.quantity || 0;
  };

  return {
    items,
    loading,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
    getTotalItems,
    getTotalPrice,
    isInCart,
    getItemQuantity,
    itemCount: getTotalItems(),
    total: getTotalPrice()
  };
}
