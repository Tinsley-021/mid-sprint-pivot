import { apiRequest } from './api.js';

export interface Branch {
  id: string;
  name: string;
  code: string;
  city: string | null;
  country: string | null;
  createdAt: string;
}

export function listBranches(accessToken: string | null) {
  return apiRequest<{ branches: Branch[] }>('/api/branches', { accessToken }).then((r) => r.branches);
}

export function createBranch(
  accessToken: string | null,
  input: { name: string; code: string; city?: string; country?: string },
) {
  return apiRequest<{ branch: Branch }>('/api/branches', { method: 'POST', accessToken, body: input }).then(
    (r) => r.branch,
  );
}
