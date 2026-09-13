// Tipos para a loja online (módulo isolado)

export interface StoreProduct {
  id: string;
  sku: string;
  nome: string;
  descricao: string | null;
  public_price: number;
  estoque_disponivel: number;
  slug: string | null;
  marca: string | null;
  categoria_nome: string | null;
  imagem_url: string | null;
  imagem_urls: string[] | null;
  /** quadrado | retrato | paisagem — moldura de exibição */
  imagem_orientacao?: string | null;
  created_at: string;
  localizacao?: string | null;
  modelo?: string | null;
  ano_inicio?: number | null;
  ano_fim?: number | null;
  versao?: string | null;
  informacoes_adicionais?: string | null;
  condicao_produto?: string | null;
  images?: StoreProductImage[];
  compatibilities?: StoreCompatibility[];
}

export interface StoreProductImage {
  id: string;
  storage_path: string;
  is_primary: boolean;
  display_order: number;
}

export interface StoreCompatibility {
  marca: string;
  modelo: string;
  ano: string;
  versao: string;
  motorizacao?: string | null;
  familia?: string | null;
}

export interface StoreCategory {
  id: string;
  nome: string;
  descricao: string | null;
  imagem_url: string | null;
  produtos_count: number;
}

export interface StoreCartItem {
  product_id: string;
  slug: string | null;
  nome: string;
  sku: string;
  public_price: number;
  imagem_url: string | null;
  quantity: number;
  estoque_disponivel: number;
  // Dimensões para cálculo correto de frete (Melhor Envio)
  peso_g?: number | null;
  altura_cm?: number | null;
  largura_cm?: number | null;
  comprimento_cm?: number | null;
}

export interface StoreOrder {
  id: string;
  order_number: number;
  status: string;
  payment_status: string;
  total: number;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  customer_cpf: string | null;
  customer_id?: string;
  delivery_method: string;
  customer_zipcode?: string;
  customer_address?: string;
  customer_number?: string;
  customer_neighborhood?: string;
  customer_complement?: string;
  customer_city?: string;
  customer_state?: string;
  payment_method?: string;
  created_at: string;
  updated_at: string;
  public_token?: string;
}

export interface StoreOrderItem {
  product_id: string;
  quantity: number;
  price_snapshot: number;
  name_snapshot: string;
  sku_snapshot: string;
}

export interface StorePayment {
  id: string;
  provider: string;
  provider_payment_id: string;
  status: string;
  amount: number;
  pix_qr_code_base64: string | null;
  pix_qr_code: string | null;
  pix_copy_paste: string | null;
  pix_expiration_date: string | null;
  payload: any;
  created_at: string;
}

export interface StoreOrderData {
  items: StoreCartItem[];
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  customer_cpf?: string;
  delivery_method?: 'RETIRADA' | 'ENTREGA';
}

export interface StoreCheckoutResponse {
  order: StoreOrder;
  items: StoreOrderItem[];
}

export interface StorePaymentResponse {
  payment: StorePayment;
  qr_code: string | null;
  qr_code_base64: string | null;
  copy_paste: string | null;
  expiration_date: string | null;
}

export interface StoreOrderStatusResponse {
  order: StoreOrder;
  items: StoreOrderItem[];
  payment: StorePayment | null;
}

// Tipos para filtros e paginação
export interface StoreProductsFilters {
  search?: string;
  category?: string;
  brand?: string;
  sortBy?: 'nome' | 'public_price' | 'created_at' | 'estoque_disponivel';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface StoreProductsResponse {
  products: StoreProduct[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// Status do pedido
export type StoreOrderStatus = 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'canceled';
export type StorePaymentStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'refunded';

// Método de entrega
export type StoreDeliveryMethod = 'RETIRADA' | 'FRETE_A_COMBINAR';

// Tipos para Clientes
export interface StoreCustomer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  cpf: string | null;
}

export interface StoreCustomerAddress {
  id: string;
  customer_id: string;
  zipcode: string;
  address: string;
  number: string;
  neighborhood: string;
  complement: string | null;
  city: string;
  state: string;
  is_default: boolean;
  label: string | null;
}
