// Fireworks volunteer task list (/public/fireworks): like Job Club, but behind
// an access code. Tasks live in public.fireworks_tasks, which no browser can
// read or write directly (supabase/policies/fireworks_tasks.sql); everything
// goes through pages/api/public/fireworks.ts, which checks the code first.

export type FireworksStatus = 'Not Started' | 'Ongoing' | 'Completed';
export type FireworksPriority = 'High' | 'Medium' | 'Low';

export const FIREWORKS_STATUSES: FireworksStatus[] = ['Not Started', 'Ongoing', 'Completed'];
export const FIREWORKS_PRIORITIES: FireworksPriority[] = ['High', 'Medium', 'Low'];

export type FireworksTask = {
  id: string;
  area: string;
  task: string;
  status: FireworksStatus;
  priority: FireworksPriority;
  needs: string; // equipment, materials, number of people
  assigned_to: string | null;
  assigned_notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

// The values a volunteer can set when adding or editing a task.
export type FireworksTaskValues = Pick<FireworksTask, 'area' | 'task' | 'status' | 'priority' | 'needs'>;

// Sent by the page with every request, and kept in the browser so volunteers
// only type it once.
export const FIREWORKS_CODE_HEADER = 'x-fireworks-code';
export const FIREWORKS_CODE_STORAGE_KEY = 'fireworks-access-code';

export const isValidTaskValues = (values: unknown): values is FireworksTaskValues => {
  if (!values || typeof values !== 'object') return false;
  const v = values as Partial<FireworksTaskValues>;
  return (
    typeof v.area === 'string' && v.area.trim().length > 0 &&
    typeof v.task === 'string' && v.task.trim().length > 0 &&
    typeof v.needs === 'string' &&
    FIREWORKS_STATUSES.includes(v.status as FireworksStatus) &&
    FIREWORKS_PRIORITIES.includes(v.priority as FireworksPriority)
  );
};

export const cleanTaskValues = (v: FireworksTaskValues): FireworksTaskValues => ({
  area: v.area.trim(),
  task: v.task.trim(),
  status: v.status,
  priority: v.priority,
  needs: v.needs.trim(),
});
