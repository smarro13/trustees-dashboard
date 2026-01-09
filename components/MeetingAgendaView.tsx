import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../lib/supabaseClient'

type Props = {
  meetingId: string
}

export default function MeetingAgendaView({ meetingId }: Props) {
  const [loading, setLoading] = useState(false)

  const [apologies, setApologies] = useState<any[]>([])
  const [conflicts, setConflicts] = useState<any[]>([])
  const [correspondence, setCorrespondence] = useState<any[]>([])
  const [safeguarding, setSafeguarding] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [membership, setMembership] = useState<any[]>([])
  const [actions, setActions] = useState<any[]>([])

  useEffect(() => {
    if (!meetingId) return

    const load = async () => {
      setLoading(true)

      try {
        const [
          apol,
          conf,
          corr,
          safe,
          ev,
          mem,
          act,
        ] = await Promise.all([
          supabase.from('apologies')
            .select('id, name, note, created_at')
            .eq('meeting_id', meetingId)
            .order('created_at', { ascending: false }),

          supabase.from('conflicts_of_interest')
            .select('id, trustee_name, interest_description, standing, action_taken, created_at')
            .eq('meeting_id', meetingId)
            .order('created_at', { ascending: false }),

          supabase.from('correspondence')
            .select('id, subject, sender, summary, received_date, created_at')
            .eq('meeting_id', meetingId)
            .order('created_at', { ascending: false }),

          supabase.from('safeguarding_updates')
            .select('id, title, summary, status, review_date, team, created_at')
            .eq('meeting_id', meetingId)
            .order('created_at', { ascending: false }),

          supabase.from('events_planning')
            .select('id, title, suggested_date, event_date, lead, status, notes, setmore_url, created_at')
            .eq('meeting_id', meetingId)
            .order('created_at', { ascending: false }),

          supabase.from('membership_reports')
            .select('id, num_people, money_total, loveadmin_total, loveadmin_new_signups, loveadmin_outstanding_total, loveadmin_cancellations, created_at')
            .eq('meeting_id', meetingId)
            .order('created_at', { ascending: false }),

            supabase
              .from('action_items')
              .select('id, title, owner, due_date, status, created_at')
              .eq('meeting_id', meetingId)
              .order('due_date', { ascending: true })
        ])

        if (apol.error) throw apol.error
        if (conf.error) throw conf.error
        if (corr.error) throw corr.error
        if (safe.error) throw safe.error
        if (ev.error) throw ev.error
        if (mem.error) throw mem.error
        if (act.error) throw act.error

        setApologies(apol.data ?? [])
        setConflicts(conf.data ?? [])
        setCorrespondence(corr.data ?? [])
        setSafeguarding(safe.data ?? [])
        setEvents(ev.data ?? [])
        setMembership(mem.data ?? [])
        setActions(act.data ?? [])
      } catch (err) {
        console.error('Failed to load meeting agenda', err)
      } finally { 
        setLoading(false)
      }
    }

    load()
  }, [meetingId])

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading meeting agenda…</p>
  }

  return (
    <div className="space-y-6">
      <Section title="Apologies" editHref={`/agenda/apologies?meetingId=${meetingId}`}>
        {apologies.length === 0 ? (
          <p className="text-sm text-zinc-500">No apologies recorded.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {apologies.map(a => (
              <li key={a.id}>
                <span className="font-medium">{a.name}</span>
                {a.note && <span className="text-zinc-600"> — {a.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

function Section({
  title,
  editHref,
  children,
}: {
  title: string
  editHref?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {editHref && (
          <Link href={editHref} className="text-sm text-blue-600 hover:underline">
            Edit →
          </Link>
        )}
      </div>
      <div className="px-4 py-4">{children}</div>
    </section>
  )
}
