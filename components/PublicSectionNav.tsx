import Link from 'next/link';
import { useRouter } from 'next/router';

const NAV_ITEMS = [
  { href: '/public', label: 'Home' },
  { href: '/public/job-club', label: 'Job Club' },
  { href: '/public#raise-action', label: 'Raise an Action' },
  { href: '/public/actions', label: 'Actions' },
  { href: '/public/agm-questions', label: 'AGM Questions' },
  { href: '/public/minutes', label: 'Minutes' },
  { href: '/public/agm-minutes', label: 'AGM Minutes' },
  { href: '/public/padel-vote', label: 'Padel Vote' },
];

export default function PublicSectionNav() {
  const router = useRouter();

  return (
    <nav className="rounded-2xl border border-red-100 bg-white p-3 shadow-sm" aria-label="Members section navigation">
      <div className="flex flex-wrap gap-2">
        {NAV_ITEMS.map((item) => {
          const isHashLink = item.href.includes('#');
          const baseHref = isHashLink ? item.href.split('#')[0] : item.href;
          const isActive = !isHashLink && router.pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                'inline-flex items-center rounded-full px-4 py-2 text-sm font-medium transition',
                isActive
                  ? 'bg-red-700 text-white'
                  : 'border border-zinc-200 text-zinc-700 hover:border-red-200 hover:bg-red-50 hover:text-red-800',
              ].join(' ')}
              aria-current={isActive ? 'page' : undefined}
              prefetch={baseHref !== router.pathname}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}