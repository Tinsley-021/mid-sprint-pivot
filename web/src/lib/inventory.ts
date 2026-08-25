import { apiRequest } from './api.js';

export interface ProductStock {
  id: string;
  productId: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  branchId: string;
  branchName: string;
  quantity: number;
  reserved: number;
  reorderLevel: number;
  status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
}

export interface Order {
  id: string;
  customer: string;
  branch: string;
  amount: number;
  status: string;
  paymentStatus: string;
  createdAt: string;
  items: number;
}

export interface StockAlert {
  id: string;
  product: string;
  branch: string;
  quantity: number;
  reorderLevel: number;
  severity: 'low' | 'critical';
}

export interface AvailabilityMatch {
  id: string;
  productId: string;
  name: string;
  sku: string;
  branch: string;
  branchId: string;
  availableQuantity: number;
  inStock: boolean;
}

export function listProducts(accessToken: string | null) {
  return apiRequest<{ items: ProductStock[] }>('/api/products', { accessToken }).then((r) => r.items);
}

export function createProduct(
  accessToken: string | null,
  input: {
    name: string;
    sku: string;
    category?: string;
    costPrice?: number;
    sellingPrice: number;
    reorderLevel?: number;
    branchId: string;
    quantityOnHand?: number;
  },
) {
  return apiRequest('/api/products', { method: 'POST', accessToken, body: input });
}

export function listOrders(accessToken: string | null) {
  return apiRequest<{ items: Order[] }>('/api/orders', { accessToken }).then((r) => r.items);
}

export function createOrder(
  accessToken: string | null,
  input: { productId: string; branchId: string; customer?: string; quantity?: number },
) {
  return apiRequest<{ order: Order; payment: { reference: string; amount: number; status: string; message: string } }>(
    '/api/orders',
    { method: 'POST', accessToken, body: input },
  );
}

export function listAlerts(accessToken: string | null) {
  return apiRequest<{ items: StockAlert[] }>('/api/alerts', { accessToken }).then((r) => r.items);
}

export function searchAvailability(accessToken: string | null, query: string) {
  return apiRequest<{ query: string; found: boolean; products: AvailabilityMatch[] }>(
    `/api/availability?query=${encodeURIComponent(query)}`,
    { accessToken },
  );
}
