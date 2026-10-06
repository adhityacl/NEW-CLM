import { DocumentCalendar, type DocumentCalendarProps } from './DocumentCalendar';
import type { CalendarEvent } from './eventTypes';

/** Example data only. The workspace calendar uses its existing query cache. */
export const EXAMPLE_CALENDAR_EVENTS: CalendarEvent[] = [
  { id: '1', type: 'contract_start', date: '2026-01-12', title: 'Atlas service agreement', documentId: 'atlas' },
  { id: '2', type: 'task', date: '2026-02-03', title: 'Review insurance certificate', status: 'open' },
  { id: '3', type: 'task', date: '2026-02-03', title: 'Legal approval received', status: 'done' },
  { id: '4', type: 'renewal', date: '2026-03-01', title: 'Cloud hosting agreement', documentId: 'cloud' },
  { id: '5', type: 'cancellation_notice', date: '2026-04-16', title: 'Office lease', documentId: 'lease' },
  { id: '6', type: 'contract_end', date: '2026-05-31', title: 'Pilot campaign', documentId: 'pilot' },
  { id: '7', type: 'contract_start', date: '2026-06-12', title: 'Media placement', documentId: 'media' },
  { id: '8', type: 'cancellation_notice', date: '2026-06-12', title: 'Consulting agreement', documentId: 'consulting' },
  { id: '9', type: 'contract_end', date: '2026-06-12', title: 'Support subscription', documentId: 'support' },
  { id: '10', type: 'renewal', date: '2026-06-12', title: 'Logistics partnership', documentId: 'logistics' },
  { id: '11', type: 'termination', date: '2026-06-12', title: 'Legacy supplier', documentId: 'legacy' },
  { id: '12', type: 'task', date: '2026-06-15', title: 'Send signed addendum', status: 'open' },
  { id: '13', type: 'contract_start', date: '2026-07-01', title: 'Distribution agreement', documentId: 'distribution' },
  { id: '14', type: 'task', date: '2026-08-21', title: 'Quarterly compliance review', status: 'open' },
  { id: '15', type: 'renewal', date: '2026-09-30', title: 'Analytics licence', documentId: 'analytics' },
  { id: '16', type: 'contract_end', date: '2026-10-09', title: 'Equipment rental', documentId: 'rental' },
  { id: '17', type: 'termination', date: '2026-11-18', title: 'Regional vendor agreement', documentId: 'regional' },
  { id: '18', type: 'task', date: '2026-12-14', title: 'Prepare annual contract report', status: 'done' },
];

/** Render inside the application's language and tenant-settings providers. */
export function DocumentCalendarExample({ onEventClick, onRangeChange }: Pick<DocumentCalendarProps, 'onEventClick' | 'onRangeChange'>) {
  return <DocumentCalendar events={EXAMPLE_CALENDAR_EVENTS} initialDate={new Date(2026, 0, 1)} onEventClick={onEventClick} onRangeChange={onRangeChange} />;
}
