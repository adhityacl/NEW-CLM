import React, { useRef } from 'react';
import { Dialog } from 'radix-ui';
import { cn } from '@legalio/ui-components/utils';
import { useOptionalActiveTab } from '../../context/NavigationContext';
import { tableDesignForTab } from '../../lib/tableDesign';

/** Shared modal behavior; callers provide a visible ModalTitle. */
export const ModalTitle = Dialog.Title;

export function ModalFrame({ children, onClose, className }: {
  children: React.ReactNode; onClose: () => void; className?: string;
}) {
  const returnFocus = useRef<HTMLElement | null>(null);
  const tableDesign = tableDesignForTab(useOptionalActiveTab());
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs animate-in" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 pointer-events-none">
        <Dialog.Content aria-describedby={undefined} aria-modal="true" data-table-design={tableDesign}
          onOpenAutoFocus={() => { returnFocus.current = document.activeElement as HTMLElement; }}
          onCloseAutoFocus={event => { event.preventDefault(); returnFocus.current?.focus(); }}
          onPointerDownOutside={event => event.preventDefault()}
          className={cn('form-dialog pointer-events-auto animate-in bg-white dark:bg-slate-900 rounded-2xl max-w-4xl w-full max-h-[92dvh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden', className)}>
          {children}
        </Dialog.Content>
      </div>
    </Dialog.Portal>
  </Dialog.Root>;
}
