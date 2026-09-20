import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface NavigationContextType {
  activeTab: string;
  setActiveTab: (tab: string, itemToSelect?: any) => void;
  selectedItem: any | null;
  setSelectedItem: (item: any | null) => void;
  clearSelectedItem: () => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export const NavigationProvider: React.FC<{ children: ReactNode; defaultTab?: string }> = ({
  children,
  defaultTab = 'dashboard',
}) => {
  const [activeTab, setActiveTabState] = useState<string>(defaultTab);
  const [selectedItem, setSelectedItemState] = useState<any | null>(null);

  const setActiveTab = useCallback((tab: string, itemToSelect?: any) => {
    setActiveTabState(tab);
    if (itemToSelect !== undefined) {
      setSelectedItemState(itemToSelect);
    }
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
