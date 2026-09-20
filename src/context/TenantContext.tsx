import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Tenant, TenantBranding } from '../types';

interface TenantContextType {
  tenants: Tenant[];
  activeTenant: Tenant | null;
  activeTenantId: string;
  branding: TenantBranding;
  loading: boolean;
  switchTenant: (tenantId: string) => Promise<boolean>;
  createTenant: (tenantData: Omit<Tenant, 'id' | 'created_at'>) => Promise<boolean>;
  updateTenant: (id: string, updates: Partial<Tenant>) => Promise<boolean>;
  deleteTenant: (id: string) => Promise<boolean>;
  updateBranding: (brandingData: Partial<TenantBranding>) => Promise<boolean>;
  refreshTenants: () => Promise<void>;
}

const DEFAULT_BRANDING: TenantBranding = {
  appName: 'LMS - Legal Management System',
  logoUrl: 'https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=250&auto=format&fit=crop&q=80',
  primaryColor: '#06C755',
  footerText: '© 2026 PT Info Tekno Siaga (Adapundi). All rights reserved.',
  loginHeadline: 'Portal Manajemen Kontrak, Partner & Insertion Order',
};

const DEFAULT_TENANTS: Tenant[] = [
  {
    id: 'org_1789542306289_b3a4f3',
    name: 'Adapundi',
    legalEntity: 'PT',
    brandName: 'Adapundi',
    tagline: 'Legal & Commercial Contract Management',
    logoUrl: '/favicon.png',
    primaryColor: '#06C755',
    currency: 'IDR',
    domainSlug: 'adapundi',
    isDefault: true,
    driveFolderId: '1FpW5eMbZ-4LAvR2k_sC39VcKmnTDaopY',
    driveFolderLink: 'https://drive.google.com/drive/folders/1FpW5eMbZ-4LAvR2k_sC39VcKmnTDaopY',
  },
];

async function safeJson<T = any>(res: Response): Promise<T | null> {
  try {
    const text = await res.text();
    if (!text || text.trim().startsWith('<')) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tenants, setTenants] = useState<Tenant[]>(DEFAULT_TENANTS);
  const [activeTenantId, setActiveTenantId] = useState<string>(() => {
    return localStorage.getItem('activeOrganizationId') || 'org_1789542306289_b3a4f3';
  });
  const [branding, setBranding] = useState<TenantBranding>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchTenantsAndBranding = useCallback(async () => {
    try {
      const [tenantsRes, brandingRes] = await Promise.all([
        fetch('/api/tenants'),
        fetch('/api/branding'),
      ]);

      if (tenantsRes.ok) {
        const tData = await safeJson(tenantsRes);
        if (tData?.success && Array.isArray(tData.tenants)) {
          setTenants(tData.tenants);
          if (tData.activeTenantId) {
            setActiveTenantId(tData.activeTenantId);
          }
        }
      }

      if (brandingRes.ok) {
        const bData = await safeJson(brandingRes);
        if (bData?.success && bData.branding) {
          setBranding(bData.branding);
        }
      }
    } catch (err) {
      console.warn('Failed to load tenants/branding from server:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTenantsAndBranding();

    const handleOrgUpdated = () => {
      fetchTenantsAndBranding();
    };
    window.addEventListener('organization-updated', handleOrgUpdated);
    return () => {
      window.removeEventListener('organization-updated', handleOrgUpdated);
    };
  }, [fetchTenantsAndBranding]);

  const activeTenant = (tenants || []).find((t) => t.id === activeTenantId) || (tenants || [])[0] || DEFAULT_TENANTS[0];

  // Apply dynamic document title & favicon
  useEffect(() => {
    if (branding?.appName) {
      document.title = activeTenant?.name
        ? `${activeTenant.brandName || activeTenant.name} | ${branding.appName}`
        : branding.appName;
    }
    if (branding?.primaryColor) {
      document.documentElement.style.setProperty('--brand-primary', branding.primaryColor);
    }
  }, [branding, activeTenant]);

  const switchTenant = async (tenantId: string): Promise<boolean> => {
    setActiveTenantId(tenantId);
    localStorage.setItem('activeOrganizationId', tenantId);
    try {
      const res = await fetch('/api/tenants/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      });
      // Also try auth-console endpoint if needed
      fetch(`/api/auth-console/organizations/${tenantId}/set-active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => {});
      
      await fetchTenantsAndBranding();
      window.dispatchEvent(new CustomEvent('organization-updated'));
      return true;
    } catch (e) {
      console.warn('Error switching tenant:', e);
      return true;
    }
  };

  const createTenant = async (tenantData: Omit<Tenant, 'id' | 'created_at'>): Promise<boolean> => {
    try {
      const res = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tenantData),
      });
      if (res.ok) {
        const data = await safeJson(res);
        if (data?.success && data.tenants) {
          setTenants(data.tenants);
          return true;
        }
      }
    } catch (e) {
      console.warn('Error creating tenant:', e);
    }
    return false;
  };

  const updateTenant = async (id: string, updates: Partial<Tenant>): Promise<boolean> => {
    try {
      const res = await fetch(`/api/tenants/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await safeJson(res);
        if (data?.success && data.tenants) {
          setTenants(data.tenants);
          return true;
        }
      }
    } catch (e) {
      console.warn('Error updating tenant:', e);
    }
    return false;
  };

  const deleteTenant = async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/tenants/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const data = await safeJson(res);
        if (data?.success && data.tenants) {
          setTenants(data.tenants);
          if (data.activeTenantId) {
            setActiveTenantId(data.activeTenantId);
          }
          return true;
        }
      }
    } catch (e) {
      console.warn('Error deleting tenant:', e);
    }
    return false;
  };

  const updateBranding = async (brandingData: Partial<TenantBranding>): Promise<boolean> => {
    try {
      const res = await fetch('/api/branding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(brandingData),
      });
      if (res.ok) {
        const data = await safeJson(res);
        if (data?.success && data.branding) {
          setBranding(data.branding);
          return true;
        }
      }
    } catch (e) {
      console.warn('Error updating branding:', e);
    }
    return false;
  };

  return (
    <TenantContext.Provider
      value={{
        tenants,
        activeTenant,
        activeTenantId,
        branding,
        loading,
        switchTenant,
        createTenant,
        updateTenant,
        deleteTenant,
        updateBranding,
        refreshTenants: fetchTenantsAndBranding,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = (): TenantContextType => {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
};
