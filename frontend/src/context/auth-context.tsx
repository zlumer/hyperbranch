import React, { createContext, useContext, useEffect, useState } from 'react';

interface AuthContextType {
  apiKey: string | null;
  setApiKey: (key: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [apiKey, setApiKeyState] = useState<string | null>(() => {
    return localStorage.getItem('HB_API_KEY');
  });

  const setApiKey = (key: string) => {
    setApiKeyState(key);
    if (key) {
      localStorage.setItem('HB_API_KEY', key);
    } else {
      localStorage.removeItem('HB_API_KEY');
    }
  };

  useEffect(() => {
    // Sync state with storage in case it changes externally
    const handleStorageChange = () => {
      setApiKeyState(localStorage.getItem('HB_API_KEY'));
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return (
    <AuthContext.Provider value={{ apiKey, setApiKey }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
