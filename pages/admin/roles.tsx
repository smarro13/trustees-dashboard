import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';

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

  return (
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
