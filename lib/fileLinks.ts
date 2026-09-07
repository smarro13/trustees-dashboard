// Browsers render PDFs natively but have no inline viewer for Word docs.
// Supabase Storage's public URLs support a `?download` query param that makes
// the server send Content-Disposition: attachment, which reliably triggers a
// save-to-disk instead of the browser failing to open a .doc/.docx inline.
export const getFileHref = (fileUrl: string | null | undefined): string => {
  if (!fileUrl) return '#';
  if (/\.pdf(\?|#|$)/i.test(fileUrl)) return fileUrl;

  const separator = fileUrl.includes('?') ? '&' : '?';
  return `${fileUrl}${separator}download`;
};
