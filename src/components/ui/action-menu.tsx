import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

export interface ActionMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'danger';
  dividerBefore?: boolean;
}

export interface ActionMenuProps {
  items: ActionMenuItem[];
  title?: string;
}

export const ActionMenu: React.FC<ActionMenuProps> = ({ items, title = 'Aksi' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const toggleMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (isOpen) {
      setIsOpen(false);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpwards = spaceBelow < 180;

    setPosition({
      top: openUpwards ? undefined : rect.bottom + 6,
      bottom: openUpwards ? window.innerHeight - rect.top + 6 : undefined,
      right: window.innerWidth - rect.right,
    });
    setIsOpen(true);
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleClose = () => setIsOpen(false);
    window.addEventListener('scroll', handleClose, true);
    window.addEventListener('resize', handleClose);
    return () => {
      window.removeEventListener('scroll', handleClose, true);
      window.removeEventListener('resize', handleClose);
    };
  }, [isOpen]);

  return (
    <div className="inline-block relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleMenu}
        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer inline-flex items-center justify-center min-w-[36px] min-h-[36px]"
        title={title}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {isOpen &&
        position &&
        ReactDOM.createPortal(
          <>
            <div
              className="fixed inset-0 z-[9998]"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
              }}
            />
            <div
              style={{
                position: 'fixed',
                top: position.top !== undefined ? `${position.top}px` : 'auto',
                bottom: position.bottom !== undefined ? `${position.bottom}px` : 'auto',
                right: `${position.right}px`,
              }}
              className="w-36 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-[9999] py-1.5 animate-in fade-in zoom-in-95 text-left"
              onClick={(e) => e.stopPropagation()}
            >
              {items.map((item, idx) => (
                <React.Fragment key={idx}>
                  {item.dividerBefore && <div className="border-t border-slate-100 dark:border-slate-800 my-1" />}
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      item.onClick();
                    }}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors cursor-pointer font-medium ${
                      item.variant === 'danger'
                        ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-[#048C3B] dark:hover:text-[#06C755]'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                </React.Fragment>
              ))}
            </div>
          </>,
          document.body
        )}
    </div>
  );
};
