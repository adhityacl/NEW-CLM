import React, { useEffect, useState } from 'react';
import { ArrowLeft, Building2, Plug, Users } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useTenant } from '../context/TenantContext';
import { useNavigation } from '../context/NavigationContext';
import { useConfirm } from '../context/ConfirmDialogContext';
import { usePermissions } from '../lib/permissions';
import { confirmLeave, hasUnsavedChanges } from '../lib/unsavedChanges';
import type { SettingsTabId } from '../lib/appRoutes';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { OrganizationTab } from './settings/OrganizationTab';
import { MembersAccessTab } from './settings/MembersAccessTab';
import { IntegrationsTab } from './settings/IntegrationsTab';

/**
 * Tenant Settings (PRD §6.1): one screen, at most three tabs —
 * Organization, Members & Access, Integrations — filtered by the selected
 * organization's capabilities. Hidden tabs are never mounted or fetched.
 */
export const SettingsView: React.FC<{ tab: SettingsTabId }> = ({ tab }) => {
  const { t } = useLanguage();
  const { activeTenant, activeTenantId, leaveOrganization } = useTenant();
  const { setActiveTab, consumeIntent } = useNavigation();
  const confirm = useConfirm();
  const { hasPermission, accessMode, tenantRole } = usePermissions();
  const [intent] = useState(() => consumeIntent());

  const tabs: Array<{ id: SettingsTabId; label: string; icon: React.ReactNode; visible: boolean }> = [
    { id: 'settings-organization', label: t('tb.tab_organization', 'Organization'), icon: <Building2 className="h-4 w-4" aria-hidden="true" />, visible: hasPermission('tenant.settings.read') },
    { id: 'settings-access', label: t('tb.tab_access', 'Members & Access'), icon: <Users className="h-4 w-4" aria-hidden="true" />, visible: hasPermission('tenant.member.read') },
    { id: 'settings-integrations', label: t('tb.tab_integrations', 'Integrations'), icon: <Plug className="h-4 w-4" aria-hidden="true" />, visible: hasPermission('tenant.integration.read') },
  ];
  const visible = tabs.filter((item) => item.visible);
  const orgName = activeTenant?.name || '';

  // Leaving a tab with unsaved changes asks first; nothing is saved silently.
  const go = async (next: string) => {
    if (next === tab) return;
    const ok = await confirmLeave(() => confirm({
      title: t('settings.unsaved_title', 'Unsaved changes'),
      description: t('settings.unsaved_description', 'You have unsaved changes. Discard them and continue?'),
      confirmLabel: t('settings.discard_changes', 'Discard changes'),
      cancelLabel: t('settings.stay', 'Stay'),
      tone: 'danger',
    }));
    if (ok) setActiveTab(next);
  };

  // Unsaved changes also guard closing or reloading the browser tab.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const roleLabel = tenantRole ? ({
    admin: t('tb.role_admin', 'Admin'), manager: t('tb.role_manager', 'Manager'), editor: t('tb.role_editor', 'Editor'), viewer: t('tb.role_viewer', 'Viewer'),
  } as Record<string, string>)[tenantRole] : '';

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            {t('tb.settings_title', 'Settings — {org}', { org: orgName })}
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {accessMode === 'platform'
              ? t('tb.platform_managing', 'Platform administrator managing {org}', { org: orgName })
              : t('tb.role_in_org', 'Role in this organization: {role}', { role: roleLabel })}
          </p>
        </div>
        {accessMode === 'platform' && (
          <Button type="button" size="lg" variant="outline" onClick={async () => { if (await leaveOrganization()) setActiveTab('admin-system-organizations'); }}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />{t('tb.back_to_system_admin', 'Back to System Admin')}
          </Button>
        )}
      </header>

      <Tabs value={tab} onValueChange={(value) => void go(value)} id="settings">
        <TabsList aria-label={t('tb.settings_sections', 'Settings sections')} className="h-auto w-full flex-wrap justify-start gap-1 sm:w-auto">
          {visible.map((item) => (
            <TabsTrigger key={item.id} value={item.id} className="min-h-10">{item.icon}{item.label}</TabsTrigger>
          ))}
        </TabsList>
        {/* key: switching organization remounts the tab and drops drafts (PRD §6.8). */}
        <TabsContent value="settings-organization" className="pt-2">
          {hasPermission('tenant.settings.read') && <OrganizationTab key={activeTenantId} organizationId={activeTenantId} />}
        </TabsContent>
        <TabsContent value="settings-access" className="pt-2">
          {hasPermission('tenant.member.read') && <MembersAccessTab key={activeTenantId} organizationId={activeTenantId} intent={intent} />}
        </TabsContent>
        <TabsContent value="settings-integrations" className="pt-2">
          {hasPermission('tenant.integration.read') && <IntegrationsTab key={activeTenantId} organizationId={activeTenantId} />}
        </TabsContent>
      </Tabs>
    </div>
  );
};
