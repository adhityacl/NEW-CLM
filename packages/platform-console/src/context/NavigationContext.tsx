import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

// The workspace is a single page served at APP_PATH; the active page lives in
// the `tab` query parameter (e.g. /app?tab=contracts) so every page can be
// bookmarked, shared, reloaded and walked with the browser back/forward buttons.
export const APP_PATH = '/app';
export const TAB_PARAM = 'tab';

const TAB_PATTERN = /^[a-z0-9-]+$/;

const normalizePath = (path: string) => path.toLowerCase().replace(/\/+$/, '') || '/';

/** True when the current location is the workspace shell (`/` or `/app`). */
export const isAppLocation = (basePath = APP_PATH): boolean => {
  if (typeof window === 'undefined') return false;
  const path = normalizePath(window.location.pathname);
  return path === basePath || (basePath === APP_PATH && path === '/');
};

/** Reads `?tab=` from the current URL; null when absent or malformed. */
export const readTabFromUrl = (basePath = APP_PATH): string | null => {
  if (typeof window === 'undefined' || !isAppLocation(basePath)) return null;
  const tab = new URLSearchParams(window.location.search).get(TAB_PARAM)?.trim().toLowerCase();
  return tab && TAB_PATTERN.test(tab) ? tab : null;
};

/** Builds `/app?tab=<tab>`, keeping any other query parameters and the hash. */
export const buildAppUrl = (tab: string, basePath = APP_PATH): string => {
  const params = new URLSearchParams(isAppLocation(basePath) ? window.location.search : '');
  params.set(TAB_PARAM, tab);
  return `${basePath}?${params.toString()}${isAppLocation(basePath) ? window.location.hash : ''}`;
};

interface SetTabOptions {
  /** Replace the current history entry instead of pushing a new one (redirects, guards). */
  replace?: boolean;
}

interface NavigationContextType {
  activeTab: string;
  setActiveTab: (tab: string, itemToSelect?: any, options?: SetTabOptions) => void;
  /** Same as setActiveTab but never adds a history entry — use for permission/module redirects and alias mapping. */
  replaceActiveTab: (tab: string, intent?: string) => void;
  /** One-shot UI intent carried by a legacy alias (e.g. open the Departments dialog). */
  intent: string | null;
  consumeIntent: () => string | null;
  selectedItem: any | null;
  setSelectedItem: (item: any | null) => void;
  clearSelectedItem: () => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

const writeTabToUrl = (tab: string, replace: boolean, basePath = APP_PATH) => {
  if (typeof window === 'undefined' || !isAppLocation(basePath)) return;
  const isSameUrl =
    normalizePath(window.location.pathname) === basePath && readTabFromUrl(basePath) === tab;
  if (isSameUrl) return;
  const url = buildAppUrl(tab, basePath);
  if (replace) {
    window.history.replaceState({ tab }, '', url);
  } else {
    window.history.pushState({ tab }, '', url);
  }
};

export const NavigationProvider: React.FC<{ children: ReactNode; defaultTab?: string; basePath?: string }> = ({
  children,
  defaultTab = 'login',
  basePath = APP_PATH,
}) => {
  const [activeTab, setActiveTabState] = useState<string>(() => readTabFromUrl(basePath) ?? defaultTab);
  const [selectedItem, setSelectedItemState] = useState<any | null>(null);
  const [intent, setIntent] = useState<string | null>(null);

  // Canonicalize the initial URL (`/` or `/app` without a tab → `/app?tab=…`)
  // without adding a history entry.
  useEffect(() => {
    if (!readTabFromUrl(basePath)) writeTabToUrl(activeTab, true, basePath);
    // Only on mount; later changes are written by setActiveTab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Browser back/forward: follow the URL without writing it back.
  useEffect(() => {
    const handlePopState = () => {
      const tab = readTabFromUrl(basePath);
      if (tab) {
        setActiveTabState(tab);
      } else if (isAppLocation(basePath)) {
        setActiveTabState(defaultTab);
        writeTabToUrl(defaultTab, true, basePath);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [defaultTab, basePath]);

  const setActiveTab = useCallback((tab: string, itemToSelect?: any, options?: SetTabOptions) => {
    setActiveTabState(tab);
    writeTabToUrl(tab, options?.replace ?? false, basePath);
    if (itemToSelect !== undefined) {
      setSelectedItemState(itemToSelect);
    }
  }, [basePath]);

  const replaceActiveTab = useCallback((tab: string, nextIntent?: string) => {
    setActiveTabState(tab);
    if (nextIntent) setIntent(nextIntent);
    writeTabToUrl(tab, true, basePath);
  }, [basePath]);

  const consumeIntent = useCallback(() => {
    const current = intent;
    if (current) setIntent(null);
    return current;
  }, [intent]);

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
        intent,
        consumeIntent,
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

/** Allows shared presentation components to work outside the workspace shell. */
export const useOptionalActiveTab = (): string | undefined => useContext(NavigationContext)?.activeTab;
