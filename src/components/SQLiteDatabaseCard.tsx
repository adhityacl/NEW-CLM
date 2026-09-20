import React, { useState, useEffect } from 'react';
import {
  Database,
  RefreshCw,
  Search,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Table as TableIcon,
  ChevronLeft,
  ChevronRight,
  Layers,
  HardDrive,
  Activity,
  Maximize2,
  X,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';
import { getAuthHeaders } from '../App';

interface SQLiteStatus {
  status: string;
  journalMode: string;
  version: string;
  fileSizeBytes: number;
  pageCount: number;
  pageSize: number;
  modifiedAt: string | null;
  tablesCount: number;
  totalRecords: number;
  tableSummaries: Record<string, number>;
}

interface TableItem {
  name: string;
  count: number;
  columnsCount: number;
}

interface TableColumn {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: any;
  pk: number;
}

interface TableDataResponse {
  table: string;
  columns: TableColumn[];
  rows: Record<string, any>[];
  total: number;
  limit: number;
  offset: number;
}

export const SQLiteDatabaseCard: React.FC = () => {
  const [status, setStatus] = useState<SQLiteStatus | null>(null);
  const [tables, setTables] = useState<TableItem[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [tableData, setTableData] = useState<TableDataResponse | null>(null);
  const [search, setSearch] = useState<string>('');
  const [offset, setOffset] = useState<number>(0);
  const limit = 15;

  const [loadingStatus, setLoadingStatus] = useState<boolean>(false);
  const [loadingData, setLoadingData] = useState<boolean>(false);
  const [optimizing, setOptimizing] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [expandedCell, setExpandedCell] = useState<{ col: string; val: string } | null>(null);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const fetchStatusAndTables = async () => {
    setLoadingStatus(true);
    try {
      const headers = getAuthHeaders();
      const [statusRes, tablesRes] = await Promise.all([
        fetch('/api/auth-console/sqlite/status', { headers, credentials: 'include' }),
        fetch('/api/auth-console/sqlite/tables', { headers, credentials: 'include' }),
      ]);

      if (statusRes.ok) {
        const data = await statusRes.json();
        if (data.success) setStatus(data);
      }

      if (tablesRes.ok) {
        const data = await tablesRes.json();
        if (data.success && Array.isArray(data.tables)) {
          setTables(data.tables);
          if (!selectedTable && data.tables.length > 0) {
            setSelectedTable(data.tables[0].name);
          }
        }
      }
    } catch (err: any) {
      console.error('Error fetching SQLite info:', err);
    } finally {
      setLoadingStatus(false);
    }
  };

  const fetchTableData = async (table: string, currentOffset = 0, currentSearch = '') => {
    if (!table) return;
    setLoadingData(true);
    try {
      const headers = getAuthHeaders();
      const params = new URLSearchParams({
        table,
        limit: String(limit),
        offset: String(currentOffset),
      });
      if (currentSearch.trim()) {
        params.set('search', currentSearch.trim());
      }

      const res = await fetch(`/api/auth-console/sqlite/table-data?${params.toString()}`, {
        headers,
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setTableData(data);
        }
      }
    } catch (err: any) {
      console.error('Error fetching table data:', err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    fetchStatusAndTables();
  }, []);

  useEffect(() => {
    if (selectedTable) {
      setOffset(0);
      fetchTableData(selectedTable, 0, search);
    }
  }, [selectedTable]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setOffset(0);
    fetchTableData(selectedTable, 0, search);
  };

  const handlePageChange = (newOffset: number) => {
    setOffset(newOffset);
    fetchTableData(selectedTable, newOffset, search);
  };

  const handleOptimize = async () => {
    setOptimizing(true);
    setMessage(null);
    try {
      const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
      const res = await fetch('/api/auth-console/sqlite/optimize', {
        method: 'POST',
        headers,
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMessage({ type: 'success', text: 'Database optimized' });
        fetchStatusAndTables();
        if (selectedTable) fetchTableData(selectedTable, offset, search);
      } else {
        setMessage({ type: 'error', text: data.error || 'Optimization failed' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Optimization failed' });
    } finally {
      setOptimizing(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = tableData ? Math.ceil(tableData.total / limit) || 1 : 1;

  return (
    <Card id="card-sqlite-database" className="border-none shadow-[0_4px_16px_rgba(0,0,0,0.04)] rounded-[20px] overflow-hidden">
      <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <Database className="w-5 h-5 text-[#06C755]" />
            <span>SQLite Database</span>
          </CardTitle>
          <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
            Engine & Browser
          </CardDescription>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchStatusAndTables}
            disabled={loadingStatus}
            className="h-8 px-3 rounded-full text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer gap-1.5 shadow-2xs"
          >
            <RefreshCw className={cn('w-3 h-3', loadingStatus && 'animate-spin')} />
            <span>Refresh</span>
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleOptimize}
            disabled={optimizing}
            className="h-8 px-3 rounded-full text-xs font-bold bg-[#06C755] text-white hover:bg-[#05b34c] cursor-pointer gap-1.5 shadow-2xs"
          >
            <Sparkles className={cn('w-3 h-3', optimizing && 'animate-spin')} />
            <span>{optimizing ? 'Optimizing...' : 'Optimize'}</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 text-xs">
        {message && (
          <div
            className={cn(
              'p-2.5 rounded-xl text-xs font-medium flex items-center justify-between animate-in fade-in-50',
              message.type === 'success'
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                : 'bg-destructive/10 border border-destructive/20 text-destructive'
            )}
          >
            <div className="flex items-center gap-2">
              {message.type === 'success' ? (
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>{message.text}</span>
            </div>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/70 dark:border-slate-700/80 space-y-1">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Activity className="w-3 h-3 text-[#06C755]" />
              <span>Status</span>
            </span>
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-[#06C755] animate-pulse" />
              <p className="font-bold text-slate-800 dark:text-slate-100 font-mono text-xs uppercase">
                {status?.status || 'Active'}
              </p>
            </div>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/70 dark:border-slate-700/80 space-y-1">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <HardDrive className="w-3 h-3 text-blue-500" />
              <span>Size</span>
            </span>
            <p className="font-bold text-slate-800 dark:text-slate-100 font-mono text-xs">
              {status ? formatBytes(status.fileSizeBytes) : '-'}
            </p>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/70 dark:border-slate-700/80 space-y-1">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Layers className="w-3 h-3 text-purple-500" />
              <span>Tables</span>
            </span>
            <p className="font-bold text-slate-800 dark:text-slate-100 font-mono text-xs">
              {status?.tablesCount ?? tables.length}
            </p>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/70 dark:border-slate-700/80 space-y-1">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <TableIcon className="w-3 h-3 text-amber-500" />
              <span>Total Rows</span>
            </span>
            <p className="font-bold text-slate-800 dark:text-slate-100 font-mono text-xs">
              {status?.totalRecords?.toLocaleString() ?? '-'}
            </p>
          </div>
        </div>

        {/* Table Selector & Search */}
        <div className="pt-2 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            {/* Table Selector */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
              {tables.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => setSelectedTable(t.name)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer shrink-0 flex items-center gap-1.5 border',
                    selectedTable === t.name
                      ? 'bg-[#06C755] text-white border-[#06C755] font-semibold shadow-2xs'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                  )}
                >
                  <span>{t.name}</span>
                  <span
                    className={cn(
                      'text-[10px] px-1 rounded',
                      selectedTable === t.name
                        ? 'bg-black/20 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                    )}
                  >
                    {t.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Search Input */}
            <form onSubmit={handleSearchSubmit} className="flex items-center gap-1.5 shrink-0">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search table..."
                  className="h-8 pl-8 pr-3 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#06C755] w-36 sm:w-48 font-mono"
                />
              </div>
              <Button
                type="submit"
                variant="outline"
                size="sm"
                className="h-8 px-2.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
              >
                Go
              </Button>
            </form>
          </div>

          {/* Data Table */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
            <div className="overflow-x-auto max-h-96">
              {loadingData ? (
                <div className="p-8 text-center text-slate-400">
                  <RefreshCw className="w-5 h-5 mx-auto animate-spin mb-2 text-[#06C755]" />
                  <span>Loading...</span>
                </div>
              ) : !tableData || tableData.rows.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <span>No records found</span>
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                      {tableData.columns.map((col) => (
                        <th key={col.name} className="p-2.5 font-semibold whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span>{col.name}</span>
                            {col.pk === 1 && (
                              <span className="text-[9px] px-1 py-0.2 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded">
                                PK
                              </span>
                            )}
                            <span className="text-[9px] text-slate-400 font-normal">
                              {col.type || 'TEXT'}
                            </span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {tableData.rows.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        {tableData.columns.map((col) => {
                          const val = row[col.name];
                          const strVal =
                            val === null || val === undefined
                              ? 'NULL'
                              : typeof val === 'object'
                              ? JSON.stringify(val)
                              : String(val);

                          const isNull = val === null || val === undefined;

                          return (
                            <td
                              key={col.name}
                              className="p-2.5 max-w-xs truncate text-slate-700 dark:text-slate-200 whitespace-nowrap"
                              title={strVal}
                            >
                              {isNull ? (
                                <span className="text-slate-400 italic text-[11px]">NULL</span>
                              ) : strVal.length > 35 ? (
                                <button
                                  type="button"
                                  onClick={() => setExpandedCell({ col: col.name, val: strVal })}
                                  className="text-left truncate hover:underline hover:text-[#06C755] cursor-pointer"
                                >
                                  {strVal.slice(0, 35)}...
                                </button>
                              ) : (
                                <span>{strVal}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination Controls */}
            {tableData && tableData.total > 0 && (
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                  {offset + 1} - {Math.min(offset + limit, tableData.total)} of {tableData.total}
                </span>

                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(Math.max(0, offset - limit))}
                    disabled={offset === 0 || loadingData}
                    className="h-7 w-7 p-0 rounded-lg"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </Button>
                  <span className="px-2 font-mono text-slate-600 dark:text-slate-300 text-[11px]">
                    {currentPage}/{totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(offset + limit)}
                    disabled={offset + limit >= tableData.total || loadingData}
                    className="h-7 w-7 p-0 rounded-lg"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>

      {/* Expanded Cell View Modal */}
      {expandedCell && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-4 space-y-3 shadow-xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                {expandedCell.col}
              </span>
              <button
                type="button"
                onClick={() => setExpandedCell(null)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <pre className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl text-xs font-mono max-h-64 overflow-auto whitespace-pre-wrap break-all text-slate-800 dark:text-slate-200">
              {expandedCell.val}
            </pre>
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                onClick={() => setExpandedCell(null)}
                className="h-8 px-4 rounded-full text-xs font-semibold bg-slate-900 dark:bg-white text-white dark:text-slate-900"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};
