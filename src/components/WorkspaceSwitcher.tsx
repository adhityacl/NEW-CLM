import React, { useState, useRef, useEffect } from 'react';
import { ChevronsUpDown, Check, Building2 } from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../lib/permissions';

export interface WorkspaceItem {
  id: string;
  name: string;
  brandName?: string;
  badgeClass: string;
  iconLetter?: string;
  logoUrl?: string;
}

const BADGE_COLOR_PALETTES = [
  'bg-emerald-600 text-white',
  'bg-slate-800 dark:bg-slate-700 text-white',
  'bg-blue-600 text-white',
  'bg-teal-700 text-white',
  'bg-zinc-700 text-white',
  'bg-indigo-700 text-white',
];

interface WorkspaceSwitcherProps {
  isCollapsed?: boolean;
  onNavigateToSettings?: () => void;
  className?: string;
}

export const WorkspaceSwitcher: React.FC<WorkspaceSwitcherProps> = ({
  isCollapsed = false,
  onNavigateToSettings: _onNavigateToSettings,
  className = '',
}) => {
  const { tenants, activeTenant, activeTenantId, switchTenant } = useTenant();
  const { t } = useLanguage();
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Switch workspace is strictly disabled for non-admin / non-superuser roles (e.g. Manager, Editor, Viewer)
  const canSwitch = hasPermission('workspace.switch');

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close dropdown on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Filter tenants: Non-admins only see their assigned organization / tenant
  const tenantsToDisplay = canSwitch
    ? tenants
    : tenants.filter((tenant) => {
        if (user?.organizationId && tenant.id === user.organizationId) return true;
        if (user?.allowedTenantIds?.includes(tenant.id)) return true;
        return tenant.id === activeTenantId;
      });

  // Build workspace list with purposeful badge styling
  const workspaces: WorkspaceItem[] = tenantsToDisplay.map((tenant, idx) => {
    const badgeClass = BADGE_COLOR_PALETTES[idx % BADGE_COLOR_PALETTES.length];
    const displayName = tenant.brandName || tenant.name;
    const iconLetter = (displayName || 'W').charAt(0).toUpperCase();
    return {
      id: tenant.id,
      name: displayName,
      brandName: tenant.brandName,
      badgeClass,
      iconLetter,
      logoUrl: tenant.logoUrl && tenant.logoUrl !== '/favicon.png' ? tenant.logoUrl : undefined,
    };
  });

  const currentWorkspace =
    workspaces.find((w) => w.id === activeTenantId) ||
    workspaces[0] || {
      id: 'default',
      name: activeTenant?.brandName || activeTenant?.name || 'Locally inc.',
      badgeClass: BADGE_COLOR_PALETTES[0],
      iconLetter: 'L',
      logoUrl: activeTenant?.logoUrl && activeTenant.logoUrl !== '/favicon.png' ? activeTenant.logoUrl : undefined,
    };

  const handleSelect = async (workspaceId: string) => {
    if (!canSwitch) return;
    if (workspaceId === activeTenantId) {
      setIsOpen(false);
      return;
    }
    await switchTenant(workspaceId);
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => {
          if (canSwitch) setIsOpen((prev) => !prev);
        }}
        aria-expanded={canSwitch ? isOpen : false}
        aria-haspopup={canSwitch ? "listbox" : false}
        className={`w-full flex items-center gap-2.5 p-1.5 rounded-xl transition-colors text-left group focus-visible:ring-2 focus-visible:ring-[#06C755]/50 focus-visible:outline-none ${
          canSwitch
            ? 'hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer'
            : 'cursor-default select-none'
        } ${isCollapsed ? 'justify-center' : 'justify-between'}`}
        title={
          canSwitch
            ? currentWorkspace.name
            : `${currentWorkspace.name} (Akses Switch Workspace Terkunci)`
        }
      >
        <div className="flex items-center gap-2.5 min-w-0 overflow-hidden">
          {/* Workspace Monogram / Logo Icon */}
          <div
            className={`w-8 h-8 rounded-lg ${
              currentWorkspace.logoUrl
                ? 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-0.5'
                : `${currentWorkspace.badgeClass} shadow-2xs`
            } flex items-center justify-center font-bold text-sm shrink-0 select-none overflow-hidden transition-transform`}
          >
            {currentWorkspace.logoUrl ? (
              <img
                src={currentWorkspace.logoUrl}
                alt={currentWorkspace.name}
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              currentWorkspace.iconLetter
            )}
          </div>

          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <span className="block font-semibold text-xs text-slate-900 dark:text-slate-100 tracking-tight truncate leading-tight">
                {currentWorkspace.name}
              </span>
              <span className="block text-[10px] text-slate-500 dark:text-slate-400 truncate">
                Workspace
              </span>
            </div>
          )}
        </div>

        {!isCollapsed && canSwitch && (
          <ChevronsUpDown
            className={`w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors ${
              isOpen ? 'text-slate-800 dark:text-slate-100' : ''
            }`}
          />
        )}
      </button>

      {/* Popover Dropdown Menu */}
      {isOpen && canSwitch && (
        <div
          role="listbox"
          aria-label="Pilih Ruang Kerja"
          className={`absolute z-50 mt-1.5 ${
            isCollapsed ? 'left-14 top-0' : 'left-0 right-0'
          } min-w-[240px] bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-1.5 animate-in fade-in zoom-in-95 duration-150`}
          style={{ transformOrigin: 'top left' }}
        >
          {/* Popover Header */}
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 mb-1 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 tracking-tight">
              {t('workspace.switch_title', 'Pilih Ruang Kerja:')}
            </p>
          </div>

          {/* List of Workspaces */}
          <div className="space-y-0.5 max-h-64 overflow-y-auto py-0.5">
            {workspaces.map((workspace) => {
              const isSelected = workspace.id === activeTenantId;
              return (
                <button
                  key={workspace.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(workspace.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-colors cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#06C755]/50 ${
                    isSelected
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <div
                      className={`w-7 h-7 rounded-lg ${
                        workspace.logoUrl
                          ? 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-0.5'
                          : `${workspace.badgeClass} shadow-2xs`
                      } flex items-center justify-center font-bold text-xs shrink-0 select-none overflow-hidden`}
                    >
                      {workspace.logoUrl ? (
                        <img
                          src={workspace.logoUrl}
                          alt={workspace.name}
                          className="w-full h-full object-contain"
                          onError={(e) => {
                            (e.currentTarget as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        workspace.iconLetter
                      )}
                    </div>
                    <span className="truncate text-left text-xs">{workspace.name}</span>
                  </div>

                  {isSelected && (
                    <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 stroke-[2.5]" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
