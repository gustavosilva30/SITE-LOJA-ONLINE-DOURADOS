import React, { createContext, useContext, useState, useEffect } from 'react';
import { StoreCustomer } from '../types/store';

const TOKEN_STORAGE_KEY = 'store_customer_token';

interface StoreAuthContextType {
    customer: StoreCustomer | null;
    token: string | null;
    loading: boolean;
    login: (customer: StoreCustomer, token?: string | null) => void;
    logout: () => void;
    updateCustomer: (customer: StoreCustomer) => void;
    getAuthHeader: () => Record<string, string>;
}

const StoreAuthContext = createContext<StoreAuthContextType | undefined>(undefined);

export function StoreAuthProvider({ children }: { children: React.ReactNode }) {
    const [customer, setCustomer] = useState<StoreCustomer | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Tentar recuperar do localStorage
        const saved = localStorage.getItem('store_customer');
        if (saved) {
            try {
                setCustomer(JSON.parse(saved));
            } catch (e) {
                console.error('Erro ao ler cliente do storage', e);
            }
        }
        setToken(localStorage.getItem(TOKEN_STORAGE_KEY));
        setLoading(false);
    }, []);

    const login = (cust: StoreCustomer, accessToken?: string | null) => {
        setCustomer(cust);
        localStorage.setItem('store_customer', JSON.stringify(cust));
        if (accessToken) {
            setToken(accessToken);
            localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
        }
    };

    const logout = () => {
        setCustomer(null);
        setToken(null);
        localStorage.removeItem('store_customer');
        localStorage.removeItem(TOKEN_STORAGE_KEY);
    };

    const updateCustomer = (cust: StoreCustomer) => {
        setCustomer(cust);
        localStorage.setItem('store_customer', JSON.stringify(cust));
    };

    const getAuthHeader = (): Record<string, string> => {
        const t = token || localStorage.getItem(TOKEN_STORAGE_KEY);
        return t ? { Authorization: `Bearer ${t}` } : {};
    };

    return (
        <StoreAuthContext.Provider value={{ customer, token, loading, login, logout, updateCustomer, getAuthHeader }}>
            {children}
        </StoreAuthContext.Provider>
    );
}

export const useStoreAuth = () => {
    const context = useContext(StoreAuthContext);
    if (context === undefined) {
        throw new Error('useStoreAuth deve ser usado dentro de um StoreAuthProvider');
    }
    return context;
};
