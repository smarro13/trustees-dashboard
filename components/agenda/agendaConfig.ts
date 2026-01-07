export type AgendaSectionKey =
  | 'apologies'
  | 'minutes'
  | 'actions'
  | 'correspondence'
  | 'safeguarding'
  | 'conflicts'
  | 'treasury'
  | 'trading'
  | 'events'
  | 'membership'
  | 'rugby_reports'
  | 'matters_arising'
  | 'aob';

export type AgendaSectionDef = {
  key: AgendaSectionKey;
  label: string;
  href: string;          // where to edit
  emptyText: string;     // what to show if no records
};

export const AGENDA_SECTIONS: AgendaSectionDef[] = [
  { key: 'apologies', label: 'Apologies', href: '/agenda/apologies', emptyText: 'No apologies.' },
  { key: 'minutes', label: 'Previous Minutes', href: '/agenda/minutes', emptyText: 'No minutes recorded.' },
  { key: 'actions', label: 'Action Tracker', href: '/agenda/actions', emptyText: 'No actions.' },
  { key: 'correspondence', label: 'Correspondence', href: '/agenda/correspondence', emptyText: 'No correspondence.' },
  { key: 'safeguarding', label: 'Safeguarding', href: '/agenda/safeguarding', emptyText: 'No safeguarding updates.' },
  { key: 'conflicts', label: 'Conflicts of Interest', href: '/agenda/conflicts', emptyText: 'No conflicts declared.' },
  { key: 'treasury', label: 'Treasury', href: '/agenda/treasury', emptyText: 'No treasury report.' },
  { key: 'trading', label: 'Trading Report', href: '/agenda/trading', emptyText: 'No trading report.' },
  { key: 'events', label: 'Events', href: '/agenda/events', emptyText: 'No event updates.' },
  { key: 'membership', label: 'Membership Report', href: '/agenda/membership', emptyText: 'No membership update.' },
  { key: 'rugby_reports', label: 'Rugby Reports', href: '/agenda/rugby', emptyText: 'No rugby updates.' },
  { key: 'matters_arising', label: 'Matters Arising', href: '/agenda/matters-arising', emptyText: 'No matters arising.' },
  { key: 'aob', label: 'AOB', href: '/agenda/aob', emptyText: 'No AOB items.' },
];
