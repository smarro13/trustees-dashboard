import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';

type AGMQuestion = {
  text: string;
  notes?: string[];
};

type AGMQuestionSection = {
  title: string;
  intro?: string[];
  questions: AGMQuestion[];
};

type ActionItem = {
  id: string;
  title: string;
};

const AGM_ACTION_SOURCE = '🏛️ AGM Questions';
const AGM_DEALT_WITH_STORAGE_KEY = 'agm-question-dealt-with';
const AGM_ARCHIVE_STORAGE_KEY = 'agm-question-archive';

const AGM_QUESTION_SECTIONS: AGMQuestionSection[] = [
  {
    title: 'Club Direction & Trustee Accountability',
    questions: [
      { text: 'Do you have any aims or goals for the 2026/27 season?' },
      { text: 'What are the trustees personally hoping to achieve in their roles over the next season?' },
      { text: 'Why is it not clear what the trustees are responsible for?' },
      { text: 'Is there a clear plan for how the club is going to progress moving forward? If so, can this be published so it is accessible for all members to see?' },
      { text: 'If there is a plan, are all actions and decisions referred back to it to ensure they align with the club\'s goals?' },
      { text: 'How does the club look in five years time? What major projects are we undertaking, and what plans do we have in place to achieve these?' },
      { text: 'Can the above plans and progress updates be published regularly, including milestones and updates?' },
    ],
  },
  {
    title: 'Coaching, Rugby & Player Retention',
    questions: [
      { text: 'What support is offered to the coaches of the senior teams?' },
      { text: 'Do coaches have targets or aims, and how are they kept accountable throughout the season?' },
      { text: 'What are the main reasons players leave, and what is being done to address them?' },
      { text: 'What steps are we taking to build an inclusive and positive culture across all teams?' },
    ],
  },
  {
    title: 'Community & Club Relationships',
    questions: [
      { text: 'How are we strengthening ties with local schools, businesses, and community groups?' },
      { text: 'Are we fully compliant with RFU safeguarding requirements, and where are the current gaps, if any?' },
    ],
  },
  {
    title: 'Facilities & Club Improvements',
    questions: [
      { text: 'When will the wall next to the doorway in the main clubhouse be fixed?' },
      { text: 'What are the plans for purchasing new kit? Are all teams eventually going to match the junior section?' },
    ],
  },
  {
    title: 'Membership & Volunteer Recognition',
    questions: [
      { text: 'How are we improving the value members receive for their membership fees?' },
      { text: 'How are we recognising and rewarding the people who keep the club running?' },
    ],
  },
  {
    title: 'Volunteers',
    intro: ['The club is built on volunteers and volunteering, which is something raised at every AGM.'],
    questions: [
      { text: 'What recognition do we currently give volunteers as a club?' },
      { text: 'What incentives could we introduce to encourage more people to volunteer? For example, discounts on membership or occasional free drinks.' },
      { text: 'How would this be monitored and managed fairly, so benefits are not simply claimed by people without the required effort or commitment?' },
    ],
  },
  {
    title: 'Memorial Wall',
    intro: [
      'We have a memorial wall with very few plaques.',
      'There are a great number of former members who deserve to be remembered. The original vets have started the process of recognising former vets who have passed away.',
    ],
    questions: [
      { text: 'Who is responsible for deciding whose name receives a plaque?' },
      { text: 'Who pays for the plaque?' },
      { text: 'Are plaques intended to remain there in perpetuity?' },
    ],
  },
  {
    title: 'Meeting Minutes',
    intro: [
      'No minutes from trustee meetings are currently being published. These used to be a good way for members to understand what was happening at the club and who was responsible for different areas. They also helped people identify areas where they could get involved and lend a hand.',
    ],
    questions: [
      { text: 'Is it possible for trustee meeting minutes to start being published again going forward?' },
    ],
  },
  {
    title: 'You Said, We Did',
    questions: [
      {
        text: 'Can we look at implementing a "You Said, We Did" section?',
        notes: [
          'This would allow members to ask questions throughout the year and allow trustees to respond openly.',
          'It could be hosted online and would allow members with similar questions to see that topics have already been raised and answered. Submissions could be made through a form similar to the one currently being used.',
        ],
      },
    ],
  },
  {
    title: 'Gym',
    intro: [
      'This was raised at last year\'s AGM.',
      'The gym currently attracts around 60 gym-only members, not including players who already hold club membership. This generates just over £7,000 per year in gym membership fees alone.',
      'Even if 50% of this income was ring-fenced, it would allow approximately £4,500 per year to be reinvested into the gym. Much of the equipment is dated, held together with tape, and breaks frequently. This funding would help replace and improve equipment over time.',
      'There are also members bringing in their own equipment. A lot of this is not high quality and leaves the gym looking like a dumping ground for unwanted kit.',
    ],
    questions: [
      { text: 'Is it possible to ring-fence some of the gym membership income and allocate it directly to gym improvements?' },
      { text: 'Are we insured for additional equipment brought in by members?' },
      { text: 'If someone injures themselves using privately supplied equipment, where do we stand from a liability and insurance perspective?' },
    ],
  },
  {
    title: 'Showers',
    intro: [
      'They work reasonably well when only one person is using them, but as soon as multiple teams are using the facilities, the water goes cold, pressure drops significantly, and it becomes difficult for players to shower properly.',
    ],
    questions: [
      { text: 'Are we any further along in improving the reliability of the showers?' },
    ],
  },
];

export default function AGMQuestionsPage() {
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [updates, setUpdates] = useState<Record<string, string>>({});
  const [openUpdateEditors, setOpenUpdateEditors] = useState<Record<string, boolean>>({});
  const [dealtWithQuestions, setDealtWithQuestions] = useState<Record<string, boolean>>({});
  const [isArchived, setIsArchived] = useState(false);
  const [showArchivedContent, setShowArchivedContent] = useState(false);
  const [savingQuestion, setSavingQuestion] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const allQuestions = useMemo(
    () => AGM_QUESTION_SECTIONS.flatMap((section) =>
      section.questions.map((question) => ({
        sectionTitle: section.title,
        ...question,
      }))
    ),
    []
  );

  const questionCount = allQuestions.length;

  const loadData = async () => {
    setLoading(true);

    const { data: actionData } = await supabase
      .from('action_items')
      .select('id, title')
      .eq('source', AGM_ACTION_SOURCE)
      .order('created_at', { ascending: false });

    if (actionData) {
      setActions(actionData);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const storedDealtWith = window.localStorage.getItem(AGM_DEALT_WITH_STORAGE_KEY);
    const storedArchive = window.localStorage.getItem(AGM_ARCHIVE_STORAGE_KEY);

    if (storedDealtWith) {
      try {
        setDealtWithQuestions(JSON.parse(storedDealtWith));
      } catch {
        setDealtWithQuestions({});
      }
    }

    if (storedArchive === 'true') {
      setIsArchived(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(AGM_DEALT_WITH_STORAGE_KEY, JSON.stringify(dealtWithQuestions));
  }, [dealtWithQuestions]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(AGM_ARCHIVE_STORAGE_KEY, String(isArchived));
  }, [isArchived]);

  const toggleUpdateEditor = (questionText: string) => {
    setOpenUpdateEditors((prev) => ({
      ...prev,
      [questionText]: !prev[questionText],
    }));
  };

  const hasAction = (questionText: string) => actions.some((action) => action.title === questionText);

  const isQuestionComplete = (questionText: string) => hasAction(questionText) || Boolean(dealtWithQuestions[questionText]);

  const completedQuestionCount = allQuestions.filter((question) => isQuestionComplete(question.text)).length;
  const canArchive = questionCount > 0 && completedQuestionCount === questionCount;

  const addToActionTracker = async (sectionTitle: string, questionText: string) => {
    setSavingQuestion(questionText);

    const updateText = updates[questionText]?.trim();
    const description = [
      `Category: ${sectionTitle}`,
      updateText ? `Update: ${updateText}` : 'Update: No update added yet.',
    ].join('\n\n');

    const { error } = await supabase.from('action_items').insert({
      title: questionText,
      description,
      meeting_id: null,
      source: AGM_ACTION_SOURCE,
      status: 'Open',
      created_by: null,
    });

    setSavingQuestion(null);

    if (error) {
      alert('Failed to add AGM question to the action tracker: ' + error.message);
      return;
    }

    setUpdates((prev) => ({ ...prev, [questionText]: '' }));
    setOpenUpdateEditors((prev) => ({ ...prev, [questionText]: false }));
    await loadData();
  };

  const toggleDealtWith = (questionText: string) => {
    if (hasAction(questionText)) {
      return;
    }

    setDealtWithQuestions((prev) => ({
      ...prev,
      [questionText]: !prev[questionText],
    }));
  };

  const toggleArchive = () => {
    if (!canArchive) {
      return;
    }

    setIsArchived((prev) => !prev);
  };

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
        </header>

        <section className="mb-8 rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
          <div className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">Question progress</h2>
              <p className="mt-1 text-sm text-zinc-600">
                {completedQuestionCount} of {questionCount} questions are either actioned or marked as dealt with.
              </p>
            </div>
            <label className="inline-flex items-center gap-3 text-sm font-medium text-zinc-700">
              <input
                type="checkbox"
                checked={isArchived}
                onChange={toggleArchive}
                disabled={!canArchive}
                className="h-4 w-4 rounded border-zinc-300"
              />
              Archive this page
            </label>
          </div>
          {!canArchive && (
            <div className="border-t border-zinc-200 px-6 py-3 text-sm text-zinc-500">
              Archiving becomes available once every question is complete.
            </div>
          )}
          {isArchived && (
            <div className="border-t border-zinc-200 px-6 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-emerald-700">This AGM questions page is marked as archived.</p>
                <button
                  type="button"
                  onClick={() => setShowArchivedContent((prev) => !prev)}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
                >
                  {showArchivedContent ? 'Hide archived questions' : 'View archived questions'}
                </button>
              </div>
            </div>
          )}
        </section>

        <div className={`space-y-8 ${isArchived && !showArchivedContent ? 'hidden' : ''}`}>
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

                <div className="space-y-5">
                  {section.questions.map((question, index) => {
                    const actionAdded = hasAction(question.text);
                    const isComplete = isQuestionComplete(question.text);

                    return (
                      <article key={question.text} className="rounded-lg border border-zinc-200 p-5">
                        <div className="flex items-start gap-3">
                          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-50 text-xs font-semibold text-red-700 ring-1 ring-red-100">
                            {index + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0 flex-1">
                                <h3 className="text-base font-semibold text-zinc-900">{question.text}</h3>
                                {question.notes?.map((note) => (
                                  <p key={note} className="mt-2 text-sm leading-6 text-zinc-600">
                                    {note}
                                  </p>
                                ))}
                              </div>
                              <label className="inline-flex items-center gap-2 text-sm font-medium text-zinc-700">
                                <input
                                  type="checkbox"
                                  checked={isComplete}
                                  onChange={() => toggleDealtWith(question.text)}
                                  disabled={actionAdded}
                                  className="h-4 w-4 rounded border-zinc-300"
                                />
                                {actionAdded ? 'Action added' : 'Dealt with'}
                              </label>
                            </div>

                            <div className="mt-4 rounded-md bg-zinc-50 p-4">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <p className="text-xs text-zinc-500">Use the buttons below if this question needs an action or note.</p>
                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => toggleUpdateEditor(question.text)}
                                    className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
                                  >
                                    {openUpdateEditors[question.text] ? 'Hide update' : 'Add update'}
                                  </button>
                                  <button
                                    onClick={() => addToActionTracker(section.title, question.text)}
                                    disabled={savingQuestion === question.text}
                                    className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                  >
                                    {savingQuestion === question.text ? 'Adding…' : '🏛️ Add to Action Tracker'}
                                  </button>
                                </div>
                              </div>

                              {openUpdateEditors[question.text] && (
                                <div className="mt-4">
                                  <label className="mb-2 block text-sm font-medium text-zinc-700">Update / context note</label>
                                  <textarea
                                    rows={4}
                                    value={updates[question.text] ?? ''}
                                    onChange={(e) => setUpdates((prev) => ({ ...prev, [question.text]: e.target.value }))}
                                    placeholder="Add context, progress, or follow-up notes before creating an AGM action..."
                                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                                  />
                                </div>
                              )}
                            </div>

                            {actionAdded && (
                              <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                                This question already has an AGM action linked to it.
                              </div>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </section>
          ))}
        </div>

        {loading && <p className="mt-6 text-sm text-zinc-500">Loading AGM question actions…</p>}
        {!loading && questionCount === 0 && <p className="mt-6 text-sm text-zinc-500">No AGM questions configured.</p>}
      </div>
    </main>
  );
}