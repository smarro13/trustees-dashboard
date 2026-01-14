import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function AgendaMenu() {
  const [open, setOpen] = useState(true);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    let lastScrollY = window.scrollY;
    let ticking = false;

    const handleScroll = () => {
      lastScrollY = window.scrollY;

      if (!ticking) {
        window.requestAnimationFrame(() => {
          // On mobile, close the menu when scrolling down past 350px
          if (window.innerWidth < 640 && lastScrollY > 350) {
            setIsScrolled(true);
            setOpen(false);
          } else if (lastScrollY <= 350) {
            setIsScrolled(false);
          }
          ticking = false;
        });

        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

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
        {[
          { label: '🙏 Apologies', href: '/agenda/apologies' },
          { label: '📝 Previous Minutes', href: '/agenda/minutes' },
          { label: '✅ Action Tracker', href: '/agenda/actions' },
          { label: '✉️ Correspondence', href: '/agenda/correspondence' },
          { label: '🛡️ Safeguarding', href: '/agenda/safeguarding' },
          { label: '⚖️ Conflicts of Interest', href: '/agenda/conflicts' },
          { label: '💰 Treasury Report', href: '/agenda/treasury' },
          { label: '🏢 Trading Company Report', href: '/agenda/trading' },
          { label: '🎉 Events Planning', href: '/agenda/events' },
          { label: '👥 Membership Report', href: '/agenda/membership' },
          { label: '🏉 Rugby Report', href: '/agenda/rugby' },
          { label: '📌 Matters Arising', href: '/agenda/matters-arising' },
          { label: '💬 AOB', href: '/agenda/aob' }
        ].map((item) => (
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
