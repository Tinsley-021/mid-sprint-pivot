import { apiRequest } from './api.js';

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
  createdAt: string;
}

export function listCustomers(accessToken: string | null) {
  return apiRequest<{ customers: Customer[] }>('/api/customers', { accessToken }).then((r) => r.customers);
}
