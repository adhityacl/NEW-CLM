export type EventType = 'contract_start' | 'cancellation_notice' | 'contract_end' | 'renewal' | 'termination' | 'task';
export type CalendarView = 'year' | 'month';

export interface CalendarEvent {
  id: string;
  type: EventType;
  /** A business date, never an instant in UTC. */
  date: string;
  title: string;
  documentId?: string;
  documentKind?: 'contract' | 'io';
  status?: 'open' | 'done';
  projected?: boolean;
}

/** One palette for indicators, chips, filters and the legend, in both themes. */
export const EVENT_TYPE_CONFIG: Record<EventType, { labelKey: string; dot: string; chip: string }> = {
  contract_start: { labelKey: 'calendar.contract_start', dot: 'bg-blue-500', chip: 'bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200' },
  cancellation_notice: { labelKey: 'calendar.cancellation_notice', dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200' },
  contract_end: { labelKey: 'calendar.contract_end', dot: 'bg-red-500', chip: 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200' },
  renewal: { labelKey: 'calendar.renewal', dot: 'bg-green-500', chip: 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200' },
  termination: { labelKey: 'calendar.termination', dot: 'bg-slate-800 dark:bg-slate-300', chip: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200' },
  task: { labelKey: 'calendar.task', dot: 'text-teal-700 dark:text-teal-300', chip: 'bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-200' },
};

export const EVENT_TYPES = Object.keys(EVENT_TYPE_CONFIG) as EventType[];
