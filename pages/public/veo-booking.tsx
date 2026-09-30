import Link from 'next/link';
import PublicSectionNav from '../../components/PublicSectionNav';

export default function VeoBookingPage() {
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <PublicSectionNav />

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-zinc-900">VEO Camera Booking</h1>
              <p className="mt-2 text-sm text-zinc-600">Book the club VEO camera to record a match or training session.</p>
            </div>
            <Link href="/public" className="text-sm font-medium text-red-700 hover:underline">
              Back to members page
            </Link>
          </div>

          <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-4">
            <p className="text-sm font-medium text-zinc-900">Coming soon</p>
            <p className="mt-1 text-sm text-zinc-600">
              Online booking for the VEO camera will be available here shortly. In the meantime, please contact the club to arrange a booking.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
