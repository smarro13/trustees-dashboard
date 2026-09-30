import Link from 'next/link';

// Clubhouse screen setup: for each screen, which inputs feed which platform,
// and what that shows on the screen. Edit SCREENS below when the setup changes.

type Area = 'lounge' | 'foyer' | 'function';

type Route = {
  inputs: string[];
  platform: string;
  outputs: string[];
};

type Screen = {
  name: string;
  location: string;
  area: Area;
  routes: Route[];
};

const SKY: Route = { inputs: ['Sky'], platform: 'Media Centre', outputs: ['Sky TV'] };
const SIGNAGE: Route = {
  inputs: ['Club Media', 'Event Media'],
  platform: 'CMS Signage (Firestick)',
  outputs: ['Club Info', 'Private Function Media'],
};

const SCREENS: Screen[] = [
  { name: 'Lounge TV 1', location: 'Eric Evans Lounge', area: 'lounge', routes: [SKY] },
  { name: 'Lounge TV 2', location: 'Eric Evans Lounge', area: 'lounge', routes: [SKY] },
  { name: 'Lounge TV 3 (100")', location: 'Eric Evans Lounge', area: 'lounge', routes: [SKY] },
  { name: 'Foyer TV', location: 'Foyer', area: 'foyer', routes: [SIGNAGE] },
  {
    name: 'Function Room TV (100")',
    location: 'Function Room',
    area: 'function',
    routes: [
      SKY,
      SIGNAGE,
      { inputs: ['Interactive Media'], platform: 'AirPlay / Mirror / HDMI', outputs: ['Presentations, media etc.'] },
    ],
  },
  { name: 'Function Room Bar TV', location: 'Function Room', area: 'function', routes: [SKY, SIGNAGE] },
  { name: 'Alan Moss Room TV', location: 'Alan Moss Room', area: 'function', routes: [SKY, SIGNAGE] },
];

const AREA_STYLES: Record<Area, { card: string; header: string; label: string }> = {
  lounge: { card: 'ring-sky-200', header: 'bg-sky-50 border-sky-200', label: 'Lounge' },
  foyer: { card: 'ring-orange-200', header: 'bg-orange-50 border-orange-200', label: 'Foyer' },
  function: { card: 'ring-emerald-200', header: 'bg-emerald-50 border-emerald-200', label: 'Function rooms' },
};

const PLATFORMS = [
  { name: 'Media Centre', description: 'Sky TV — live sport and channels.' },
  { name: 'CMS Signage (Firestick)', description: 'Club info slides, event media and private function content.' },
  { name: 'AirPlay / Mirror / HDMI', description: 'Guests show their own presentations or media.' },
];

function Chip({ children }: { children: string }) {
  return (
    <span className="inline-flex rounded-md bg-white px-2 py-1 text-sm text-zinc-800 ring-1 ring-zinc-200">
      {children}
    </span>
  );
}

function Arrow() {
  return (
    <span aria-hidden className="hidden text-zinc-400 sm:block">→</span>
  );
}

export default function MediaScreensPage() {
  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        <header className="mb-8">
          <Link href="/" className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline">
            ← Back to Dashboard
          </Link>
          <h1 className="text-3xl font-extrabold text-zinc-900">📺 Media Screens</h1>
          <p className="mt-1 text-zinc-600">
            What each clubhouse screen can show, and where its content comes from.
          </p>
        </header>

        <section className="mb-8 grid gap-3 sm:grid-cols-3">
          {PLATFORMS.map((p) => (
            <div key={p.name} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
              <p className="text-sm font-semibold text-zinc-900">{p.name}</p>
              <p className="mt-1 text-xs text-zinc-500">{p.description}</p>
            </div>
          ))}
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          {SCREENS.map((screen) => {
            const style = AREA_STYLES[screen.area];
            return (
              <section key={screen.name} className={`overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ${style.card}`}>
                <div className={`flex items-center justify-between gap-3 border-b px-5 py-3 ${style.header}`}>
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-900">{screen.name}</h2>
                    <p className="text-xs text-zinc-600">{screen.location}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200">
                    {style.label}
                  </span>
                </div>

                <div className="hidden grid-cols-[1fr_auto_1fr_auto_1fr] gap-3 px-5 pt-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 sm:grid">
                  <span>Input</span><span /><span>Platform</span><span /><span>Shows</span>
                </div>

                <ul className="divide-y divide-zinc-100">
                  {screen.routes.map((route) => (
                    <li
                      key={route.platform}
                      className="grid gap-2 px-5 py-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center sm:gap-3"
                    >
                      <div className="flex flex-wrap gap-1.5">
                        <span className="w-16 text-xs text-zinc-400 sm:hidden">Input</span>
                        {route.inputs.map((i) => <Chip key={i}>{i}</Chip>)}
                      </div>
                      <Arrow />
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="w-16 text-xs text-zinc-400 sm:hidden">Platform</span>
                        <span className="rounded-md bg-zinc-900 px-2 py-1 text-sm font-medium text-white">{route.platform}</span>
                      </div>
                      <Arrow />
                      <div className="flex flex-wrap gap-1.5">
                        <span className="w-16 text-xs text-zinc-400 sm:hidden">Shows</span>
                        {route.outputs.map((o) => <Chip key={o}>{o}</Chip>)}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
