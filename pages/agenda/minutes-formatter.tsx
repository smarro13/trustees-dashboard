import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import InlineNoticeBanner, { type InlineNotice } from '../../components/InlineNotice';
import { supabase } from '../../lib/supabaseClient';
import {
  parseAction,
  parseMatterItems,
  createDocxBlob,
  type Action,
  type MatterGroup,
} from '../../lib/minutesGenerator';

const AI_ENDPOINT = '/api/private/minutes-ai';

type AgendaBucket = {
  title: string;
  keywords: string[];
};

type SectionResult = {
  title: string;
  notes: string[];
};

type ActionCandidate = {
  id: string;
  title: string;
  description: string;
};

// Pull Matters Arising, AOB, and unmatched into one list for the merged section
const getExtraSections = (
  sections: SectionResult[],
  unmatched: string[],
): { matters: string[]; aob: string[]; unmatched: string[] } => ({
  matters: sections.find(s => s.title === 'Matters Arising')?.notes ?? [],
  aob: sections.find(s => s.title === 'AOB')?.notes ?? [],
  unmatched,
});

const AGENDA_BUCKETS: AgendaBucket[] = [
  { title: 'Apologies', keywords: ['apology', 'absent', 'unable to attend'] },
  { title: 'AGM', keywords: ['agm', 'annual general meeting'] },
  { title: 'Previous Minutes', keywords: ['previous minutes', 'minutes approved', 'minutes agreed'] },
  { title: 'Action Tracker', keywords: ['action', 'owner', 'deadline', 'due date', 'complete', 'in progress'] },
  { title: 'Correspondence', keywords: ['correspondence', 'email', 'letter', 'message received'] },
  { title: 'Safeguarding', keywords: ['safeguarding', 'welfare', 'incident', 'dbs', 'risk'] },
  { title: 'Conflicts of Interest', keywords: ['conflict of interest', 'conflict', 'declaration of interest'] },
  { title: 'Treasury Report', keywords: ['treasury', 'cash flow', 'budget', 'finance', 'bank', 'accounts'] },
  { title: 'Trading Company Report', keywords: ['trading', 'bar', 'till', 'turnover', 'stock'] },
  { title: 'Commercial & Transformation', keywords: ['commercial', 'transformation', 'partnership', 'sponsorship', 'growth'] },
  { title: 'Events Planning', keywords: ['event', 'fixture event', 'planning', 'festival', 'fundraiser'] },
  { title: 'Membership Report', keywords: ['membership', 'member', 'signup', 'renewal', 'retention'] },
  { title: 'Rugby Report', keywords: ['rugby', 'mini', 'junior', 'senior', 'coaching', 'fixtures'] },
  { title: 'Job Club', keywords: ['job club', 'maintenance', 'refresh', 'task assignment'] },
  { title: 'Matters Arising', keywords: ['matter arising', 'follow up', 'carried forward'] },
  { title: 'AOB', keywords: ['aob', 'any other business'] },
];

const sentenceSplit = (raw: string): string[] =>
  raw
    .split(/\n+|(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 2);

const scoreSentenceForBucket = (sentence: string, bucket: AgendaBucket): number => {
  const normalized = sentence.toLowerCase();
  let score = 0;

  for (const keyword of bucket.keywords) {
    if (normalized.includes(keyword)) score += 1;
  }

  return score;
};

const buildSectionResults = (transcript: string): { sections: SectionResult[]; unmatched: string[] } => {
  const sentences = sentenceSplit(transcript);
  const map = new Map<string, string[]>();

  for (const bucket of AGENDA_BUCKETS) {
    map.set(bucket.title, []);
  }

  const unmatched: string[] = [];

  for (const sentence of sentences) {
    let winningTitle: string | null = null;
    let winningScore = 0;

    for (const bucket of AGENDA_BUCKETS) {
      const score = scoreSentenceForBucket(sentence, bucket);
      if (score > winningScore) {
        winningScore = score;
        winningTitle = bucket.title;
      }
    }

    if (!winningTitle || winningScore === 0) {
      unmatched.push(sentence);
      continue;
    }

    const existing = map.get(winningTitle) || [];
    if (!existing.includes(sentence)) {
      map.set(winningTitle, [...existing, sentence]);
    }
  }

  const sections: SectionResult[] = AGENDA_BUCKETS.map((bucket) => ({
    title: bucket.title,
    notes: map.get(bucket.title) || [],
  }));

  return { sections, unmatched };
};

const MERGED_SECTION_TITLES = new Set(['Matters Arising', 'AOB']);

const buildMinutesText = (
  title: string,
  meetingDate: string,
  sections: SectionResult[],
  unmatched: string[],
): string => {
  const lines: string[] = [];
  lines.push(title.trim() || 'Management Meeting Minutes');
  lines.push(meetingDate ? `Date: ${meetingDate}` : 'Date: Not provided');
  lines.push(`Generated: ${new Date().toLocaleString('en-GB')}`);
  lines.push('');

  const mainSections = sections.filter(s => !MERGED_SECTION_TITLES.has(s.title));

  mainSections.forEach((section, idx) => {
    lines.push(`${idx + 1}. ${section.title}`);
    if (section.notes.length === 0) {
      lines.push('- Nothing discussed.');
    } else {
      section.notes.forEach((note) => lines.push(`- ${note}`));
    }
    lines.push('');
  });

  // Merged Matters Arising & Other Business — grouped by subject
  const mattersNotes = sections.find(s => s.title === 'Matters Arising')?.notes ?? [];
  const aobNotes = sections.find(s => s.title === 'AOB')?.notes ?? [];
  const allExtra = [...mattersNotes, ...aobNotes, ...unmatched];

  lines.push(`${mainSections.length + 1}. Matters Arising & Other Business`);

  if (allExtra.length === 0) {
    lines.push('- Nothing discussed.');
  } else {
    const groupMap = new Map<string, string[]>();
    const seen = new Set<string>();
    for (const text of allExtra) {
      const cleaned = text.replace(/^[-\s]+/, '').trim();
      if (!cleaned || /^(no discussion|nothing discussed|nothing additional identified)\.?$/i.test(cleaned)) continue;
      if (seen.has(cleaned.toLowerCase())) continue;
      seen.add(cleaned.toLowerCase());
      // Simple keyword grouping for the text preview
      const heading = (() => {
        const low = cleaned.toLowerCase();
        if (low.match(/solar|panel/)) return 'Solar Panels';
        if (low.match(/gym|treadmill|facility|maintenance|repair|building|shower|boiler/)) return 'Facilities';
        if (low.match(/email|notify|announce|message|social|website/)) return 'Communications';
        if (low.match(/budget|cost|expense|payment|invoice|treasurer|financial|fund/)) return 'Finance';
        if (low.match(/policy|procedures|governance|rules|compliance|code of conduct/)) return 'Governance';
        if (low.match(/event|social|gathering|summer|party|celebration|dinner/)) return 'Club Social';
        if (low.match(/member|renewal|signup|recruitment|retention/)) return 'Membership';
        if (low.match(/rugby|team|fixtures|training|coaching|junior|senior/)) return 'Rugby';
        if (low.match(/sponsorship|partnership|revenue|business|commercial/)) return 'Commercial';
        if (low.match(/waste|contract|internet|infrastructure/)) return 'Infrastructure & Operations';
        return 'Other Matters';
      })();
      const existing = groupMap.get(heading) ?? [];
      existing.push(cleaned);
      groupMap.set(heading, existing);
    }
    if (groupMap.size === 0) {
      lines.push('- Nothing discussed.');
    } else {
      for (const [heading, items] of groupMap.entries()) {
        lines.push('');
        lines.push(`  ${heading}`);
        items.forEach(item => lines.push(`  - ${item}`));
      }
    }
  }

  return lines.join('\n');
};

const toActionTitle = (text: string) => {
  const cleaned = text.replace(/^[-\s]+/, '').trim();
  if (cleaned.length <= 120) return cleaned;
  return `${cleaned.slice(0, 117)}...`;
};

const extractActionCandidates = (sections: SectionResult[]): ActionCandidate[] => {
  const actionSections = sections.filter((section) =>
    ['Action Tracker', 'Matters Arising', 'AOB'].includes(section.title),
  );

  const seen = new Set<string>();
  const output: ActionCandidate[] = [];

  for (const section of actionSections) {
    for (const note of section.notes) {
      const normalized = note.trim();
      if (!normalized) continue;
      const key = normalized.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      output.push({
        id: `${section.title}-${output.length}`,
        title: toActionTitle(normalized),
        description: normalized,
      });
    }
  }

  return output;
};

const extractActionCandidatesFromMinutesText = (text: string): ActionCandidate[] => {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.replace(/^-\s+/, '').trim())
    .filter((line) => line && line.toLowerCase() !== 'no discussion.');

  const seen = new Set<string>();
  const output: ActionCandidate[] = [];

  for (const line of lines) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({
      id: `ai-${output.length}`,
      title: toActionTitle(line),
      description: line,
    });
  }

  return output;
};

export default function MinutesFormatterPage() {
  const [meetings, setMeetings] = useState<any[]>([]);
  const [meetingTitle, setMeetingTitle] = useState('Aldwinians Management Meeting Minutes');
  const [meetingDate, setMeetingDate] = useState('');
  const [transcript, setTranscript] = useState('');
  const [generated, setGenerated] = useState(false);
  const [saveMeetingId, setSaveMeetingId] = useState<string | null>(null);
  const [savingMinutesDoc, setSavingMinutesDoc] = useState(false);
  const [editableMinutes, setEditableMinutes] = useState('');
  const [actionMeetingId, setActionMeetingId] = useState<string | null>(null);
  const [selectedActionIds, setSelectedActionIds] = useState<Set<string>>(new Set());
  const [addingActions, setAddingActions] = useState(false);
  const [notice, setNotice] = useState<InlineNotice | null>(null);
  const [parsedActions, setParsedActions] = useState<Action[]>([]);
  const [matterGroups, setMatterGroups] = useState<MatterGroup[]>([]);
  const [downloadingDocx, setDownloadingDocx] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [editRequest, setEditRequest] = useState('');

  const parsed = useMemo(() => buildSectionResults(transcript), [transcript]);
  const minutesText = useMemo(
    () => buildMinutesText(meetingTitle, meetingDate, parsed.sections, parsed.unmatched),
    [meetingTitle, meetingDate, parsed.sections, parsed.unmatched],
  );
  const actionCandidates = useMemo(
    () => (editableMinutes.trim() ? extractActionCandidatesFromMinutesText(editableMinutes) : extractActionCandidates(parsed.sections)),
    [editableMinutes, parsed.sections],
  );

  useEffect(() => {
    const loadMeta = async () => {
      const meetingsResult = await supabase
        .from('meetings')
        .select('id, meeting_date')
        .order('meeting_date', { ascending: true });
      setMeetings(meetingsResult.data || []);
    };
    loadMeta();
  }, []);

  const showNotice = (type: InlineNotice['type'], message: string) => {
    setNotice({ type, message });
  };

  const generateMinutes = async () => {
    if (!transcript.trim()) {
      showNotice('error', 'Paste your Otter transcript first.');
      return;
    }

    setAiLoading(true);
    setAiSuggestions([]);

    let minutesContent = minutesText;
    let suggestions: string[] = [];

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (token) {
        const res = await fetch(AI_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ mode: 'generate', meetingTitle, meetingDate, transcript }),
        });
        const data = await res.json();
        if (data.ok && data.minutesText) {
          minutesContent = data.minutesText;
          suggestions = data.suggestions || [];
        } else {
          showNotice('error', `AI generation failed: ${data.error || 'Unknown error'}. Using local formatting.`);
        }
      } else {
        showNotice('error', 'Not authenticated. Using local formatting.');
      }
    } catch {
      showNotice('error', 'Could not reach AI service. Using local formatting.');
    }

    setAiLoading(false);
    setEditableMinutes(minutesContent);
    setAiSuggestions(suggestions);
    setSelectedActionIds(new Set(actionCandidates.map((item) => item.id)));

    const actionCandidateTexts = actionCandidates.map(c => c.description);
    setParsedActions(actionCandidateTexts.map(text => parseAction(text, 'Minutes Formatter')));

    const { matters, aob, unmatched: unmatchedItems } = getExtraSections(parsed.sections, parsed.unmatched);
    setMatterGroups(parseMatterItems(matters, aob, unmatchedItems));

    setGenerated(true);
  };

  const improveWithAI = async () => {
    const current = editableMinutes.trim();
    if (!current) {
      showNotice('error', 'Generate minutes first.');
      return;
    }
    setAiLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { showNotice('error', 'Not authenticated.'); setAiLoading(false); return; }

      const res = await fetch(AI_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode: 'improve', meetingTitle, meetingDate, transcript, currentDraft: current, editRequest }),
      });
      const data = await res.json();
      if (data.ok && data.minutesText) {
        setEditableMinutes(data.minutesText);
        setAiSuggestions(data.suggestions || []);
        showNotice('success', 'Minutes refined by AI.');
      } else {
        showNotice('error', `AI refinement failed: ${data.error || 'Unknown error'}`);
      }
    } catch {
      showNotice('error', 'Could not reach AI service.');
    }
    setAiLoading(false);
  };

  const copyMinutes = async () => {
    try {
      await navigator.clipboard.writeText(editableMinutes || minutesText);
      showNotice('success', 'Formatted minutes copied.');
    } catch {
      showNotice('error', 'Could not copy to clipboard on this browser.');
    }
  };



  const downloadAsDocx = () => {
    setDownloadingDocx(true);
    try {
      const blob = createDocxBlob(
        meetingTitle,
        meetingDate,
        parsed.sections,
        parsedActions,
        matterGroups
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${meetingTitle || 'minutes'}-${meetingDate || 'draft'}.docx`.replace(/\s+/g, '-');
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      showNotice('success', 'Minutes Word document downloaded.');
    } catch (error) {
      showNotice('error', 'Failed to generate Word document.');
      console.error(error);
    }
    setDownloadingDocx(false);
  };

  const saveDraftToMinutesLibrary = async () => {
    setSavingMinutesDoc(true);

    try {
      const fileName = `${meetingTitle || 'minutes'}-${meetingDate || new Date().toISOString().slice(0, 10)}.docx`
        .replace(/\s+/g, '-')
        .replace(/[^a-zA-Z0-9._-]/g, '')
        .toLowerCase();

      const filePath = `minutes-generated/${Date.now()}-${fileName}`;
      
      // Generate DOCX blob
      const blob = createDocxBlob(
        meetingTitle,
        meetingDate,
        parsed.sections,
        parsedActions,
        matterGroups,
        editableMinutes || undefined,
      );

      const { error: uploadError } = await supabase.storage
        .from('minutes')
        .upload(filePath, blob, { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', upsert: false });

      if (uploadError) {
        showNotice('error', `Failed to upload minutes document: ${uploadError.message}`);
        setSavingMinutesDoc(false);
        return;
      }

      const { data } = supabase.storage.from('minutes').getPublicUrl(filePath);
      const { error: insertError } = await supabase.from('minutes').insert({
        title: meetingTitle || 'Management Meeting Minutes',
        file_url: data.publicUrl,
        meeting_id: saveMeetingId,
      });

      if (insertError) {
        showNotice('error', `Document uploaded, but failed to save minutes record: ${insertError.message}`);
        setSavingMinutesDoc(false);
        return;
      }

      showNotice('success', 'Minutes document saved and linked.');
    } catch (error) {
      showNotice('error', 'Failed to save minutes document.');
      console.error(error);
    }

    setSavingMinutesDoc(false);
  };

  const clearAll = () => {
    setTranscript('');
    setGenerated(false);
    setEditableMinutes('');
    setSelectedActionIds(new Set());
    setActionMeetingId(null);
    setSaveMeetingId(null);
    setParsedActions([]);
    setMatterGroups([]);
    setAiSuggestions([]);
    setEditRequest('');
    setNotice(null);
  };

  const toggleActionSelection = (id: string) => {
    setSelectedActionIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const addSelectedToActionTracker = async () => {
    const selectedActions = actionCandidates.filter((item) => selectedActionIds.has(item.id));
    if (!selectedActions.length) {
      showNotice('error', 'Select at least one action to add.');
      return;
    }

    setAddingActions(true);

    const payload = selectedActions.map((item) => ({
      title: item.title,
      description: item.description,
      owner: null,
      due_date: null,
      meeting_id: actionMeetingId,
      source: 'Minutes Formatter',
      status: 'Open',
      created_by: null,
    }));

    const { error } = await supabase.from('action_items').insert(payload);

    setAddingActions(false);

    if (error) {
      showNotice('error', `Failed to add actions: ${error.message}`);
      return;
    }

    showNotice('success', `${selectedActions.length} action item${selectedActions.length === 1 ? '' : 's'} added to tracker.`);
  };

  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-10">
        <header className="mb-8">
          <Link href="/" className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline">
            Back to dashboard
          </Link>
          <h1 className="text-3xl font-extrabold text-zinc-900">Minutes Formatter</h1>
          <p className="mt-1 text-zinc-600">
            Paste your Otter transcript to generate AI-written formal minutes. Review and refine them before downloading.
          </p>
        </header>

        <InlineNoticeBanner notice={notice} className="mb-6" />

        <section className="mb-8 rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
          <div className="border-b border-zinc-200 px-6 py-4">
            <h2 className="text-xl font-semibold">Input</h2>
          </div>
          <div className="space-y-4 px-6 py-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <input
                type="text"
                value={meetingTitle}
                onChange={(e) => setMeetingTitle(e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2"
                placeholder="Meeting title"
              />
              <input
                type="text"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2"
                placeholder="Date e.g. 24/07/2026"
              />
            </div>

            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={12}
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              placeholder="Paste Otter transcript here..."
            />

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void generateMinutes()}
                disabled={aiLoading}
                className="rounded-md bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {aiLoading ? 'Generating...' : 'Generate Minutes'}
              </button>
              <button
                type="button"
                onClick={copyMinutes}
                disabled={!generated}
                className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                Copy to Clipboard
              </button>
              <button
                type="button"
                onClick={downloadAsDocx}
                disabled={!generated || downloadingDocx}
                className="rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {downloadingDocx ? 'Generating...' : 'Download Minutes'}
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="rounded-md border border-zinc-300 px-4 py-2 font-medium text-zinc-700 hover:bg-zinc-100"
              >
                Clear
              </button>
            </div>
          </div>
        </section>

        {generated && (
          <>
            <section className="mb-8 rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
              <div className="border-b border-zinc-200 px-6 py-4">
                <h2 className="text-xl font-semibold">Add to Action Tracker</h2>
              </div>
              <div className="space-y-4 px-6 py-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <p className="text-sm text-zinc-600">
                    Select actions from the generated minutes to add to the tracker.
                  </p>
                  <select
                    value={actionMeetingId ?? ''}
                    onChange={(e) => setActionMeetingId(e.target.value || null)}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2"
                  >
                    <option value="">Link to meeting (optional)</option>
                    {meetings.map((m) => (
                      <option key={m.id} value={m.id}>
                        {new Date(m.meeting_date).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })}
                      </option>
                    ))}
                  </select>
                </div>

                {actionCandidates.length === 0 ? (
                  <p className="text-sm text-zinc-500">No action candidates detected from the transcript.</p>
                ) : (
                  <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border border-zinc-200 p-3">
                    {actionCandidates.map((candidate) => (
                      <label key={candidate.id} className="flex items-start gap-2 rounded-md border border-zinc-100 p-2 text-sm text-zinc-700">
                        <input
                          type="checkbox"
                          checked={selectedActionIds.has(candidate.id)}
                          onChange={() => toggleActionSelection(candidate.id)}
                          className="mt-1"
                        />
                        <span className="whitespace-pre-wrap">{candidate.description}</span>
                      </label>
                    ))}
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={addSelectedToActionTracker}
                    disabled={addingActions || actionCandidates.length === 0}
                    className="rounded-md bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {addingActions ? 'Adding...' : 'Add selected to Action Tracker'}
                  </button>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-zinc-900">Preview</h2>
              <textarea
                value={editableMinutes || minutesText}
                onChange={(e) => setEditableMinutes(e.target.value)}
                rows={28}
                className="w-full rounded-lg border border-zinc-200 bg-white p-4 font-mono text-sm text-zinc-800"
              />

              {/* AI Refine panel */}
              <div className="rounded-lg border border-zinc-200 bg-white p-4">
                <h3 className="text-base font-semibold text-zinc-900">Refine with AI</h3>
                <p className="mt-1 text-sm text-zinc-600">
                  Describe the changes you'd like — e.g. "Expand the treasury section", "Make the language more formal", "Add a stronger closing statement".
                </p>
                <textarea
                  value={editRequest}
                  onChange={(e) => setEditRequest(e.target.value)}
                  rows={3}
                  className="mt-3 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  placeholder="Describe your changes..."
                />
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void improveWithAI()}
                    disabled={aiLoading || !editableMinutes.trim()}
                    className="rounded-md bg-violet-600 px-4 py-2 font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                  >
                    {aiLoading ? 'Refining...' : 'Refine with AI'}
                  </button>
                </div>
              </div>

              {/* AI writing suggestions */}
              {aiSuggestions.length > 0 && (
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
                  <h3 className="mb-2 text-sm font-semibold text-blue-900">AI Suggestions</h3>
                  <ul className="space-y-1">
                    {aiSuggestions.map((s, i) => (
                      <li key={i} className="text-sm text-blue-800">• {s}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="rounded-lg border border-zinc-200 bg-white p-4">
                <h3 className="text-base font-semibold text-zinc-900">Save to Minutes Library</h3>
                <p className="mt-1 text-sm text-zinc-600">Upload the generated minutes document to your library with optional meeting link.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <select
                    value={saveMeetingId ?? ''}
                    onChange={(e) => setSaveMeetingId(e.target.value || null)}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2"
                  >
                    <option value="">Link to meeting (optional)</option>
                    {meetings.map((m) => (
                      <option key={m.id} value={m.id}>
                        {new Date(m.meeting_date).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => void saveDraftToMinutesLibrary()}
                    disabled={savingMinutesDoc}
                    className="rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {savingMinutesDoc ? 'Saving...' : 'Save & Upload Minutes'}
                  </button>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
