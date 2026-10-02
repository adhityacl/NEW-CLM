import React from 'react';

interface TableEmptyStateProps {
  colSpan: number;
}

export const TableEmptyState: React.FC<TableEmptyStateProps> = ({ colSpan }) => (
  <tr>
    <td colSpan={colSpan} className="h-24 px-4 text-center text-sm font-medium text-slate-500 dark:text-slate-400">
      No data to display
    </td>
  </tr>
);

export const TableEmptyMessage: React.FC = () => (
  <div className="flex min-h-24 items-center justify-center px-4 text-center text-sm font-medium text-slate-500 dark:text-slate-400">
    No data to display
  </div>
);
