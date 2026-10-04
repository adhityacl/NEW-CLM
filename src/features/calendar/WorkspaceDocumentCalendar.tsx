import { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { useTenantSettings } from '../../context/TenantSettingsContext';
import { usePermissions } from '../../lib/permissions';
import type { Contract, InsertionOrder, Partner } from '../../types';
import { buildDocumentCalendarEvents } from './calendarModel';
import { DocumentCalendar } from './DocumentCalendar';
import type { CalendarEvent } from './eventTypes';

export function WorkspaceDocumentCalendar({ contracts, ios, partners, loading, error, onRetry, onOpenDocument }: {
  contracts: Contract[]; ios: InsertionOrder[]; partners: Partner[];
  loading?: boolean; error?: boolean; onRetry?: () => void;
  onOpenDocument: (kind: 'contract' | 'io', id: string) => void;
}) {
  const { user } = useAuth();
  const { activeTenantId } = useTenant();
  const { policy } = useTenantSettings();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const canView = !permissionsLoading && hasPermission('document.view');
  const commercialEnabled = policy.settings.modules.commercialDocuments;
  const events = useMemo(() => canView
    ? buildDocumentCalendarEvents(contracts, commercialEnabled ? ios : [], partners, user, activeTenantId)
    : [], [canView, contracts, commercialEnabled, ios, partners, user, activeTenantId]);
  const onEventClick = (event: CalendarEvent) => {
    if (canView && event.documentKind && event.documentId && events.some(item => item.id === event.id)) {
      onOpenDocument(event.documentKind, event.documentId);
    }
  };
  return <DocumentCalendar key={activeTenantId} events={events} loading={loading || permissionsLoading} error={error} onRetry={onRetry} onEventClick={onEventClick} />;
}
