import Link from 'next/link';

const PLANNED_COLUMNS = ['Asset', 'Category', 'Location', 'Condition', 'Purchase date', 'Value', 'Owner / responsible'];

export default function AssetRegisterPage() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        <header className="mb-8">
          <Link href="/" className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline">
            ← Back to Dashboard
          </Link>
          <h1 className="text-3xl font-extrabold text-zinc-900">📦 Asset Register</h1>
          <p className="mt-1 text-zinc-600">A record of club-owned equipment, fixtures and property.</p>
          <span className="mt-3 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            Coming soon
          </span>
        </header>

        <section className="rounded-lg bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <h2 className="text-lg font-semibold text-slate-900">Assets</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50">
                <tr>
                  {PLANNED_COLUMNS.map((column) => (
                    <th key={column} className="px-3 py-2 text-left">{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={PLANNED_COLUMNS.length} className="px-3 py-8 text-center text-zinc-500">
                    The asset register is being set up. Assets will appear here once it is live.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
