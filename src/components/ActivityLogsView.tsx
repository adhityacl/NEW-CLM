import React, { useState, useEffect } from 'react';
import { getActiveFormattingLocale } from '../lib/currencyUtils';
import { ActivityLog } from '../types';
import { Clock, Search, RefreshCw, Shield, Monitor, Filter, CheckCircle2, Eye, SlidersHorizontal } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { ActionMenu } from './ui/action-menu';
import { TablePagination } from './ui/TablePagination';
import { getStatusBadgeClass } from './ui/badge';

export const ActivityLogsView: React.FC = () => {
  const { fetchActivityLogs } = useAuth();
  const { t, language } = useLanguage();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterModule, setFilterModule] = useState('ALL');
  const [selectedAction, setSelectedAction] = useState<string>('ALL');
  const [selectedTimeRange, setSelectedTimeRange] = useState<string>('ALL');
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    time: true,
    user: true,
    action: true,
    module: true,
    detail: true,
  });
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const toggleColumnVisibility = (col: string) => {
    setVisibleColumns((prev) => ({ ...prev, [col]: !prev[col] }));
  };

  const loadLogs = async () => {
    setLoading(true);
    const data = await fetchActivityLogs();
    setLogs(data);
    setLoading(false);
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const filteredLogs = logs.filter((log) => {
    const matchSearch =
      log.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.ipAddress && log.ipAddress.includes(searchTerm));

    const matchAction = selectedAction === 'ALL' || log.actionType === selectedAction;
    const matchModule = filterModule === 'ALL' || log.module === filterModule;

    let matchTime = true;
    if (selectedTimeRange !== 'ALL') {
      const logDate = new Date(log.timestamp).getTime();
      const now = Date.now();
      if (selectedTimeRange === 'TODAY') {
        matchTime = now - logDate <= 24 * 60 * 60 * 1000;
      } else if (selectedTimeRange === '7_DAYS') {
        matchTime = now - logDate <= 7 * 24 * 60 * 60 * 1000;
      } else if (selectedTimeRange === '30_DAYS') {
        matchTime = now - logDate <= 30 * 24 * 60 * 60 * 1000;
      }
    }

    return matchSearch && matchAction && matchModule && matchTime;
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelectedRows(filteredLogs.map(item => item.id || ''));
    else setSelectedRows([]);
  };

  const handleSelectRow = (id: string) => {
    setSelectedRows(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]);
  };

  const totalPages = Math.ceil(filteredLogs.length / rowsPerPage);
  const indexOfLast = currentPage * rowsPerPage;
  const indexOfFirst = indexOfLast - rowsPerPage;
  const currentLogs = filteredLogs.slice(indexOfFirst, indexOfLast);

  const [selectedLogForDetail, setSelectedLogForDetail] = useState<ActivityLog | null>(null);

  const moduleOptions = Array.from(new Set(logs.map((l) => l.module).filter(Boolean)));
  const getActionBadge = (action: ActivityLog['actionType']) => {
    switch (action) {
      case 'LOGIN':
      case 'UPLOAD_SUCCESS':
        return getStatusBadgeClass('Active');
      case 'LOGOUT':
        return getStatusBadgeClass('Neutral');
      case 'CREATE':
        return getStatusBadgeClass('Legal');
      case 'UPDATE':
      case 'DD_UPDATE':
        return getStatusBadgeClass('Expiring');
      case 'DELETE':
      case 'UPLOAD_FAILED':
      case 'SYSTEM_ERROR':
        return getStatusBadgeClass('Expired');
      case 'ADD_USER':
        return getStatusBadgeClass('Admin');
      default:
        return getStatusBadgeClass('Neutral');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <span>{t('logs.title', 'Log Aktivitas Sesi System')}</span>
          </h2>
        </div>

        <button
          onClick={loadLogs}
          disabled={loading}
          className="h-9 text-xs cursor-pointer shadow-sm gap-1.5 rounded-xl px-4 bg-[#06C755] hover:bg-[#05B34C] text-white font-bold flex items-center transition-all shrink-0 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 text-white ${loading ? 'animate-spin' : ''}`} />
          <span>{t('logs.refresh_btn', 'Refresh Log')}</span>
        </button>
      </div>

      {/* Filter Bar with 3 Dropdowns */}
      <div className="bg-white border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-2.5">
        <div className="flex flex-1 flex-wrap items-center gap-2 w-full">
          {/* 1 Box Search */}
          <div className="relative flex-1 min-w-[200px] md:max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder={t('logs.search_placeholder', 'Cari aktivitas, email, atau deskripsi...')}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="h-9 w-full pl-9 pr-3 bg-white border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 placeholder:text-slate-500 focus:outline-none focus:border-[#06C755] font-medium transition-colors"
            />
          </div>

          {/* Filter 1: Modul */}
          <select
            value={filterModule}
            onChange={(e) => {
              setFilterModule(e.target.value);
              setCurrentPage(1);
            }}
            className="h-9 px-3 bg-white border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 font-medium focus:outline-none focus:border-[#06C755] transition-colors flex-1 min-w-[140px] appearance-none pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2313192B%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[length:10px_10px] bg-[right_12px_center]"
          >
            <option value="ALL">{t('logs.all_modules', 'Semua Modul')}</option>
            {moduleOptions.map((mod) => (
              <option key={mod} value={mod}>
                {mod}
              </option>
            ))}
          </select>

          {/* Filter 2: Jenis Aksi */}
          <select
            value={selectedAction}
            onChange={(e) => {
              setSelectedAction(e.target.value);
              setCurrentPage(1);
            }}
            className="h-9 px-3 bg-white border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 font-medium focus:outline-none focus:border-[#06C755] transition-colors flex-1 min-w-[140px] appearance-none pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2313192B%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[length:10px_10px] bg-[right_12px_center]"
          >
            <option value="ALL">Semua Jenis Aksi</option>
            <option value="LOGIN">LOGIN</option>
            <option value="LOGOUT">LOGOUT</option>
            <option value="CREATE">CREATE</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
            <option value="UPLOAD_SUCCESS">UPLOAD_SUCCESS</option>
            <option value="UPLOAD_FAILED">UPLOAD_FAILED</option>
            <option value="SYSTEM_ERROR">SYSTEM_ERROR</option>
            <option value="ADD_USER">ADD_USER</option>
          </select>

          {/* Filter 3: Periode Waktu */}
          <select
            value={selectedTimeRange}
            onChange={(e) => {
              setSelectedTimeRange(e.target.value);
              setCurrentPage(1);
            }}
            className="h-9 px-3 bg-white border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 font-medium focus:outline-none focus:border-[#06C755] transition-colors flex-1 min-w-[140px] appearance-none pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2313192B%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[length:10px_10px] bg-[right_12px_center]"
          >
            <option value="ALL">Semua Periode Waktu</option>
            <option value="TODAY">Hari Ini (24 Jam Terakhir)</option>
            <option value="7_DAYS">7 Hari Terakhir</option>
            <option value="30_DAYS">30 Hari Terakhir</option>
          </select>
        </div>

        {/* View Toggle */}
        <div className="relative ml-auto">
          <button
            onClick={() => setIsViewMenuOpen(!isViewMenuOpen)}
            className="h-9 px-3.5 bg-white border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-700 font-bold hover:bg-slate-50 hover:text-slate-900 transition-all flex items-center gap-2 shadow-xs cursor-pointer active:scale-[0.98]"
            title="Pengaturan Tampilan Kolom"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
            <span>View</span>
          </button>
          {isViewMenuOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setIsViewMenuOpen(false)}></div>
              <div className="absolute right-0 top-11 w-52 bg-white border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-30 py-2 animate-in fade-in zoom-in-95">
                <div className="px-3.5 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 border-b border-slate-100 dark:border-slate-800">
                  Toggle Kolom
                </div>
                {Object.keys(visibleColumns).map((col) => {
                  let label = col;
                  if (col === 'time') label = 'Waktu';
                  else if (col === 'user') label = 'Pengguna';
                  else if (col === 'action') label = 'Jenis Aksi';
                  else if (col === 'module') label = 'Modul';
                  else if (col === 'detail') label = 'Rincian Deskripsi';

                  return (
                    <label key={col} className="flex items-center gap-2.5 px-3.5 py-1.5 hover:bg-slate-50 cursor-pointer text-xs font-medium text-slate-700 select-none">
                      <input
                        type="checkbox"
                        checked={visibleColumns[col]}
                        onChange={() => toggleColumnVisibility(col)}
                        className="rounded border-slate-300 dark:border-slate-700 text-[#06C755] focus:ring-[#06C755]"
                      />
                      <span className="capitalize">{label}</span>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto bg-white dark:bg-slate-900">
          <table className="w-full text-left border-collapse text-xs bg-white dark:bg-slate-900">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 h-12">
                <th scope="col" className="pl-6 pr-2 py-4 w-12 text-left align-middle">
                  <div className="flex items-center justify-start">
                    <input
                      type="checkbox"
                      aria-label="Pilih semua log aktivitas"
                      onChange={handleSelectAll}
                      checked={selectedRows.length > 0 && selectedRows.length === currentLogs.length}
                      className="rounded border-slate-300 dark:border-slate-700 text-[#06C755] focus:ring-[#06C755]"
                    />
                  </div>
                </th>
                {visibleColumns.time && <th scope="col" className="p-4 text-xs font-bold text-slate-700 text-left align-middle">{t('logs.col_time', 'Waktu')}</th>}
                {visibleColumns.user && <th scope="col" className="p-4 text-xs font-bold text-slate-700 text-left align-middle">{t('logs.col_user', 'Pengguna')}</th>}
                {visibleColumns.action && <th scope="col" className="p-4 text-xs font-bold text-slate-700 text-left align-middle">{t('logs.col_action', 'Jenis Aksi')}</th>}
                {visibleColumns.module && <th scope="col" className="p-4 text-xs font-bold text-slate-700 text-left align-middle">{t('logs.col_module', 'Modul')}</th>}
                {visibleColumns.detail && <th scope="col" className="p-4 text-xs font-bold text-slate-700 text-left align-middle">{t('logs.col_detail', 'Rincian Deskripsi')}</th>}
                <th scope="col" className="pl-2 pr-6 py-4 text-right w-20 text-xs font-bold text-slate-700 align-middle">
                  <div className="flex items-center justify-end">Aksi</div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E8EB] dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={Object.values(visibleColumns).filter(Boolean).length + 2} className="py-12 text-center text-slate-400">
                    {t('logs.loading', 'Memuat log aktivitas...')}
                  </td>
                </tr>
              ) : currentLogs.length === 0 ? (
                <tr>
                  <td colSpan={Object.values(visibleColumns).filter(Boolean).length + 2} className="py-12 text-center text-slate-400">
                    {t('logs.no_data', 'Belum ada data log aktivitas.')}
                  </td>
                </tr>
              ) : (
                currentLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="pl-6 pr-2 py-4 text-left align-middle">
                      <div className="flex items-center justify-start">
                        <input
                          type="checkbox"
                          aria-label={`Pilih log ${log.actionType} oleh ${log.userName || log.userEmail}`}
                          checked={selectedRows.includes(log.id || '')}
                          onChange={() => handleSelectRow(log.id || '')}
                          className="rounded border-slate-300 dark:border-slate-700 text-[#06C755] focus:ring-[#06C755]"
                        />
                      </div>
                    </td>

                    {/* 1. Waktu */}
                    {visibleColumns.time && (
                      <td className="py-4 px-4 text-xs font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap text-left">
                        {new Date(log.timestamp).toLocaleString(getActiveFormattingLocale(), {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </td>
                    )}

                    {/* 2. Pengguna */}
                    {visibleColumns.user && (
                      <td className="py-4 px-4 text-xs font-normal text-slate-700 whitespace-nowrap text-left">
                        {log.userName || log.userEmail}
                      </td>
                    )}

                    {/* 3. Jenis Aksi */}
                    {visibleColumns.action && (
                      <td className="py-4 px-4 text-left">
                        <span
                          className={`text-xs font-normal px-3 py-0.5 rounded-full border inline-flex items-center justify-center gap-1.5 shadow-2xs whitespace-nowrap ${getActionBadge(
                            log.actionType
                          )}`}
                        >
                          {log.actionType}
                        </span>
                      </td>
                    )}

                    {/* 4. Modul */}
                    {visibleColumns.module && (
                      <td className="py-4 px-4 text-xs font-normal text-slate-700 uppercase whitespace-nowrap text-left">
                        <span className={`text-xs font-normal px-3 py-0.5 rounded-full border inline-flex items-center justify-center whitespace-nowrap shadow-2xs ${getStatusBadgeClass(log.module)}`}>
                          {log.module}
                        </span>
                      </td>
                    )}

                    {/* 5. Rincian Deskripsi */}
                    {visibleColumns.detail && (
                      <td className="py-4 px-4 max-w-sm text-left text-xs font-normal text-slate-700">
                        <p className="line-clamp-1" title={log.description}>{log.description}</p>
                      </td>
                    )}

                    {/* 6. Aksi */}
                    <td className="pl-2 pr-6 py-4 text-right align-middle w-20">
                      <div className="flex items-center justify-end">
                        <ActionMenu
                          items={[
                            {
                              label: 'Detail',
                              icon: <Eye className="w-3.5 h-3.5" />,
                              onClick: () => setSelectedLogForDetail(log),
                            },
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          rowsPerPage={rowsPerPage}
          onPageChange={setCurrentPage}
          onRowsPerPageChange={(size) => {
            setRowsPerPage(size);
            setCurrentPage(1);
          }}
        />
      </div>

      {/* Detail Modal */}
      {selectedLogForDetail && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 max-w-lg w-full overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Rincian Log Aktivitas</h3>
                <p className="text-xs text-slate-500 mt-0.5">ID: {selectedLogForDetail.id}</p>
              </div>
              <button
                onClick={() => setSelectedLogForDetail(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                <div>
                  <span className="text-slate-400 font-medium block mb-1">Waktu</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {new Date(selectedLogForDetail.timestamp).toLocaleString(getActiveFormattingLocale(), {
                      dateStyle: 'full',
                      timeStyle: 'medium',
                    })}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium block mb-1">Pengguna</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedLogForDetail.userName || selectedLogForDetail.userEmail} ({selectedLogForDetail.role})
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium block mb-1">Jenis Aksi</span>
                  <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border inline-block ${getActionBadge(selectedLogForDetail.actionType)}`}>
                    {selectedLogForDetail.actionType}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium block mb-1">Modul</span>
                  <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border inline-block ${getStatusBadgeClass(selectedLogForDetail.module)}`}>
                    {selectedLogForDetail.module}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-slate-500 font-semibold block mb-1.5">Deskripsi / Detail Teknis:</span>
                <div className="p-3.5 bg-slate-900 text-slate-100 rounded-xl font-mono text-[11px] leading-relaxed wrap-break-word whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {selectedLogForDetail.description}
                </div>
              </div>

              {(selectedLogForDetail.ipAddress || selectedLogForDetail.userAgent) && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1 text-[11px] text-slate-500">
                  {selectedLogForDetail.ipAddress && <div><span className="font-semibold">IP Address:</span> {selectedLogForDetail.ipAddress}</div>}
                  {selectedLogForDetail.userAgent && <div className="truncate"><span className="font-semibold">User Agent:</span> {selectedLogForDetail.userAgent}</div>}
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedLogForDetail(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 rounded-xl font-semibold text-xs transition-all cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
