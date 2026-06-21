export type InlineNotice = {
  type: 'success' | 'error' | 'info';
  message: string;
};

type InlineNoticeProps = {
  notice: InlineNotice | null;
  className?: string;
};

export default function InlineNoticeBanner({ notice, className = '' }: InlineNoticeProps) {
  if (!notice) {
    return null;
  }

  const toneClasses =
    notice.type === 'success'
      ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
      : notice.type === 'error'
        ? 'border border-rose-200 bg-rose-50 text-rose-800'
        : 'border border-blue-200 bg-blue-50 text-blue-800';

  return (
    <div className={`rounded-lg px-4 py-3 text-sm ${toneClasses} ${className}`.trim()}>
      {notice.message}
    </div>
  );
}
