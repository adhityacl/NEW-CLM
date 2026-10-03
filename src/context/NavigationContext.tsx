import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

// The workspace is a single page served at APP_PATH; the active page lives in
// the `tab` query parameter (e.g. /app?tab=contracts) so every page can be
// bookmarked, shared, reloaded and walked with the browser back/forward buttons.
export const APP_PATH = '/app';
export const TAB_PARAM = 'tab';

const TAB_PATTERN = /^[a-z0-9-]+$/;

const normalizePath = (path: string) => path.toLowerCase().replace(/\/+$/, '') || '/';

/** True when the current location is the workspace shell (`/` or `/app`). */
export const isAppLocation = (): boolean => {
  if (typeof window === 'undefined') return false;
  const path = normalizePath(window.location.pathname);
  return path === '/' || path === APP_PATH;
};

/** Reads `?tab=` from the current URL; null when absent or malformed. */
export const readTabFromUrl = (): string | null => {
  if (typeof window === 'undefined' || !isAppLocation()) return null;
  const tab = new URLSearchParams(window.location.search).get(TAB_PARAM)?.trim().toLowerCase();
  return tab && TAB_PATTERN.test(tab) ? tab : null;
};

/** Builds `/app?tab=<tab>`, keeping any other query parameters and the hash. */
export const buildAppUrl = (tab: string): string => {
  const params = new URLSearchParams(isAppLocation() ? window.location.search : '');
  params.set(TAB_PARAM, tab);
  return `${APP_PATH}?${params.toString()}${isAppLocation() ? window.location.hash : ''}`;
};

interface SetTabOptions {
  /** Replace the current history entry instead of pushing a new one (redirects, guards). */
  replace?: boolean;
}

interface NavigationContextType {
  activeTab: string;
  setActiveTab: (tab: string, itemToSelect?: any, options?: SetTabOptions) => void;
  /** Same as setActiveTab but never adds a history entry — use for permission/module redirects. */
  replaceActiveTab: (tab: string) => void;
  selectedItem: any | null;
  setSelectedItem: (item: any | null) => void;
  clearSelectedItem: () => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

const writeTabToUrl = (tab: string, replace: boolean) => {
  if (typeof window === 'undefined' || !isAppLocation()) return;
  const isSameUrl =
    normalizePath(window.location.pathname) === APP_PATH && readTabFromUrl() === tab;
  if (isSameUrl) return;
  const url = buildAppUrl(tab);
  if (replace) {
    window.history.replaceState({ tab }, '', url);
  } else {
    window.history.pushState({ tab }, '', url);
  }
};

export const NavigationProvider: React.FC<{ children: ReactNode; defaultTab?: string }> = ({
  children,
  defaultTab = 'dashboard',
}) => {
  const [activeTab, setActiveTabState] = useState<string>(() => readTabFromUrl() ?? defaultTab);
  const [selectedItem, setSelectedItemState] = useState<any | null>(null);

  // Canonicalize the initial URL (`/` or `/app` without a tab → `/app?tab=…`)
  // without adding a history entry.
  useEffect(() => {
    writeTabToUrl(activeTab, true);
    // Only on mount; later changes are written by setActiveTab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Browser back/forward: follow the URL without writing it back.
  useEffect(() => {
    const handlePopState = () => {
      const tab = readTabFromUrl();
      if (tab) {
        setActiveTabState(tab);
      } else if (isAppLocation()) {
        setActiveTabState(defaultTab);
        writeTabToUrl(defaultTab, true);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [defaultTab]);

  const setActiveTab = useCallback((tab: string, itemToSelect?: any, options?: SetTabOptions) => {
    setActiveTabState(tab);
    writeTabToUrl(tab, options?.replace ?? false);
    if (itemToSelect !== undefined) {
      setSelectedItemState(itemToSelect);
    }
  }, []);

  const replaceActiveTab = useCallback((tab: string) => {
    setActiveTabState(tab);
    writeTabToUrl(tab, true);
  }, []);

  const setSelectedItem = useCallback((item: any | null) => {
    setSelectedItemState(item);
  }, []);

  const clearSelectedItem = useCallback(() => {
    setSelectedItemState(null);
  }, []);

  return (
    <NavigationContext.Provider
      value={{
        activeTab,
        setActiveTab,
        replaceActiveTab,
        selectedItem,
        setSelectedItem,
        clearSelectedItem,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
};

export const useNavigation = (): NavigationContextType => {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
};
