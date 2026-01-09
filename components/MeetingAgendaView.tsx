import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../lib/supabaseClient'

type Props = {
  meetingId: string
}

type FetchResult<T> = {
  data: T | null
  error: any
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

  const safeFetch = async <T>(
    promise: Promise<FetchResult<T>>
  ): Promise<FetchResult<T>> => {
    try {
      return await promise
    } catch (e) {
      console.error(e)
      return { data: null, error: e }
    }
  }

  useEffect(() => {
    if (!meetingId) return

    const load = async () => {
      setLoading(true)

      const [
        apol,
        conf,
        corr,
        safe,
        ev,
        mem,
        act,
      ] = await Promise.all([
        safeFetch(
          supabase
            .from('apologies')
            .select('id, name, note, created_at')
            .eq('meeting_id', meetingId)
            .order('created_at', { ascending: false })
        ),

        safeFetch(
          supabase
            .from('conflicts_of_interest')
            .select('id, trustee_name, interest_description, standing, action_taken, created_at')
            .eq('meeting_id', meetingId)
            .order('created_at', { ascending: false })
        ),

        safeFetch(
          supabase
            .from('correspondence')
            .select('id, subject, sender, summary, received_date, created_at')
            .eq('meeting_id', meetingId)
            .order('created_at', { ascending: false })
        ),

        safeFetch(
          supabase
            .from('safeguarding_updates')
            .select('id, title, summary, status, review_date, team, created_at')
            .eq('meeting_id', meetingId)
            .order('created_at', { ascending: false })
        ),

        safeFetch(
          supabase
            .from('events_planning')
            .select('id, title, suggested_date, event_date, lead, status, notes, setmore_url, created_at')
            .eq('meeting_id', meetingId)
            .order('created_at', { ascending: false })
        ),

        safeFetch(
          supabase
            .from('membership_reports')
            .select('id, num_people, money_total, loveadmin_total, loveadmin_new_signups, loveadmin_outstanding_total, loveadmin_cancellations, created_at')
            .eq('meeting_id', meetingId)
            .order('created_at', { ascending: false })
        ),

        safeFetch(
          supabase
            .from('action_items')
            .select('id, title, owner, due_date, status, created_at')
            .eq('meeting_id', meetingId)
            .order('due_date', { ascending: true, nullsLast: true })
        ),
      ])

      setApologies(apol.data ?? [])
      setConflicts(conf.data ?? [])
      setCorrespondence(corr.data ?? [])
      setSafeguarding(safe.data ?? [])
      setEvents(ev.data ?? [])
      setMembership(mem.data ?? [])
      setActions(act.data ?? [])

      setLoading(false)
    }

    load()
  }, [meetingId])

  const Section = ({
    title,
    editHref,
    children,
  }: {
    title: string
    editHref?: string
    children: React.ReactNode
  }) => (
    <section className="rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 sm:px-6 lg:px-8">
        <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
        {editHref && (
          <Link href={editHref} className="text-sm font-medium text-blue-600 hover:underline">
            Edit →
          </Link>
        )}
      </div>
      <div className="px-4 py-4 sm:px-6 lg:px-8">{children}</div>
    </section>
  )

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

      <Section title="Conflicts of Interest" editHref={`/agenda/conflicts?meetingId=${meetingId}`}>
        {conflicts.length === 0 ? (
          <p className="text-sm text-zinc-500">No conflicts recorded.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {conflicts.map(c => (
              <li key={c.id}>
                <div className="font-medium">{c.trustee_name}</div>
                <div>{c.interest_description}</div>
                {c.action_taken && (
                  <div className="text-xs text-zinc-500">Action: {c.action_taken}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Actions" editHref={`/agenda/actions?meetingId=${meetingId}`}>
        {actions.length === 0 ? (
          <p className="text-sm text-zinc-500">No actions linked.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {actions.map(a => (
              <li key={a.id}>
                <span className="font-medium">{a.title}</span>{' '}
                <span className="text-zinc-600">
                  — {a.status}
                  {a.due_date && ` (due ${new Date(a.due_date).toLocaleDateString('en-GB')})`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
