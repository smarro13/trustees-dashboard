const MONTHS: Record<string, number> = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

// Best-effort extraction of a date embedded in a free-text minutes title,
// e.g. "Aldwinians Management Meeting - 25th December 2025".
export const extractDateFromTitle = (title: string | null | undefined): Date | null => {
  if (!title) return null;

  // "25th December 2025" / "25 December 2025"
  const dayMonthYear = title.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/);
  if (dayMonthYear) {
    const month = MONTHS[dayMonthYear[2].toLowerCase()];
    if (month !== undefined) {
      const date = new Date(parseInt(dayMonthYear[3], 10), month, parseInt(dayMonthYear[1], 10));
      if (!isNaN(date.getTime())) return date;
    }
  }

  // "December 25th, 2025" / "December 25 2025"
  const monthDayYear = title.match(/([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/);
  if (monthDayYear) {
    const month = MONTHS[monthDayYear[1].toLowerCase()];
    if (month !== undefined) {
      const date = new Date(parseInt(monthDayYear[3], 10), month, parseInt(monthDayYear[2], 10));
      if (!isNaN(date.getTime())) return date;
    }
  }

  // Numeric "25/12/2025", "25-12-2025", "25.12.2025"
  const numeric = title.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (numeric) {
    const date = new Date(parseInt(numeric[3], 10), parseInt(numeric[2], 10) - 1, parseInt(numeric[1], 10));
    if (!isNaN(date.getTime())) return date;
  }

  // ISO "2025-12-25"
  const iso = title.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const date = new Date(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10));
    if (!isNaN(date.getTime())) return date;
  }

  // Fallback: a bare year, e.g. "2026 AGM Minutes" -> 1 Jan of that year
  const yearOnly = title.match(/\b(19|20)\d{2}\b/);
  if (yearOnly) {
    const date = new Date(parseInt(yearOnly[0], 10), 0, 1);
    if (!isNaN(date.getTime())) return date;
  }

  return null;
};

// Sorts minutes rows by the date parsed out of their title (newest first),
// falling back to created_at when no date can be found in the title.
export const sortMinutesByTitleDate = <T extends { title?: string | null; created_at?: string | null }>(
  minutes: T[]
): T[] => {
  return [...minutes].sort((a, b) => {
    const dateA = extractDateFromTitle(a.title)?.getTime() ?? (a.created_at ? new Date(a.created_at).getTime() : 0);
    const dateB = extractDateFromTitle(b.title)?.getTime() ?? (b.created_at ? new Date(b.created_at).getTime() : 0);
    return dateB - dateA;
  });
};
