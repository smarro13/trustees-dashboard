import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';

type DashboardRole = 'admin' | 'management' | 'safeguarding' | 'commercial' | null;

const normalizeRole = (rawRole: unknown): DashboardRole => {
  if (typeof rawRole !== 'string') return null;

  const value = rawRole.trim().toLowerCase();
  if (!value) return null;

  if (value === 'admin') return 'admin';
  if (value === 'management' || value === 'mangement') return 'management';
  if (value === 'safeguarding') return 'safeguarding';
  if (value === 'commercial' || value === 'commerical') return 'commercial';

  return null;
};

const getEffectiveRole = (user: any): DashboardRole => {
  const appRole = normalizeRole(user?.app_metadata?.role);
  if (appRole) return appRole;

  const userRole = normalizeRole(user?.user_metadata?.role);
  if (userRole) return userRole;

  const appRoles = Array.isArray(user?.app_metadata?.roles) ? user.app_metadata.roles : [];
  const userRoles = Array.isArray(user?.user_metadata?.roles) ? user.user_metadata.roles : [];

  return normalizeRole(appRoles[0]) || normalizeRole(userRoles[0]);
};

export default function AgendaMenu() {
  const [open, setOpen] = useState(true);
  const [userRole, setUserRole] = useState<DashboardRole>(null);

  useEffect(() => {
    const loadRole = async () => {
      const { data } = await supabase.auth.getUser();
      setUserRole(getEffectiveRole(data.user));
    };

    void loadRole();
  }, []);

  const allItems = [
    { label: '🙏 Apologies', href: '/agenda/apologies' },
    { label: '🏛️ AGM', href: '/agenda/agm' },
    { label: '📝 Previous Minutes', href: '/agenda/minutes' },
    { label: '✅ Action Tracker', href: '/agenda/actions' },
    { label: '✉️ Correspondence', href: '/agenda/correspondence' },
    { label: '🛡️ Safeguarding', href: '/agenda/safeguarding' },
    { label: '⚖️ Conflicts of Interest', href: '/agenda/conflicts' },
    { label: '💰 Treasury Report', href: '/agenda/treasury' },
    { label: '🏢 Trading Company Report', href: '/agenda/trading' },
    { label: '📈 Commercial & Transformation', href: '/agenda/commercial-transformation' },
    { label: '🎉 Events Planning', href: '/agenda/events' },
    { label: '👥 Membership Report', href: '/agenda/membership' },
    { label: '🏉 Rugby Report', href: '/agenda/rugby' },
    { label: '🎰 Presidents Lotto', href: '/agenda/presidents-lotto' },
    { label: '📌 Matters Arising', href: '/agenda/matters-arising' },
    { label: '💬 AOB', href: '/agenda/aob' },
  ];

  const items = allItems.filter((item) => {
    if (!userRole || userRole === 'admin' || userRole === 'management') {
      return true;
    }

    if (userRole === 'safeguarding') {
      return item.href === '/agenda/safeguarding';
    }

    if (userRole === 'commercial') {
      return item.href === '/agenda/commercial-transformation';
    }

    return false;
  });

  if (userRole === 'admin') {
    items.splice(15, 0, { label: '🔐 Admin Roles', href: '/admin/roles' });
  }

  return (
    <aside
      className="mb-12 w-full sm:w-64 lg:w-72 shrink-0 sm:sticky sm:top-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4"
      aria-label="Agenda menu"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-zinc-800">Agenda</h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="agenda-nav"
          className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200"
        >
          {open ? 'Hide' : 'Show'} <span aria-hidden>{open ? '▾' : '▸'}</span>
        </button>
      </div>

      <nav
        id="agenda-nav"
        className={`flex flex-col gap-2 ${open ? '' : 'hidden'}`}
      >
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded-md border border-zinc-200 bg-zinc-50 px-4 py-2 text-left text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
          >
            <h3 className="text-base font-medium">{item.label}</h3>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
