import Link from 'next/link';

export default function MediaScreensPage() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        <header className="mb-8">
          <Link href="/" className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline">
            ← Back to Dashboard
          </Link>
          <h1 className="text-3xl font-extrabold text-zinc-900">📺 Media Screens</h1>
          <p className="mt-1 text-zinc-600">Manage the content shown on the clubhouse media screens.</p>
          <span className="mt-3 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            Coming soon
          </span>
        </header>

        <section className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center">
          <p className="text-zinc-600">This page is a placeholder. Details of how the media screens will work are to follow.</p>
        </section>
      </div>
    </main>
  );
}
