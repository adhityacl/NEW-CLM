import React from 'react';
import { GoogleSheetsConfig } from '../types';

interface SyncNotificationBannerProps {
  googleConfig: GoogleSheetsConfig;
  onNavigateToSettings: () => void;
}

export interface SyncEngineStatusData {
  state: 'idle' | 'buffering' | 'syncing' | 'synced' | 'error' | 'unlocked_warning' | 'not_configured';
  message: string;
  isLocked: boolean;
  spreadsheetId?: string;
  pendingOpsCount: number;
  totalOpsProcessed: number;
  totalSyncedBatches: number;
  lastSyncTime?: string;
  lastError?: string;
  rateLimitPerMin: number;
}

export const SyncNotificationBanner: React.FC<SyncNotificationBannerProps> = () => {
  return null;
};
