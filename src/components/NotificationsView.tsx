import React, { useState, useMemo } from 'react';
import { getActiveFormattingLocale } from '../lib/currencyUtils';
import { NotificationLog } from '../types';
import {
  RefreshCw,
  CheckCheck,
  CheckCircle2,
  Trash2,
  Search,
  ArrowDown,
  ArrowUp,
  Inbox,
  SlidersHorizontal,
  Bell,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useConfirm } from '../context/ConfirmDialogContext';
import { getStatusBadgeClass } from './ui/badge';
import { TablePagination } from './ui/TablePagination';

interface NotificationsViewProps {
  notifications: NotificationLog[];
  onTriggerCheck: () => Promise<void>;
  onMarkRead?: (notifId?: string, markAll?: boolean) => Promise<void>;
  onDeleteNotif?: (notifId?: string, notifIds?: string[], deleteAll?: boolean) => Promise<void>;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  notifications,
  onTriggerCheck,
  onMarkRead,
  onDeleteNotif,
}) => {
  const { t, language } = useLanguage();
  const confirmDialog = useConfirm();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterTimeRange, setFilterTimeRange] = useState<string>('ALL');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [runningCron, setRunningCron] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);

  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    time: true,
    type: true,
    subject: true,
    message: true,
    recipient: false,
  });

  const toggleColumnVisibility = (col: string) => {
    setVisibleColumns((prev) => ({ ...prev, [col]: !prev[col] }));
  };

  const unreadCount = useMemo(() => notifications.filter((n) => !n.is_read).length, [notifications]);

  // Unique notification types for filter dropdown
  const typeOptions = useMemo(() => {
    const types = new Set<string>();
    notifications.forEach((n) => {
      if (n.jenis_notifikasi) types.add(n.jenis_notifikasi);
    });
    return Array.from(types).sort();
  }, [notifications]);

  const handleManualTrigger = async () => {
    setRunningCron(true);
    await onTriggerCheck();
    setTimeout(() => setRunningCron(false), 500);
  };

  const handleMarkAllRead = async () => {
    if (onMarkRead) {
      await onMarkRead(undefined, true);
    }
  };

  const handleMarkSingleRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onMarkRead) {
      await onMarkRead(id);
    }
  };

  const handleDeleteSingle = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirmDialog({
      description: t('notifications.confirm_delete', 'Hapus notifikasi ini?'),
      tone: 'danger',
    });
    if (ok) {
      if (onDeleteNotif) {
        await onDeleteNotif(id);
        setSelectedIds((prev) => prev.filter((item) => item !== id));
      }
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    const ok = await confirmDialog({
      description: t('notifications.confirm_delete_selected', 'Hapus notifikasi yang dipilih?'),
      tone: 'danger',
    });
    if (ok) {
      if (onDeleteNotif) {
        await onDeleteNotif(undefined, selectedIds);
        setSelectedIds([]);
      }
    }
  };

  const handleMarkSelectedRead = async () => {
    if (selectedIds.length === 0 || !onMarkRead) return;
    for (const id of selectedIds) {
      await onMarkRead(id);
    }
    setSelectedIds([]);
  };

  // Filter and Sort Notifications
  const filteredNotifications = useMemo(() => {
    let list = [...notifications];

    // Status filter
    if (filterStatus === 'UNREAD') {
      list = list.filter((n) => !n.is_read);
    } else if (filterStatus === 'READ') {
      list = list.filter((n) => n.is_read);
    }

    // Type filter
    if (filterType !== 'ALL') {
      list = list.filter((n) => n.jenis_notifikasi === filterType);
    }

    // Time range filter
    if (filterTimeRange !== 'ALL') {
      const now = new Date().getTime();
      list = list.filter((n) => {
        const notifTime = new Date(n.tanggal_terkirim).getTime();
        const diffMs = now - notifTime;
        if (filterTimeRange === 'TODAY') return diffMs <= 24 * 60 * 60 * 1000;
        if (filterTimeRange === '7_DAYS') return diffMs <= 7 * 24 * 60 * 60 * 1000;
        if (filterTimeRange === '30_DAYS') return diffMs <= 30 * 24 * 60 * 60 * 1000;
        return true;
      });
    }

    // Search filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (n) =>
          (n.pesan && n.pesan.toLowerCase().includes(q)) ||
          (n.parent_nomor && n.parent_nomor.toLowerCase().includes(q)) ||
          (n.parent_judul && n.parent_judul.toLowerCase().includes(q)) ||
          (n.jenis_notifikasi && n.jenis_notifikasi.toLowerCase().includes(q)) ||
          (n.penerima && n.penerima.toLowerCase().includes(q))
      );
    }

    // Sort by created time
    list.sort((a, b) => {
      const timeA = new Date(a.tanggal_terkirim).getTime();
      const timeB = new Date(b.tanggal_terkirim).getTime();
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });

    return list;
  }, [notifications, filterStatus, filterType, filterTimeRange, searchTerm, sortOrder]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredNotifications.length / rowsPerPage));
  const indexOfLast = currentPage * rowsPerPage;
  const indexOfFirst = indexOfLast - rowsPerPage;
  const currentNotifications = filteredNotifications.slice(indexOfFirst, indexOfLast);

  // Checkbox handlers
  const isAllCurrentSelected =
    currentNotifications.length > 0 &&
    currentNotifications.every((n) => selectedIds.includes(n.notif_id));

  const toggleSelectAll = () => {
    if (isAllCurrentSelected) {
      const currentIds = currentNotifications.map((n) => n.notif_id);
      setSelectedIds((prev) => prev.filter((id) => !currentIds.includes(id)));
    } else {
      const currentIds = currentNotifications.map((n) => n.notif_id);
      setSelectedIds((prev) => Array.from(new Set([...prev, ...currentIds])));
    }
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-200">
      {/* 1. Standard Header Card */}
      <div className="bg-white border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <span>{t('notifications.title', 'Pusat Notifikasi & Alarm Notice Period')}</span>
            {unreadCount > 0 && (
              <span className={`text-xs font-normal px-3 py-0.5 rounded-full border shadow-2xs whitespace-nowrap ${getStatusBadgeClass('warning')}`}>
                {unreadCount} {t('notifications.unread_badge', 'Belum Dibaca')}
              </span>
            )}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {unreadCount > 0 && onMarkRead && (
            <button
              onClick={handleMarkAllRead}
              className="h-9 text-xs cursor-pointer shadow-xs gap-1.5 rounded-xl px-4 border border-slate-200 dark:border-slate-800 bg-white hover:bg-slate-50 text-slate-700 font-bold flex items-center transition-all shrink-0"
            >
              <CheckCheck className="w-4 h-4 text-slate-600" />
              <span>{t('notifications.mark_all', 'Tandai Semua Dibaca')}</span>
            </button>
          )}

          <button
            onClick={handleManualTrigger}
            disabled={runningCron}
            className="h-9 text-xs cursor-pointer shadow-sm gap-1.5 rounded-xl px-4 bg-[#06C755] hover:bg-[#05B34C] text-white font-bold flex items-center transition-all shrink-0 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 text-white ${runningCron ? 'animate-spin' : ''}`} />
            <span>{runningCron ? t('notifications.processing', 'Memproses...') : t('notifications.refresh_logs', 'Refresh Logs')}</span>
          </button>
        </div>
      </div>

      {/* 2. Standard Filter Bar with 3 Dropdowns and View Column Toggle - Justified Responsive Grid/Flex */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 mb-6">
        <div className="flex flex-wrap items-center gap-2.5 w-full">
          {/* 1. Search Box */}
          <div className="relative flex-1 min-w-[200px] sm:min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder={t('notifications.search_ph', 'Cari nomor kontrak, partner, atau IO...')}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="h-9 w-full pl-9 pr-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#06C755] font-medium transition-colors"
            />
          </div>

          {/* 2. Filter 1: Status Notifikasi (Semua / Belum Dibaca / Sudah Dibaca) */}
          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              setCurrentPage(1);
            }}
            className="h-9 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:border-[#06C755] transition-colors flex-1 min-w-[130px] appearance-none pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23888888%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[length:10px_10px] bg-[right_12px_center]"
          >
            <option value="ALL">{t('notifications.all_status', 'Semua Status')} ({notifications.length})</option>
            <option value="UNREAD">{t('notifications.status_unread', 'Belum Dibaca')} ({unreadCount})</option>
            <option value="READ">{t('notifications.status_read', 'Sudah Dibaca')} ({notifications.length - unreadCount})</option>
          </select>

          {/* 3. Filter 2: Jenis Notifikasi */}
          <select
            value={filterType}
            onChange={(e) => {
              setFilterType(e.target.value);
              setCurrentPage(1);
            }}
            className="h-9 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:border-[#06C755] transition-colors flex-1 min-w-[130px] appearance-none pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23888888%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[length:10px_10px] bg-[right_12px_center]"
          >
            <option value="ALL">{t('notifications.all_types', 'Semua Jenis Notifikasi')}</option>
            {typeOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>

          {/* 4. Filter 3: Periode Waktu */}
          <select
            value={filterTimeRange}
            onChange={(e) => {
              setFilterTimeRange(e.target.value);
              setCurrentPage(1);
            }}
            className="h-9 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:border-[#06C755] transition-colors flex-1 min-w-[130px] appearance-none pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23888888%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[length:10px_10px] bg-[right_12px_center]"
          >
            <option value="ALL">{t('notifications.all_time_periods', 'Semua Periode Waktu')}</option>
            <option value="TODAY">{t('notifications.time_today', 'Hari Ini (24 Jam Terakhir)')}</option>
            <option value="7_DAYS">{t('notifications.time_7_days', '7 Hari Terakhir')}</option>
            <option value="30_DAYS">{t('notifications.time_30_days', '30 Hari Terakhir')}</option>
          </select>

          {/* View Column Toggle Menu */}
          <div className="relative flex-initial">
            <button
              onClick={() => setIsViewMenuOpen(!isViewMenuOpen)}
              className="h-9 px-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer active:scale-[0.98] w-full"
              title={t('notifications.view_settings', 'Pengaturan Tampilan Kolom')}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span>{t('notifications.view', 'View')}</span>
            </button>
            {isViewMenuOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setIsViewMenuOpen(false)}></div>
                <div className="absolute right-0 top-11 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-30 py-2 animate-in fade-in zoom-in-95">
                <div className="px-3.5 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 border-b border-slate-100 dark:border-slate-800">
                  {t('notifications.toggle_columns', 'Toggle Kolom')}
                </div>
                {Object.keys(visibleColumns).map((col) => {
                  let label = col;
                  if (col === 'time') label = t('notifications.col_time', 'Waktu');
                  else if (col === 'type') label = t('notifications.col_type_header', 'Tipe Notifikasi');
                  else if (col === 'subject') label = t('notifications.col_subject', 'Subjek');
                  else if (col === 'message') label = t('notifications.col_message', 'Pesan');
                  else if (col === 'recipient') label = t('notifications.col_recipient', 'Penerima');

                  return (
                    <label
                      key={col}
                      className="flex items-center gap-2.5 px-3.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-xs font-semibold text-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={visibleColumns[col]}
                        onChange={() => toggleColumnVisibility(col)}
                        className="rounded border-slate-300 dark:border-slate-700 text-[#06C755] focus:ring-[#06C755] w-3.5 h-3.5"
                      />
                      <span>{label}</span>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>

      {/* Bulk Action Bar (Visible when items selected) */}
      {selectedIds.length > 0 && (
        <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
            <span className="font-bold text-[#06C755]">{selectedIds.length}</span>
            <span>{t('notifications.selected_count', 'notifikasi dipilih')}</span>
          </div>

          <div className="flex items-center gap-2">
            {onMarkRead && (
              <button
                type="button"
                onClick={handleMarkSelectedRead}
                className="h-8 px-3 text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-700 dark:text-slate-200 hover:text-[#06C755] font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-[#06C755]" />
                <span>{t('notifications.mark_read_btn', 'Tandai Dibaca')}</span>
              </button>
            )}

            {onDeleteNotif && (
              <button
                type="button"
                onClick={handleDeleteSelected}
                className="h-8 px-3 text-xs bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-rose-700 dark:text-rose-300 hover:bg-rose-100 font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>{t('notifications.delete_selected', 'Hapus Terpilih')}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 3. Main Standard Table Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            {/* Table Header */}
            <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300">
              <tr>
                {/* 0. Checkbox */}
                <th className="pl-6 pr-2 py-4 w-12 text-left align-middle">
                  <div className="flex items-center justify-start">
                    <input
                      type="checkbox"
                      checked={isAllCurrentSelected}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-300 dark:border-slate-700 text-[#06C755] focus:ring-[#06C755] cursor-pointer"
                    />
                  </div>
                </th>

                {/* 1. Created time */}
                {visibleColumns.time && (
                  <th
                    onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                    className="p-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none align-middle"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{t('notifications.col_created_time', 'Created time')}</span>
                      {sortOrder === 'desc' ? (
                        <ArrowDown className="w-3.5 h-3.5 text-slate-400" />
                      ) : (
                        <ArrowUp className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </div>
                  </th>
                )}

                {/* 2. Type */}
                {visibleColumns.type && (
                  <th className="p-4 align-middle">{t('notifications.col_type_short', 'Type')}</th>
                )}

                {/* 3. Subject */}
                {visibleColumns.subject && (
                  <th className="p-4 align-middle">{t('notifications.col_subject', 'Subject')}</th>
                )}

                {/* 4. Message */}
                {visibleColumns.message && (
                  <th className="p-4 align-middle">{t('notifications.col_message', 'Message')}</th>
                )}

                {/* 5. Recipient */}
                {visibleColumns.recipient && (
                  <th className="p-4 align-middle">{t('notifications.col_recipient', 'Penerima')}</th>
                )}

                {/* 6. Actions */}
                <th className="pl-2 pr-6 py-4 text-right w-24 text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">
                  <div className="flex items-center justify-end">{t('notifications.col_actions', 'Aksi')}</div>
                </th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {currentNotifications.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-400">
                      <Inbox className="w-10 h-10 mb-2 stroke-1" />
                      <p className="text-xs font-medium">
                        {t('notifications.no_data', 'Belum ada notifikasi atau warning notice period yang tercatat.')}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                currentNotifications.map((notif) => {
                  const isSelected = selectedIds.includes(notif.notif_id);
                  const isUnread = !notif.is_read;

                  return (
                    <tr
                      key={notif.notif_id}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors ${
                        isSelected
                          ? 'bg-slate-50/90 dark:bg-slate-800/80'
                          : isUnread
                          ? 'bg-emerald-50/20 dark:bg-emerald-950/10'
                          : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="pl-6 pr-2 py-4 w-12 text-left align-middle">
                        <div className="flex items-center justify-start">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectRow(notif.notif_id)}
                            className="rounded border-slate-300 dark:border-slate-700 text-[#06C755] focus:ring-[#06C755] cursor-pointer"
                          />
                        </div>
                      </td>

                      {/* Created Time */}
                      {visibleColumns.time && (
                        <td className="py-4 px-4 text-xs font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap align-middle">
                          {new Date(notif.tanggal_terkirim).toLocaleString(
                            getActiveFormattingLocale(),
                            {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            }
                          )}
                        </td>
                      )}

                      {/* Type Badge */}
                      {visibleColumns.type && (
                        <td className="py-4 px-4 text-xs font-normal text-slate-700 dark:text-slate-300 whitespace-nowrap align-middle">
                          <span
                            className={`text-xs font-normal px-3 py-0.5 rounded-full border shadow-2xs whitespace-nowrap inline-flex items-center justify-center ${getStatusBadgeClass(
                              notif.jenis_notifikasi
                            )}`}
                          >
                            {notif.jenis_notifikasi}
                          </span>
                        </td>
                      )}

                      {/* Subject */}
                      {visibleColumns.subject && (
                        <td className="py-4 px-4 text-xs font-normal text-slate-700 dark:text-slate-300 whitespace-nowrap align-middle">
                          <span className="font-medium">
                            {notif.parent_nomor || notif.parent_id}
                          </span>
                          {notif.parent_judul && (
                            <span className="text-slate-500 dark:text-slate-400 ml-1.5">
                              • {notif.parent_judul}
                            </span>
                          )}
                        </td>
                      )}

                      {/* Message */}
                      {visibleColumns.message && (
                        <td className="py-4 px-4 text-xs font-normal text-slate-700 dark:text-slate-300 max-w-[400px] align-middle">
                          <span className="line-clamp-2" title={notif.pesan}>
                            {notif.pesan}
                          </span>
                        </td>
                      )}

                      {/* Recipient */}
                      {visibleColumns.recipient && (
                        <td className="py-4 px-4 text-xs font-normal text-slate-700 dark:text-slate-300 whitespace-nowrap align-middle">
                          {notif.penerima}
                        </td>
                      )}

                      {/* Actions */}
                      <td className="pl-2 pr-6 py-4 text-right whitespace-nowrap w-24 align-middle">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Mark Read Checkmark Button */}
                          {isUnread && onMarkRead && (
                            <button
                              type="button"
                              onClick={(e) => handleMarkSingleRead(notif.notif_id, e)}
                              className="p-1.5 text-slate-400 hover:text-[#06C755] hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors cursor-pointer"
                              title={t('notifications.mark_read', 'Tandai Dibaca')}
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          )}

                          {/* Delete Trash Button */}
                          {onDeleteNotif && (
                            <button
                              type="button"
                              onClick={(e) => handleDeleteSingle(notif.notif_id, e)}
                              className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors cursor-pointer"
                              title={t('notifications.delete_notif', 'Hapus Notifikasi')}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Pagination */}
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          rowsPerPage={rowsPerPage}
          onPageChange={setCurrentPage}
          onRowsPerPageChange={(n) => {
            setRowsPerPage(n);
            setCurrentPage(1);
          }}
        />
      </div>
    </div>
  );
};
