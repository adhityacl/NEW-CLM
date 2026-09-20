import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authClient } from '../lib/auth-client';
import { UserSession, ActivityLog } from '../types';

import { normalizeRole, StandardRole } from '../lib/rbacScoping';

interface AuthContextType {
  user: UserSession | null;
  loading: boolean;
  standardRole: StandardRole;
  isSuperuser: boolean;
  isAdmin: boolean;
  isManager: boolean;
  isEditor: boolean;
  isViewer: boolean;
  isLegal: boolean;
  isFinance: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUserName: (newName: string) => void;
  fetchActivityLogs: () => Promise<ActivityLog[]>;
  activityLogs: ActivityLog[];
  refreshActivityLogs: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);

  const fetchUserRoleAndProfile = useCallback(async (tokenParam?: string): Promise<UserSession | null> => {
    try {
      const storedToken = tokenParam || localStorage.getItem('auth_session_token') || '';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (storedToken) {
        headers['Authorization'] = `Bearer ${storedToken}`;
        headers['x-session-token'] = storedToken;
      }

      const res = await fetch('/api/user/my-role', {
        headers,
        credentials: 'include',
        cache: 'no-store',
      });

      if (res.ok) {
        const text = await res.text();
        if (!text || text.trim().startsWith('<')) return null;
        const data = JSON.parse(text);
        if (data && data.email) {
          const userSession: UserSession = {
            email: data.email,
            name: data.name || data.email.split('@')[0],
            role: data.role || 'Staff',
            department: data.department || 'Commercial & Marketing',
            organizationId: data.organizationId,
            allowedTenantIds: data.allowedTenantIds,
            isGlobalAdmin: data.isGlobalAdmin,
            loginTime: data.loginTime || new Date().toISOString(),
          };
          return userSession;
        }
      }
    } catch (err) {
      console.warn('Failed fetching user role', err);
    }
    return null;
  }, []);

  const refreshUser = useCallback(async () => {
    const activeUser = await fetchUserRoleAndProfile();
    setUser(activeUser);
    if (!activeUser) {
      localStorage.removeItem('auth_session_token');
    }
  }, [fetchUserRoleAndProfile]);

  // Initial session check on mount
  useEffect(() => {
    let isMounted = true;
    const initAuth = async () => {
      try {
        const activeUser = await fetchUserRoleAndProfile();
        if (isMounted) {
          setUser(activeUser);
        }
      } catch (err) {
        if (isMounted) {
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    initAuth();
    return () => {
      isMounted = false;
    };
  }, [fetchUserRoleAndProfile]);

  const login = async (email: string, password: string) => {
    const { data, error } = await authClient.signIn.email({
      email,
      password,
    });

    if (error) {
      throw error;
    }

    const token = data?.token || (data as any)?.session?.token;
    if (token) {
      localStorage.setItem('auth_session_token', token);
    }

    // Fetch user details and role from backend
    const activeUser = await fetchUserRoleAndProfile(token);
    if (activeUser) {
      setUser(activeUser);
    } else if (data?.user) {
      // Fallback to client user if my-role is still syncing
      setUser({
        email: data.user.email,
        name: data.user.name || data.user.email.split('@')[0],
        role: (data.user as any).role === 'admin' ? 'Admin' : 'Staff',
        department: 'Commercial & Marketing',
        loginTime: new Date().toISOString(),
      });
    }

    fetchActivityLogs();
    window.dispatchEvent(new CustomEvent('auth-state-changed'));
    window.dispatchEvent(new CustomEvent('organization-updated'));
  };

  useEffect(() => {
    if (user) {
      localStorage.setItem('auth_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('auth_user');
    }
  }, [user]);

  const fetchActivityLogs = async (): Promise<ActivityLog[]> => {
    try {
      const storedToken = localStorage.getItem('auth_session_token') || '';
      const headers: Record<string, string> = {};
      if (storedToken) {
        headers['Authorization'] = `Bearer ${storedToken}`;
        headers['x-session-token'] = storedToken;
      }
      const res = await fetch('/api/activity-logs', {
        headers,
        credentials: 'include',
        cache: 'no-store',
      });
      if (res.ok) {
        const text = await res.text();
        if (!text || text.trim().startsWith('<')) return [];
        const data = JSON.parse(text);
        if (Array.isArray(data)) {
          setActivityLogs(data);
          return data;
        }
      }
    } catch (err) {
      console.warn('Failed fetching activity logs', err);
    }
    return [];
  };

  useEffect(() => {
    if (user) {
      fetchActivityLogs();
    }
  }, [user]);

  const logout = async () => {
    try {
      const storedToken = localStorage.getItem('auth_session_token') || '';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (storedToken) {
        headers['Authorization'] = `Bearer ${storedToken}`;
        headers['x-session-token'] = storedToken;
      }
      await fetch('/api/user/log-activity', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ actionType: 'LOGOUT' }),
      });
    } catch (e) {
      // ignore
    }
    localStorage.removeItem('auth_session_token');
    await (authClient.signOut as any)();
    setUser(null);
    setActivityLogs([]);
  };

  const updateUserName = (newName: string) => {
    if (user) {
      setUser({ ...user, name: newName });
    }
  };

  const standardRole = normalizeRole(user?.role);
  const isSuperuser = standardRole === 'superuser';
  const isAdmin = standardRole === 'admin' || standardRole === 'superuser';
  const isManager = standardRole === 'manager' || isAdmin;
  const isEditor = standardRole === 'editor' || isManager;
  const isViewer = standardRole === 'viewer';
  const isLegal = isManager || isEditor || isAdmin;
  const isFinance = isEditor || isManager || isAdmin;

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        standardRole,
        isSuperuser,
        isAdmin,
        isManager,
        isEditor,
        isViewer,
        isLegal,
        isFinance,
        login,
        logout,
        updateUserName,
        fetchActivityLogs,
        activityLogs,
        refreshActivityLogs: fetchActivityLogs,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
