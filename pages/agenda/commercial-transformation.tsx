import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import { User } from '@supabase/supabase-js';
import InlineNoticeBanner, { type InlineNotice } from '../../components/InlineNotice';

type UploadedAsset = {
	name: string;
	url: string;
};

type JobClubIdea = {
	id: string;
	area: string;
	job: string;
	status: 'Not Started' | 'Ongoing' | 'Completed';
	priority: 'High' | 'Medium' | 'Low';
};

type PadelVote = {
	id: string;
	voter_name: string;
	vote_yes: boolean;
	created_at: string;
};

const JOB_META_PREFIX = 'JOB_META:';
const PUBLIC_COMMERCIAL_SOURCE = '[Public] Commercial & Transformation';

const parseJobClubIdea = (row: any): JobClubIdea | null => {
	const description: string | null = row?.description ?? null;
	if (!description) return null;

	const firstLine = description.split('\n')[0]?.trim() || '';
	if (!firstLine.startsWith(JOB_META_PREFIX)) return null;

	try {
		const parsed = JSON.parse(firstLine.replace(JOB_META_PREFIX, '').trim()) as Partial<JobClubIdea>;
		if (!parsed.area || !parsed.job || !parsed.status || !parsed.priority) return null;
		return {
			id: row.id,
			area: parsed.area,
			job: parsed.job,
			status: parsed.status,
			priority: parsed.priority,
		};
	} catch {
		return null;
	}
};

const asUploadedAssets = (value: unknown): UploadedAsset[] => {
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => {
			if (!item || typeof item !== 'object') return null;
			const candidate = item as { name?: unknown; url?: unknown };
			if (typeof candidate.name !== 'string' || typeof candidate.url !== 'string') return null;
			return { name: candidate.name, url: candidate.url };
		})
		.filter((item): item is UploadedAsset => Boolean(item));
};

const asStringArray = (value: unknown): string[] => {
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === 'string');
};

export default function CommercialTransformationPage() {
	const [activeTab, setActiveTab] = useState<'updates' | 'gym' | 'jobclub'>('updates');
	const [user, setUser] = useState<User | null>(null);
	const [meetings, setMeetings] = useState<any[]>([]);
	const [reports, setReports] = useState<any[]>([]);
	const [jobIdeas, setJobIdeas] = useState<JobClubIdea[]>([]);
	const [padelVotes, setPadelVotes] = useState<PadelVote[]>([]);

	const [period, setPeriod] = useState('');
	const [meetingId, setMeetingId] = useState<string | null>(null);
	const [monthlyUpdates, setMonthlyUpdates] = useState('');
	const [padelUpdates, setPadelUpdates] = useState('');
	const [otherAreasRequiredAttention, setOtherAreasRequiredAttention] = useState('');
	const [publishAttentionToPublic, setPublishAttentionToPublic] = useState(true);
	const [selectedJobClubIdeas, setSelectedJobClubIdeas] = useState<string[]>([]);
	const [files, setFiles] = useState<File[]>([]);

	const [saving, setSaving] = useState(false);
	const [shareUpdatingReportId, setShareUpdatingReportId] = useState<string | null>(null);
	const [linkingReportId, setLinkingReportId] = useState<string | null>(null);
	const [meetingSelectionByReport, setMeetingSelectionByReport] = useState<Record<string, string>>({});
	const [notice, setNotice] = useState<InlineNotice | null>(null);

	const showNotice = (type: InlineNotice['type'], message: string) => {
		setNotice({ type, message });
	};

	const selectedIdeasLabel = useMemo(() => {
		const selected = jobIdeas.filter((idea) => selectedJobClubIdeas.includes(idea.id));
		return selected.map((idea) => `${idea.area} - ${idea.job}`);
	}, [jobIdeas, selectedJobClubIdeas]);

	const meetingDateById = useMemo(() => {
		const map = new Map<string, string>();
		for (const meeting of meetings) {
			if (!meeting?.id || !meeting?.meeting_date) continue;
			map.set(
				meeting.id,
				new Date(meeting.meeting_date).toLocaleDateString('en-GB', {
					day: '2-digit',
					month: '2-digit',
					year: 'numeric',
				}),
			);
		}
		return map;
	}, [meetings]);

	const voteSummary = useMemo(() => {
		const yes = padelVotes.filter((vote) => vote.vote_yes).length;
		const no = padelVotes.length - yes;
		return { yes, no, total: padelVotes.length };
	}, [padelVotes]);

	const loadData = async () => {
		const [{ data: authData }, meetingsResult, reportsResult, jobsResult] = await Promise.all([
			supabase.auth.getUser(),
			supabase.from('meetings').select('id, meeting_date').order('meeting_date', { ascending: true }),
			supabase.from('commercial_transformation_updates').select('*').order('created_at', { ascending: false }),
			supabase
				.from('job_club_posts')
				.select('id, description, is_active, created_at')
				.eq('is_active', true)
				.order('created_at', { ascending: false })
				.limit(300),
		]);

		setUser(authData.user);
		setMeetings(meetingsResult.data || []);
		setReports(reportsResult.data || []);

		const accessToken = ((await supabase.auth.getSession()) as any)?.data?.session?.access_token as string | undefined;
		if (!accessToken) {
			setPadelVotes([]);
		} else {
			try {
				const votesResponse = await fetch('/api/private/padel-votes', {
					method: 'GET',
					headers: {
						Authorization: `Bearer ${accessToken}`,
					},
				});
				const payload = await votesResponse.json();
				if (votesResponse.ok && payload.ok && Array.isArray(payload.votes)) {
					setPadelVotes(payload.votes as PadelVote[]);
				} else {
					setPadelVotes([]);
				}
			} catch {
				setPadelVotes([]);
			}
		}

		const parsedIdeas = ((jobsResult.data || []) as any[])
			.map((row) => parseJobClubIdea(row))
			.filter((row): row is JobClubIdea => Boolean(row))
			.filter((row) => !row.area.toLowerCase().includes('gym'));
		setJobIdeas(parsedIdeas);
	};

	useEffect(() => {
		loadData();
	}, []);

	useEffect(() => {
		if (!notice) return;
		const timeout = window.setTimeout(() => setNotice(null), 4500);
		return () => window.clearTimeout(timeout);
	}, [notice]);

	const toggleJobIdea = (id: string) => {
		setSelectedJobClubIdeas((current) =>
			current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
		);
	};

	const uploadAttachments = async (): Promise<UploadedAsset[]> => {
		if (!files.length) return [];

		const uploaded: UploadedAsset[] = [];

		for (const file of files) {
			const filePath = `commercial-transformation/${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${file.name.replace(/\s+/g, '-')}`;
			const { error: uploadError } = await supabase.storage
				.from('minutes')
				.upload(filePath, file, { upsert: false, cacheControl: '3600' });

			if (uploadError) {
				throw new Error(uploadError.message);
			}

			const { data } = supabase.storage.from('minutes').getPublicUrl(filePath);
			uploaded.push({ name: file.name, url: data.publicUrl });
		}

		return uploaded;
	};

	const saveReport = async () => {
		if (!period.trim()) {
			showNotice('error', 'Please enter a reporting period.');
			return;
		}

		if (!monthlyUpdates.trim()) {
			showNotice('error', 'Please add monthly updates.');
			return;
		}

		if (!user) {
			showNotice('error', 'You must be logged in to save.');
			return;
		}

		setSaving(true);

		try {
			const uploadedAssets = await uploadAttachments();

			const { error: insertError } = await supabase.from('commercial_transformation_updates').insert({
				reporting_period: period.trim(),
				meeting_id: meetingId,
				monthly_updates: monthlyUpdates.trim(),
				padel_updates: padelUpdates.trim() || null,
				other_areas_required_attention: otherAreasRequiredAttention.trim() || null,
				attachments: uploadedAssets,
				selected_job_club_ideas: selectedIdeasLabel,
				user_id: user.id,
			});

			if (insertError) {
				showNotice('error', `Failed to save report: ${insertError.message}`);
				setSaving(false);
				return;
			}

			if (publishAttentionToPublic && otherAreasRequiredAttention.trim()) {
				const { error: publicError } = await supabase.from('action_items').insert({
					title: `Commercial & Transformation: Other areas requiring attention (${period.trim()})`,
					description: otherAreasRequiredAttention.trim(),
					owner: null,
					due_date: null,
					meeting_id: meetingId,
					source: PUBLIC_COMMERCIAL_SOURCE,
					status: 'Open',
					created_by: user.email || user.id,
				});

				if (publicError) {
					showNotice('error', `Saved report, but failed to publish public attention item: ${publicError.message}`);
					setSaving(false);
					await loadData();
					return;
				}
			}

			setPeriod('');
			setMeetingId(null);
			setMonthlyUpdates('');
			setPadelUpdates('');
			setOtherAreasRequiredAttention('');
			setSelectedJobClubIdeas([]);
			setFiles([]);

			await loadData();
			showNotice('success', 'Commercial & Transformation update saved.');
		} catch (error) {
			showNotice('error', error instanceof Error ? error.message : 'Failed to save update.');
		}

		setSaving(false);
	};

	const addReportToMeeting = async (reportId: string) => {
		const selectedMeetingId = meetingSelectionByReport[reportId];
		if (!selectedMeetingId) {
			showNotice('error', 'Please select a meeting first.');
			return;
		}

		setLinkingReportId(reportId);
		const { error } = await supabase
			.from('commercial_transformation_updates')
			.update({ meeting_id: selectedMeetingId })
			.eq('id', reportId);

		if (error) {
			showNotice('error', `Failed to add update to meeting: ${error.message}`);
			setLinkingReportId(null);
			return;
		}

		await loadData();
		showNotice('success', 'Update added to meeting.');
		setLinkingReportId(null);
	};

	const setPadelPublicShare = async (reportId: string, nextValue: boolean) => {
		setShareUpdatingReportId(reportId);
		const { error } = await supabase
			.from('commercial_transformation_updates')
			.update({ share_padel_to_public: nextValue })
			.eq('id', reportId);

		if (error) {
			showNotice('error', `Failed to update public share setting: ${error.message}`);
			setShareUpdatingReportId(null);
			return;
		}

		await loadData();
		showNotice('success', nextValue ? 'Padel update shared to public page.' : 'Padel update hidden from public page.');
		setShareUpdatingReportId(null);
	};

	return (
		<main className="min-h-screen">
			<div className="mx-auto w-full max-w-[1200px] px-4 py-10">
				<header className="mb-8">
					<Link
						href="/"
						className="mb-3 inline-block text-sm font-medium text-blue-600 hover:underline"
					>
						← Back to dashboard
					</Link>

					<h1 className="text-3xl font-extrabold text-zinc-900">Commercial & Transformation</h1>
					<p className="mt-1 text-zinc-600">Manage updates/issues, gym updates, and Job Club from one place.</p>
				</header>

				<InlineNoticeBanner notice={notice} className="mb-6" />

				<section className="mb-6 rounded-lg border border-zinc-200 bg-zinc-50 p-2">
					<div className="grid gap-2 sm:grid-cols-3">
						<button
							type="button"
							onClick={() => setActiveTab('updates')}
							className={`rounded-md px-4 py-2 text-sm font-medium transition ${activeTab === 'updates' ? 'bg-red-600 text-white' : 'bg-white text-zinc-700 hover:bg-zinc-100'}`}
						>
							Updates / Issues
						</button>
						<button
							type="button"
							onClick={() => setActiveTab('gym')}
							className={`rounded-md px-4 py-2 text-sm font-medium transition ${activeTab === 'gym' ? 'bg-red-600 text-white' : 'bg-white text-zinc-700 hover:bg-zinc-100'}`}
						>
							Gym Updates
						</button>
						<button
							type="button"
							onClick={() => setActiveTab('jobclub')}
							className={`rounded-md px-4 py-2 text-sm font-medium transition ${activeTab === 'jobclub' ? 'bg-red-600 text-white' : 'bg-white text-zinc-700 hover:bg-zinc-100'}`}
						>
							Job Club
						</button>
					</div>
				</section>

				{activeTab === 'updates' && (
					<>

				<section className="mb-10 rounded-lg bg-white shadow-sm ring-1 ring-zinc-200">
					<div className="border-b border-zinc-200 px-6 py-4">
						<h2 className="text-xl font-semibold">Add update</h2>
					</div>

					<div className="space-y-5 px-6 py-6">
						<div className="grid gap-4 sm:grid-cols-2">
							<input
								type="text"
								value={period}
								onChange={(e) => setPeriod(e.target.value)}
								placeholder="Reporting period (e.g. July 2026)"
								className="w-full rounded-md border border-zinc-300 px-3 py-2"
							/>

							<select
								value={meetingId ?? ''}
								onChange={(e) => setMeetingId(e.target.value || null)}
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

						<div>
							<label className="mb-1 block text-sm font-medium text-zinc-700">Monthly Updates</label>
							<textarea
								value={monthlyUpdates}
								onChange={(e) => setMonthlyUpdates(e.target.value)}
								rows={6}
								className="w-full rounded-md border border-zinc-300 px-3 py-2"
								placeholder="Free text monthly commercial/transformation updates"
							/>
						</div>

						<div>
							<label className="mb-1 block text-sm font-medium text-zinc-700">Upload Items</label>
							<div className="flex flex-wrap items-center gap-3">
								<label
									htmlFor="commercial-upload-items"
									className="inline-flex items-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 cursor-pointer"
								>
									Choose files
								</label>
								<input
									id="commercial-upload-items"
									type="file"
									multiple
									accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
									onChange={(e) => setFiles(Array.from(e.target.files || []))}
									className="hidden"
								/>
								<span className="text-sm text-zinc-600">
									{files.length > 0 ? `${files.length} file${files.length === 1 ? '' : 's'} selected` : 'No file chosen'}
								</span>
							</div>
							{files.length > 0 && (
								<ul className="mt-2 space-y-1 text-sm text-zinc-600">
									{files.map((file) => (
										<li key={`${file.name}-${file.lastModified}`}>{file.name}</li>
									))}
								</ul>
							)}
						</div>

						<div>
							<label className="mb-1 block text-sm font-medium text-zinc-700">Other Areas Required for Attention</label>
							<textarea
								value={otherAreasRequiredAttention}
								onChange={(e) => setOtherAreasRequiredAttention(e.target.value)}
								rows={5}
								className="w-full rounded-md border border-zinc-300 px-3 py-2"
								placeholder="Free text for areas requiring attention"
							/>
							<label className="mt-2 inline-flex items-center gap-2 text-sm text-zinc-700">
								<input
									type="checkbox"
									checked={publishAttentionToPublic}
									onChange={(e) => setPublishAttentionToPublic(e.target.checked)}
								/>
								Publish this attention note to the members public actions page
							</label>
						</div>

						<div>
							<label className="mb-1 block text-sm font-medium text-zinc-700">Padel</label>
							<textarea
								value={padelUpdates}
								onChange={(e) => setPadelUpdates(e.target.value)}
								rows={4}
								className="w-full rounded-md border border-zinc-300 px-3 py-2"
								placeholder="Free text for padel updates"
							/>
							<p className="mt-2 text-sm text-zinc-600">
								Need to test or share voting quickly?{' '}
								<Link href="/public/padel-vote-test" target="_blank" className="font-medium text-blue-600 hover:underline">
									Open public Padel vote page
								</Link>
							</p>
						</div>

						<div>
							<p className="mb-2 text-sm font-medium text-zinc-700">Optional Job Club Transformation Ideas/Streams (non-gym)</p>
							<div className="max-h-56 space-y-2 overflow-y-auto rounded-md border border-zinc-200 p-3">
								{jobIdeas.length === 0 ? (
									<p className="text-sm text-zinc-500">No non-gym Job Club transformation ideas available.</p>
								) : (
									jobIdeas.map((idea) => (
										<label key={idea.id} className="flex items-start gap-2 text-sm text-zinc-700">
											<input
												type="checkbox"
												checked={selectedJobClubIdeas.includes(idea.id)}
												onChange={() => toggleJobIdea(idea.id)}
												className="mt-0.5"
											/>
											<span>
												<strong>{idea.area}</strong> - {idea.job}
												<span className="ml-1 text-xs text-zinc-500">({idea.status}, {idea.priority})</span>
											</span>
										</label>
									))
								)}
							</div>
						</div>

						<div className="flex justify-end">
							<button
								type="button"
								onClick={saveReport}
								disabled={saving}
								className="rounded-md bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
							>
								{saving ? 'Saving...' : 'Save Update'}
							</button>
						</div>
					</div>
				</section>

				<section className="space-y-4">
					<h2 className="text-xl font-semibold text-zinc-900">Recent Commercial & Transformation updates</h2>
					{reports.length === 0 ? (
						<p className="text-sm text-zinc-500">No updates saved yet.</p>
					) : (
						reports.map((report) => {
							const attachments = asUploadedAssets(report.attachments);
							const selectedIdeas = asStringArray(report.selected_job_club_ideas);
							const linkedMeetingDate = report.meeting_id ? meetingDateById.get(report.meeting_id) : null;
							const selectedMeetingForReport = meetingSelectionByReport[report.id] || '';

							return (
								<article key={report.id} className="rounded-lg border border-zinc-200 bg-white p-4">
									<h3 className="text-lg font-semibold text-zinc-900">
										{report.reporting_period}
									</h3>
									<div className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
										<p>
											<span className="font-semibold">Meeting:</span>{' '}
											{linkedMeetingDate || 'Not linked'}
										</p>
										{!linkedMeetingDate && (
											<div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
												<select
													value={selectedMeetingForReport}
													onChange={(e) =>
														setMeetingSelectionByReport((current) => ({
															...current,
															[report.id]: e.target.value,
														}))
													}
													className="w-full rounded-md border border-zinc-300 px-3 py-2 sm:w-auto"
												>
													<option value="">Select meeting</option>
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
													onClick={() => addReportToMeeting(report.id)}
													disabled={linkingReportId === report.id}
													className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
												>
													{linkingReportId === report.id ? 'Adding...' : 'Add to meeting'}
												</button>
											</div>
										)}
									</div>
									{report.monthly_updates && (
										<p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{report.monthly_updates}</p>
									)}
									{report.padel_updates && (
										<div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
											<p className="whitespace-pre-wrap">
												<span className="font-semibold">Padel:</span>
												<br />
												{report.padel_updates}
											</p>
											<div className="mt-3 flex flex-wrap items-center gap-2">
												<span className={`rounded-full px-2 py-1 text-xs font-medium ${report.share_padel_to_public ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-200 text-zinc-700'}`}>
													{report.share_padel_to_public ? 'Shared on public page' : 'Private only'}
												</span>
												<button
													type="button"
													onClick={() => setPadelPublicShare(report.id, !report.share_padel_to_public)}
													disabled={shareUpdatingReportId === report.id}
													className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
												>
													{shareUpdatingReportId === report.id
														? 'Saving...'
														: report.share_padel_to_public
															? 'Hide from public page'
															: 'Share to public page'}
												</button>
											</div>
										</div>
									)}
									{report.other_areas_required_attention && (
										<p className="mt-3 whitespace-pre-wrap text-sm text-zinc-700">
											<span className="font-semibold">Other areas required for attention:</span>
											<br />
											{report.other_areas_required_attention}
										</p>
									)}
									{selectedIdeas.length > 0 && (
										<div className="mt-3 text-sm text-zinc-700">
											<p className="font-semibold">Linked Job Club ideas/streams:</p>
											<ul className="mt-1 list-disc pl-5">
												{selectedIdeas.map((idea) => (
													<li key={`${report.id}-${idea}`}>{idea}</li>
												))}
											</ul>
										</div>
									)}
									{attachments.length > 0 && (
										<div className="mt-3 text-sm text-zinc-700">
											<p className="font-semibold">Uploaded items:</p>
											<ul className="mt-1 list-disc pl-5">
												{attachments.map((asset) => (
													<li key={`${report.id}-${asset.url}`}>
														<a href={asset.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
															{asset.name}
														</a>
													</li>
												))}
											</ul>
										</div>
									)}
								</article>
							);
						})
					)}
				</section>

				<section className="space-y-4">
					<h2 className="text-xl font-semibold text-zinc-900">Padel Vote Responses (Private)</h2>
					<div className="rounded-lg border border-zinc-200 bg-white p-4">
						<div className="grid gap-3 sm:grid-cols-3">
							<div className="rounded-md bg-zinc-50 p-3">
								<p className="text-xs uppercase tracking-wide text-zinc-500">Total votes</p>
								<p className="mt-1 text-2xl font-semibold text-zinc-900">{voteSummary.total}</p>
							</div>
							<div className="rounded-md bg-emerald-50 p-3">
								<p className="text-xs uppercase tracking-wide text-emerald-700">Yes</p>
								<p className="mt-1 text-2xl font-semibold text-emerald-800">{voteSummary.yes}</p>
							</div>
							<div className="rounded-md bg-rose-50 p-3">
								<p className="text-xs uppercase tracking-wide text-rose-700">No</p>
								<p className="mt-1 text-2xl font-semibold text-rose-800">{voteSummary.no}</p>
							</div>
						</div>

						{padelVotes.length === 0 ? (
							<p className="mt-4 text-sm text-zinc-500">No votes submitted yet.</p>
						) : (
							<div className="mt-4 overflow-x-auto">
								<table className="min-w-full divide-y divide-zinc-200 text-sm">
									<thead>
										<tr>
											<th className="px-3 py-2 text-left font-semibold text-zinc-700">Member name</th>
											<th className="px-3 py-2 text-left font-semibold text-zinc-700">Vote</th>
											<th className="px-3 py-2 text-left font-semibold text-zinc-700">Submitted</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-zinc-100">
										{padelVotes.map((vote) => (
											<tr key={vote.id}>
												<td className="px-3 py-2 text-zinc-800">{vote.voter_name}</td>
												<td className="px-3 py-2">
													<span className={`rounded-full px-2 py-1 text-xs font-medium ${vote.vote_yes ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
														{vote.vote_yes ? 'Yes' : 'No'}
													</span>
												</td>
												<td className="px-3 py-2 text-zinc-600">
													{new Date(vote.created_at).toLocaleString('en-GB')}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</div>
				</section>
					</>
				)}

				{activeTab === 'gym' && (
					<section className="space-y-4">
						<div className="rounded-lg border border-zinc-200 bg-white p-4">
							<div className="mb-3 flex items-center justify-between gap-3">
								<h2 className="text-xl font-semibold text-zinc-900">Gym Updates</h2>
								<Link href="/agenda/gym" className="text-sm font-medium text-blue-600 hover:underline">
									Open full page
								</Link>
							</div>
							<iframe
								title="Gym Updates"
								src="/agenda/gym?embedded=1"
								className="h-[1700px] w-full rounded-md border border-zinc-200"
							/>
						</div>
					</section>
				)}

				{activeTab === 'jobclub' && (
					<section className="space-y-4">
						<div className="rounded-lg border border-zinc-200 bg-white p-4">
							<div className="mb-3 flex items-center justify-between gap-3">
								<h2 className="text-xl font-semibold text-zinc-900">Job Club</h2>
								<Link href="/agenda/job-club" className="text-sm font-medium text-blue-600 hover:underline">
									Open full page
								</Link>
							</div>
							<iframe
								title="Job Club"
								src="/agenda/job-club?embedded=1"
								className="h-[1800px] w-full rounded-md border border-zinc-200"
							/>
						</div>
					</section>
				)}
			</div>
		</main>
	);
}
