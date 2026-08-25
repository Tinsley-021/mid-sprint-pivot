import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { Field } from '../components/ui/Field.js';
import { Button } from '../components/ui/Button.js';
import { useAuth, ApiError } from '../lib/auth-context.js';
import { listMembers, inviteMember, updateMember, type Member, type MemberRole } from '../lib/team.js';

const ROLE_LABELS: Record<MemberRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  BRANCH_MANAGER: 'Branch Manager',
  INVENTORY_MANAGER: 'Inventory Manager',
  CASHIER: 'Cashier',
  SUPPORT_AGENT: 'Support Agent',
  ACCOUNTANT: 'Accountant',
};

const ASSIGNABLE_ROLES = Object.keys(ROLE_LABELS) as MemberRole[];

export default function Team() {
  const { user, accessToken } = useAuth();
  const canManage = user?.role === 'OWNER' || user?.role === 'ADMIN';
  const isOwner = user?.role === 'OWNER';

  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [form, setForm] = useState<{ name: string; email: string; role: MemberRole }>({
    name: '',
    email: '',
    role: 'CASHIER',
  });
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function refresh() {
    listMembers(accessToken)
      .then(setMembers)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your team.'));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    setInviteError(null);
    if (!form.name.trim() || !form.email.trim()) {
      setInviteError('Name and email are required.');
      return;
    }
    setInviting(true);
    try {
      await inviteMember(accessToken, form);
      setForm({ name: '', email: '', role: 'CASHIER' });
      setShowInvite(false);
      refresh();
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : 'Could not send the invite.');
    } finally {
      setInviting(false);
    }
  }

  async function onRoleChange(m: Member, role: MemberRole) {
    setBusyId(m.id);
    try {
      await updateMember(accessToken, m.id, { role });
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update that role.');
    } finally {
      setBusyId(null);
    }
  }

  async function onToggleStatus(m: Member) {
    setBusyId(m.id);
    try {
      await updateMember(accessToken, m.id, { status: m.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' });
      setConfirmingId(null);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update that member.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <Link to="/app" className="text-xs text-slate-soft hover:text-amber">
        ← Back
      </Link>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-amber">Team</p>
          <h1 className="mt-2 font-display text-2xl font-semibold text-paper">Manage your team</h1>
          <p className="mt-2 text-sm text-slate-soft">
            {canManage
              ? 'Invite teammates and control what they can do.'
              : "Everyone with access to your organization's RetailSync account."}
          </p>
        </div>
        {canManage && (
          <Button variant="outline" onClick={() => setShowInvite((v) => !v)}>
            <UserPlus size={16} /> Invite teammate
          </Button>
        )}
      </div>

      {showInvite && (
        <form onSubmit={onInvite} className="mt-6 rounded-xl border border-paper-dim/15 bg-ink-soft p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Full name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
            <Field
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
            />
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className="font-mono text-xs uppercase tracking-wider text-slate-soft">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as MemberRole }))}
                className="rounded-md border border-paper-dim/25 bg-ink px-3.5 py-2.5 text-paper outline-none focus:border-amber"
              >
                {ASSIGNABLE_ROLES.filter((r) => isOwner || (r !== 'OWNER' && r !== 'ADMIN')).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {inviteError && <p className="mt-3 text-sm text-red">{inviteError}</p>}
          <div className="mt-5 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setShowInvite(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={inviting}>
              {inviting ? 'Sending…' : 'Send invite'}
            </Button>
          </div>
        </form>
      )}

      {error && <p className="mt-6 text-sm text-red">{error}</p>}

      <div className="mt-8 divide-y divide-paper-dim/10 rounded-xl border border-paper-dim/15">
        {members === null ? (
          <p className="px-4 py-6 text-sm text-slate-soft">Loading…</p>
        ) : (
          members.map((m) => {
            const isSelf = m.id === user?.id;
            const targetIsProtected = (m.role === 'OWNER' || m.role === 'ADMIN') && !isOwner;
            return (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-paper">
                    {m.name} {isSelf && <span className="text-xs font-normal text-slate-soft">(you)</span>}
                  </p>
                  <p className="truncate text-xs text-slate-soft">
                    {m.email} · {m.emailVerified ? 'Verified' : 'Unverified'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {canManage && !isSelf && !targetIsProtected ? (
                    <select
                      value={m.role}
                      disabled={busyId === m.id}
                      onChange={(e) => onRoleChange(m, e.target.value as MemberRole)}
                      className="rounded-md border border-paper-dim/25 bg-ink px-2.5 py-1.5 text-xs text-paper outline-none focus:border-amber"
                    >
                      {ASSIGNABLE_ROLES.filter((r) => isOwner || (r !== 'OWNER' && r !== 'ADMIN')).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="rounded-full bg-paper-dim/10 px-2.5 py-1 text-xs font-semibold text-paper">
                      {ROLE_LABELS[m.role]}
                    </span>
                  )}

                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      m.status === 'ACTIVE' ? 'bg-green/10 text-green' : 'bg-red/10 text-red'
                    }`}
                  >
                    {m.status === 'ACTIVE' ? 'Active' : 'Suspended'}
                  </span>

                  {canManage && !isSelf && !targetIsProtected && (
                    <>
                      {confirmingId === m.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-soft">Are you sure?</span>
                          <button
                            onClick={() => onToggleStatus(m)}
                            disabled={busyId === m.id}
                            className="font-mono text-xs uppercase tracking-wider text-red hover:underline"
                          >
                            {m.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                          </button>
                          <button
                            onClick={() => setConfirmingId(null)}
                            className="font-mono text-xs uppercase tracking-wider text-slate-soft hover:text-paper"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmingId(m.id)}
                          className="font-mono text-xs uppercase tracking-wider text-slate-soft hover:text-amber"
                        >
                          {m.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
        {members?.length === 0 && <p className="px-4 py-6 text-sm text-slate-soft">No team members yet.</p>}
      </div>
    </div>
  );
}
