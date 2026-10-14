// Board meetings are held on the second Wednesday of each month.

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD for a calendar date, without timezone shifts. */
export const toDateKey = (year: number, month: number, day: number) =>
  `${year}-${pad(month + 1)}-${pad(day)}`;

/** Day of the month (1-31) of the second Wednesday of the given month (0-11). */
export const secondWednesdayDay = (year: number, month: number) => {
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay(); // 0 = Sunday
  const firstWednesday = 1 + ((3 - firstWeekday + 7) % 7);
  return firstWednesday + 7;
};

/**
 * The next `count` second-Wednesday dates on or after `from`, as YYYY-MM-DD.
 * If this month's second Wednesday has already passed, the list starts next month.
 */
export const nextSecondWednesdays = (from: Date, count: number): string[] => {
  const todayKey = toDateKey(from.getFullYear(), from.getMonth(), from.getDate());
  const dates: string[] = [];
  let year = from.getFullYear();
  let month = from.getMonth();

  while (dates.length < count) {
    const key = toDateKey(year, month, secondWednesdayDay(year, month));
    if (key >= todayKey) dates.push(key);
    month += 1;
    if (month === 12) { month = 0; year += 1; }
  }
  return dates;
};

/** Today's date as YYYY-MM-DD in the viewer's local time. */
export const todayKey = () => {
  const now = new Date();
  return toDateKey(now.getFullYear(), now.getMonth(), now.getDate());
};
