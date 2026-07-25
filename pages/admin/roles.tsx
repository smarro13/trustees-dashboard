import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import ConfirmDialog from '../../components/ConfirmDialog';

type DashboardRole = 'admin' | 'management' | 'safeguarding' | 'commercial' | null;

type AdminUser = {
  id: string;
  email: string;
  role: DashboardRole;
  created_at?: string | null;
  last_sign_in_at?: string | null;
};

const roleOptions: Array<{ value: 'admin' | 'management' | 'safeguarding' | 'commercial' | 'none'; label: string }> = [
  { value: 'admin', label: 'Admin' },
  { value: 'management', label: 'Management' },
  { value: 'safeguarding', label: 'Safeguarding' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'none', label: 'No role' },
];

const roleBadgeClass = (role: DashboardRole) => {
  if (role === 'admin') return 'bg-purple-100 text-purple-800';
  if (role === 'management') return 'bg-blue-100 text-blue-800';
  if (role === 'safeguarding') return 'bg-emerald-100 text-emerald-800';
  if (role === 'commercial') return 'bg-amber-100 text-amber-800';
  return 'bg-zinc-100 text-zinc-700';
};

const roleLabel = (role: DashboardRole) => {
  if (!role) return 'No role';
  return role.charAt(0).toUpperCase() + role.slice(1);
};

export default function AdminRolesPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [draftRoles, setDraftRoles] = useState<Record<string, string>>({});
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [forcingSignOutId, setForcingSignOutId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'management' | 'safeguarding' | 'commercial' | 'none'>('management');
  const [addingUser, setAddingUser] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setError('You are not logged in.');
      setLoading(false);
      return;
    }

    const response = await fetch('/api/admin/users', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      setError(payload.error || 'Unable to load users.');
      setUsers([]);
      setLoading(false);
      return;
    }

    const loadedUsers = (payload.users || []) as AdminUser[];
    setUsers(loadedUsers);

    const nextDrafts: Record<string, string> = {};
    for (const user of loadedUsers) {
      nextDrafts[user.id] = user.role || 'none';
    }
    setDraftRoles(nextDrafts);

    setLoading(false);
  };

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id ?? null);
    };
    void init();
    loadUsers();
  }, []);

  useEffect(() => {
    if (!status) return;
    const timeout = window.setTimeout(() => setStatus(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [status]);

  const filteredUsers = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return users;
    return users.filter((user) =>
      user.email.toLowerCase().includes(value),
    );
  }, [users, query]);

  const saveRole = async (userId: string) => {
    const nextRole = draftRoles[userId] || 'none';
    setSavingUserId(userId);
    setStatus(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setStatus('You are not logged in.');
      setSavingUserId(null);
      return;
    }

    const response = await fetch('/api/admin/user-role', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ userId, role: nextRole }),
    });

    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      setStatus(payload.error || 'Unable to save role.');
      setSavingUserId(null);
      return;
    }

    setUsers((current) =>
      current.map((user) =>
        user.id === userId
          ? { ...user, role: (payload.user?.role as DashboardRole) || null }
          : user,
      ),
    );
    setStatus('Role updated successfully.');
    setSavingUserId(null);
  };

  const forceSignOut = async (userId: string) => {
    setForcingSignOutId(userId);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) { setStatus('Not logged in.'); setForcingSignOutId(null); return; }

    const response = await fetch('/api/admin/force-signout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId }),
    });
    const payload = await response.json();
    setForcingSignOutId(null);
    setStatus(response.ok && payload.ok ? 'User signed out from all devices.' : (payload.error || 'Failed to sign out user.'));
  };

  const deleteUser = async () => {
    if (!deleteTargetId) return;
    setDeleting(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) { setStatus('Not logged in.'); setDeleting(false); return; }

    const response = await fetch('/api/admin/delete-user', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId: deleteTargetId }),
    });
    const payload = await response.json();
    setDeleting(false);
    setDeleteTargetId(null);
    if (response.ok && payload.ok) {
      setUsers((current) => current.filter((u) => u.id !== deleteTargetId));
      setStatus('User deleted.');
    } else {
      setStatus(payload.error || 'Failed to delete user.');
    }
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!email) { setStatus('Please enter an email address.'); return; }
    setAddingUser(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) { setStatus('Not logged in.'); setAddingUser(false); return; }

    const response = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email, role: newRole }),
    });
    const payload = await response.json();
    setAddingUser(false);

    if (!response.ok || !payload.ok) {
      setStatus(payload.error || 'Failed to create user.');
      return;
    }

    const created = payload.user as AdminUser;
    setUsers((current) => [created, ...current]);
    setDraftRoles((current) => ({ ...current, [created.id]: created.role || 'none' }));
    setNewEmail('');
    setNewRole('management');
    setStatus(`User ${created.email} created. A password reset email has been sent.`);
  };
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-10">
        <header className="mb-8">
          <Link
            href="/"
            className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline"
          >
            ← Back to dashboard
          </Link>

          <h1 className="text-3xl font-extrabold text-zinc-900">Admin Role Manager</h1>
          <p className="mt-1 text-zinc-600">Set access roles for dashboard users.</p>
        </header>

        {status && (
          <section className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            {status}
          </section>
        )}

        {error ? (
          <section className="mb-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </section>
        ) : null}

        {/* ── Add user ─────────────────────────────────────────── */}
        <section className="mb-6 rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
          <div className="border-b border-zinc-200 px-6 py-4">
            <h2 className="text-xl font-semibold">Add new user</h2>
            <p className="mt-0.5 text-sm text-zinc-500">Creates the account and sends them a password-reset email so they can log in.</p>
          </div>
          <form onSubmit={createUser} className="flex flex-wrap items-end gap-3 px-6 py-5">
            <div className="flex-1 min-w-[220px]">
              <label className="mb-1 block text-sm font-medium text-zinc-700">Email address</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="user@aldwinians.co.uk"
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Role</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as typeof newRole)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
              >
                {roleOptions.filter((o) => o.value !== 'none').map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={addingUser || !newEmail.trim()}
              className="rounded-md bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {addingUser ? 'Creating…' : '+ Add user'}
            </button>
          </form>
        </section>

        {/* ── Users table ──────────────────────────────────────── */}
        <section className="mb-6 rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
          <div className="border-b border-zinc-200 px-6 py-4">
            <h2 className="text-xl font-semibold">Users</h2>
          </div>

          <div className="px-6 py-5">
            <div className="mb-4">
              <label htmlFor="role-search" className="mb-1 block text-sm font-medium text-zinc-700">
                Search by email
              </label>
              <input
                id="role-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2"
                placeholder="name@club.com"
              />
            </div>

            {loading ? (
              <p className="text-sm text-zinc-600">Loading users...</p>
            ) : filteredUsers.length === 0 ? (
              <p className="text-sm text-zinc-600">No users found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-zinc-200 text-sm">
                  <thead>
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-zinc-700">Email</th>
                      <th className="px-3 py-2 text-left font-semibold text-zinc-700">Current role</th>
                      <th className="px-3 py-2 text-left font-semibold text-zinc-700">New role</th>
                      <th className="px-3 py-2 text-left font-semibold text-zinc-700">Save</th>
                      <th className="px-3 py-2 text-left font-semibold text-zinc-700">Force sign out</th>
                      <th className="px-3 py-2 text-left font-semibold text-zinc-700">Delete</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {filteredUsers.map((user) => (
                      <tr key={user.id}>
                        <td className="px-3 py-2 text-zinc-800">{user.email || user.id}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-1 text-xs font-medium ${roleBadgeClass(user.role)}`}>
                            {roleLabel(user.role)}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={draftRoles[user.id] || 'none'}
                            onChange={(event) =>
                              setDraftRoles((current) => ({
                                ...current,
                                [user.id]: event.target.value,
                              }))
                            }
                            className="rounded-md border border-zinc-300 px-2 py-1"
                          >
                            {roleOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => saveRole(user.id)}
                            disabled={savingUserId === user.id}
                            className="rounded-md bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            {savingUserId === user.id ? 'Saving...' : 'Save role'}
                          </button>
                        </td>
                        <td className="px-3 py-2">
                          {user.id !== currentUserId ? (
                            <button
                              type="button"
                              onClick={() => forceSignOut(user.id)}
                              disabled={forcingSignOutId === user.id}
                              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                            >
                              {forcingSignOutId === user.id ? 'Signing out...' : '⏏ Sign out'}
                            </button>
                          ) : (
                            <span className="text-xs text-zinc-400">You</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {user.id !== currentUserId ? (
                            <button
                              type="button"
                              onClick={() => setDeleteTargetId(user.id)}
                              className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                            >
                              🗑 Delete
                            </button>
                          ) : (
                            <span className="text-xs text-zinc-400">You</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={!!deleteTargetId}
        title="Delete user?"
        description={`This will permanently delete the account for ${users.find((u) => u.id === deleteTargetId)?.email ?? 'this user'}. This cannot be undone.`}
        confirmLabel="Delete user"
        onConfirm={deleteUser}
        onCancel={() => setDeleteTargetId(null)}
        loading={deleting}
      />
    </main>
  );
}
