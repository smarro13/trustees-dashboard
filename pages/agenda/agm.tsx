import Link from 'next/link';
import { useRouter } from 'next/router';

const AGM_AGENDA = [
  {
    title: 'AGM Start',
    detail: '8:00pm',
  },
  {
    title: 'Minutes from Previous AGM',
    detail: 'Review and approve the minutes from the previous Annual General Meeting.',
  },
  {
    title: 'Chair\'s Welcome',
    detail: 'Opening remarks and overview from the chair.',
  },
  {
    title: 'Financial Update',
    detail: 'Annual financial summary and questions from members.',
  },
  {
    title: 'Rugby Update',
    detail: 'Split updates covering Senior Mens, Ladies, Mini, and Juniors.',
    subItems: ['Senior Mens', 'Ladies', 'Mini', 'Juniors'],
  },
  {
    title: 'Election of Officers',
    detail: 'Trustee elections and confirmation of officer positions.',
  },
  {
    title: 'Club President',
    detail: 'President update or appointment item.',
  },
  {
    title: 'AOB',
    detail: 'Any other business raised by members.',
  },
];

const AGM_SUPPORTING_LINKS = [
  {
    title: 'AGM Minutes',
    description: 'Upload AGM minutes and review previously uploaded AGM minutes.',
    href: '/agenda/agm-minutes',
  },
  {
    title: 'AGM Questions',
    description: 'Static AGM questions page, ready to be updated in code later.',
    href: '/agenda/agm-questions',
  },
  {
    title: 'Previous Minutes',
    description: 'Open the approved minutes used for the AGM minutes item.',
    href: '/agenda/minutes',
  },
  {
    title: 'Treasury Report',
    description: 'Use the latest treasury figures for the financial update.',
    href: '/agenda/treasury',
  },
  {
    title: 'Rugby Report',
    description: 'Review rugby updates before the AGM discussion.',
    href: '/agenda/rugby',
  },
  {
    title: 'AOB',
    description: 'Check any items already logged for any other business.',
    href: '/agenda/aob',
  },
];

export default function AGMPage() {
  const router = useRouter();
  const meetingId = typeof router.query.meetingId === 'string' ? router.query.meetingId : null;

  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        <header className="mb-8">
          <Link
            href="/"
            className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline"
          >
            ← Back to dashboard
          </Link>

          <h1 className="text-3xl font-extrabold text-zinc-900">
            Annual General Meeting (AGM)
          </h1>
          <p className="mt-1 max-w-3xl text-zinc-600">
            AGM agenda and supporting links for the annual meeting. This agenda is static and is only updated in code.
          </p>
        </header>

        {meetingId && (
          <section className="mb-8 rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
            This AGM page was opened from a meeting record. Use the links below to gather the supporting reports and
            documents for meeting ID {meetingId}.
          </section>
        )}

        <section className="mb-8 rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
          <div className="border-b border-zinc-200 px-6 py-4">
            <h2 className="text-xl font-semibold text-zinc-900">AGM agenda</h2>
          </div>
          <div className="px-6 py-6">
            <ol className="space-y-4 text-sm text-zinc-700">
              {AGM_AGENDA.map((item, index) => (
                <li key={item.title} className="flex gap-3">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-50 text-xs font-semibold text-red-700 ring-1 ring-red-100">
                    {index + 1}
                  </span>
                  <div>
                    <p className="font-semibold text-zinc-900">{item.title}</p>
                    <p className="mt-1 text-zinc-600">{item.detail}</p>
                    {item.subItems && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {item.subItems.map((subItem) => (
                          <span
                            key={subItem}
                            className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700"
                          >
                            {subItem}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mb-8 rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
          <div className="border-b border-zinc-200 px-6 py-4">
            <h2 className="text-xl font-semibold text-zinc-900">Supporting AGM pages</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Quick links to AGM-specific pages and the sections that support this agenda.
            </p>
          </div>
          <div className="grid gap-4 px-6 py-6 md:grid-cols-2 xl:grid-cols-3">
            {AGM_SUPPORTING_LINKS.map((resource) => (
              <Link
                key={resource.href}
                href={resource.href}
                className="rounded-lg border border-zinc-200 p-4 transition-colors hover:border-red-200 hover:bg-red-50"
              >
                <h3 className="text-base font-semibold text-zinc-900">{resource.title}</h3>
                <p className="mt-1 text-sm text-zinc-600">{resource.description}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
          <div className="border-b border-zinc-200 px-6 py-4">
            <h2 className="text-xl font-semibold text-zinc-900">Meeting notes</h2>
          </div>
          <div className="grid gap-4 px-6 py-6 md:grid-cols-2">
            <div className="rounded-lg border border-zinc-200 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Timing</h3>
              <p className="mt-2 text-sm text-zinc-700">
                AGM start is set to 8:00pm.
              </p>
            </div>
            <div className="rounded-lg border border-zinc-200 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Elections</h3>
              <p className="mt-2 text-sm text-zinc-700">
                Election of officers covers trustee elections, with a separate Club President item on the agenda.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
