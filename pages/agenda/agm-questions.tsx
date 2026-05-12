import Link from 'next/link';

export default function AGMQuestionsPage() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-5xl px-4 py-10">
        <header className="mb-8">
          <Link
            href="/agenda/agm"
            className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline"
          >
            ← Back to AGM
          </Link>

          <h1 className="text-3xl font-extrabold text-zinc-900">AGM Questions</h1>
          <p className="mt-1 text-zinc-600">
            This page is intentionally blank for now and can be updated in code later.
          </p>
        </header>

        <section className="rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
          <div className="border-b border-zinc-200 px-6 py-4">
            <h2 className="text-xl font-semibold text-zinc-900">Questions</h2>
          </div>
          <div className="px-6 py-10 text-sm text-zinc-500">
            No AGM questions have been added yet.
          </div>
        </section>
      </div>
    </main>
  );
}