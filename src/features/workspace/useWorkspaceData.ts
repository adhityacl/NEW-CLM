import { useCallback, useMemo, type SetStateAction } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { useLanguage } from '../../context/LanguageContext';
import { getAuthHeaders } from '../../lib/apiFetch';
import type { Contract, InsertionOrder, Partner, NotificationLog, GoogleSheetsConfig, PartnerEvaluation, PartnerSpending } from '../../types';

interface WorkspaceData {
  contracts: Contract[];
  ios: InsertionOrder[];
  partners: Partner[];
  notifications: NotificationLog[];
  evaluations: PartnerEvaluation[];
  spendings: PartnerSpending[];
  googleConfig: GoogleSheetsConfig;
  timestamp: number;
}

const EMPTY_DATA: WorkspaceData = {
  contracts: [], ios: [], partners: [], notifications: [], evaluations: [], spendings: [],
  googleConfig: {
    spreadsheetId: '178lap6p6jwuVlbrVp7jmrgvgpAPLYRgpPDkJvgc_EgM',
    driveFolderId: '1xiFIvgWdDtYEzL7IoqVD9d-NaS7XcfYp',
    isConnected: true, autoSync: true,
  },
  timestamp: Date.now(),
};

/** Query cache owns workspace records; UI state stays in the feature views. */
export function useWorkspaceData() {
  const { user } = useAuth();
  const { activeTenantId } = useTenant();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ['init-data', user?.email, activeTenantId], [user?.email, activeTenantId]);
  const query = useQuery<WorkspaceData>({
    queryKey,
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/init-data', {
        headers: { ...getAuthHeaders(), 'x-tenant-id': activeTenantId, 'x-organization-id': activeTenantId }, cache: 'no-store', signal,
      });
      if (!response.ok) throw new Error(t('app.failed_to_fetch_initial_data', 'Failed to fetch initial data'));
      const data = await response.json();
      const normalized = { ...EMPTY_DATA, ...data };
      for (const key of ['contracts', 'ios', 'partners', 'notifications', 'evaluations', 'spendings'] as const) {
        if (!Array.isArray(normalized[key])) normalized[key] = [];
      }
      normalized.googleConfig = data.googleConfig && typeof data.googleConfig === 'object' ? data.googleConfig : EMPTY_DATA.googleConfig;
      normalized.timestamp = data.timestamp || Date.now();
      return normalized;
    },
    enabled: Boolean(user?.email && activeTenantId),
    staleTime: 10_000,
  });

  const updateData = useCallback(<K extends keyof WorkspaceData>(key: K, action: SetStateAction<WorkspaceData[K]>) => {
    let previousValue: WorkspaceData[K];
    let optimisticValue: WorkspaceData[K];
    const updated = queryClient.setQueryData<WorkspaceData>(queryKey, previous => {
      const current = previous || EMPTY_DATA;
      const value = typeof action === 'function'
        ? (action as (value: WorkspaceData[K]) => WorkspaceData[K])(current[key])
        : action;
      previousValue = current[key];
      return { ...current, [key]: value };
    });
    optimisticValue = updated![key];
    // A failed request must not overwrite a newer edit or a successful server refresh.
    return () => queryClient.setQueryData<WorkspaceData>(queryKey, current =>
      current && current[key] === optimisticValue ? { ...current, [key]: previousValue } : current);
  }, [queryClient, queryKey]);

  const cancelPendingLoad = useCallback(() => queryClient.cancelQueries({ queryKey, exact: true }), [queryClient, queryKey]);
  const loadAllData = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey, exact: true });
  }, [queryClient, queryKey]);

  return { ...(query.data || EMPTY_DATA), updateData, cancelPendingLoad, loadAllData };
}
