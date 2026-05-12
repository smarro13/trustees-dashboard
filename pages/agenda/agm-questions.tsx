import Link from 'next/link';

export default function AGMQuestionsPage() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        <header className="mb-8">
          <Link
            href="/agenda/agm"
            className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline"
          >
            ← Back to AGM
          </Link>

          <h1 className="text-3xl font-extrabold text-zinc-900">AGM Questions</h1>
          <p className="mt-1 max-w-4xl text-zinc-600">
            These AGM questions are maintained in code. You can add follow-up actions from this page, and any AGM-tagged
            actions already created will appear beneath the relevant question as updates.
          </p>
        </header>

        <section className="mb-8 rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
          <div className="border-b border-zinc-200 px-6 py-4">
            <h2 className="text-xl font-semibold text-zinc-900">Action tracker defaults</h2>
            <p className="mt-1 text-sm text-zinc-600">
              These optional values are used when you create an AGM action from any question below.
            </p>
          </div>

          <div className="grid gap-4 px-6 py-6 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Linked meeting</label>
              <select
                value={meetingId ?? ''}
                onChange={(e) => setMeetingId(e.target.value || null)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2"
              >
                <option value="">No linked meeting</option>
                {meetings.map((meeting) => (
                  <option key={meeting.id} value={meeting.id}>
                    {new Date(meeting.meeting_date).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Created by</label>
              <input
                type="text"
                value={createdBy}
                onChange={(e) => setCreatedBy(e.target.value)}
                placeholder="Your name"
                className="w-full rounded-md border border-zinc-300 px-3 py-2"
              />
            </div>
          </div>
        </section>

        <div className="space-y-8">
          {AGM_QUESTION_SECTIONS.map((section) => (
            <section key={section.title} className="rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
              <div className="border-b border-zinc-200 px-6 py-4">
                <h2 className="text-xl font-semibold text-zinc-900">{section.title}</h2>
              </div>

              <div className="space-y-6 px-6 py-6">
                {section.intro?.map((paragraph) => (
                  <p key={paragraph} className="text-sm leading-6 text-zinc-600">
                    {paragraph}
                  </p>
                ))}

                {section.questions.length === 0 ? (
                  <p className="rounded-md bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
                    No direct question cards in this section yet.
                  </p>
                ) : (
                  <div className="space-y-5">
                    {section.questions.map((question, index) => {
                      const questionActions = relatedActions(question.text);

                      return (
                        <article key={question.text} className="rounded-lg border border-zinc-200 p-5">
                          <div className="flex items-start gap-3">
                            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-50 text-xs font-semibold text-red-700 ring-1 ring-red-100">
                              {index + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <h3 className="text-base font-semibold text-zinc-900">{question.text}</h3>

                              {question.notes?.map((note) => (
                                <p key={note} className="mt-2 text-sm leading-6 text-zinc-600">
                                  {note}
                                </p>
                              ))}

                              <div className="mt-4 rounded-md bg-zinc-50 p-4">
                                <label className="mb-2 block text-sm font-medium text-zinc-700">
                                  Update / context note
                                </label>
                                <textarea
                                  rows={4}
                                  value={updates[question.text] ?? ''}
                                  onChange={(e) =>
                                    setUpdates((prev) => ({ ...prev, [question.text]: e.target.value }))
                                  }
                                  placeholder="Add context, progress, or follow-up notes before creating an AGM action..."
                                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                                />
                                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                                  <p className="text-xs text-zinc-500">
                                    Actions created here are tagged as {AGM_ACTION_SOURCE}.
                                  </p>
                                  <button
                                    onClick={() => addToActionTracker(section.title, question.text)}
                                    disabled={savingQuestion === question.text}
                                    className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                  >
                                    {savingQuestion === question.text ? 'Adding…' : '🏛️ Add to Action Tracker'}
                                  </button>
                                </div>
                              </div>

                              <div className="mt-4">
                                <h4 className="text-sm font-semibold text-zinc-800">Updates</h4>
                                {questionActions.length === 0 ? (
                                  <p className="mt-2 text-sm text-zinc-500">No AGM actions linked to this question yet.</p>
                                ) : (
                                  <div className="mt-3 space-y-3">
                                    {questionActions.map((action) => (
                                      <div key={action.id} className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-200">
                                            {action.status}
                                          </span>
                                          <span className="text-xs text-zinc-500">
                                            {action.created_at
                                              ? `Created ${new Date(action.created_at).toLocaleString('en-GB', {
                                                day: '2-digit',
                                                month: '2-digit',
                                                year: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                              })}`
                                              : 'Created date unavailable'}
                                          </span>
                                        </div>

                                        {action.description && (
                                          <p className="mt-2 whitespace-pre-wrap text-zinc-700">{action.description}</p>
                                        )}

                                        <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-600">
                                          <span>Created by: {action.created_by || '—'}</span>
                                          <span>
                                            Meeting:{' '}
                                            {action.meetings?.meeting_date
                                              ? new Date(action.meetings.meeting_date).toLocaleDateString('en-GB')
                                              : '—'}
                                          </span>
                                          <span>
                                            Due:{' '}
                                            {action.due_date
                                              ? new Date(action.due_date).toLocaleDateString('en-GB')
                                              : '—'}
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>

        {loading && (
          <p className="mt-6 text-sm text-zinc-500">Loading AGM question actions…</p>
        )}

        {!loading && questions.length === 0 && (
          <p className="mt-6 text-sm text-zinc-500">No AGM questions configured.</p>
        )}
      </div>
    </main>
  );
}
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