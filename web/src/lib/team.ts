import { apiRequest } from './api.js';

export type MemberRole =
  | 'OWNER'
  | 'ADMIN'
  | 'BRANCH_MANAGER'
  | 'INVENTORY_MANAGER'
  | 'CASHIER'
  | 'SUPPORT_AGENT'
  | 'ACCOUNTANT';

export interface Member {
  id: string;
  email: string;
  name: string;
  role: MemberRole;
  status: 'ACTIVE' | 'SUSPENDED';
  emailVerified: boolean;
  createdAt: string;
}

export function listMembers(accessToken: string | null) {
  return apiRequest<{ members: Member[] }>('/api/team', { accessToken }).then((r) => r.members);
}

export function inviteMember(accessToken: string | null, input: { email: string; name: string; role: MemberRole }) {
  return apiRequest<{ member: Member }>('/api/team/invite', { method: 'POST', accessToken, body: input }).then(
    (r) => r.member,
  );
}

export function updateMember(
  accessToken: string | null,
  userId: string,
  input: { role?: MemberRole; status?: 'ACTIVE' | 'SUSPENDED' },
) {
  return apiRequest<{ member: Member }>(`/api/team/${userId}`, { method: 'PATCH', accessToken, body: input }).then(
    (r) => r.member,
  );
}
