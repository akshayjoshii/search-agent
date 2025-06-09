import React, { createContext, useContext, useState, useEffect, ReactNode, FC } from 'react';

// Define interfaces
export interface AuthUser {
  name?: string;
  email?: string;
  picture?: string;
  // Add other fields as needed from the Google userinfo endpoint
}

export interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: () => void;
  logout: () => Promise<void>;
  checkAuthStatus: () => Promise<void>;
}

// Create AuthContext
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Create AuthProvider component
export const AuthProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const login = () => {
    // Backend prefix is /auth, so login URL is /auth/login/google
    window.location.href = '/auth/login/google';
  };

  const checkAuthStatus = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/auth/user/me');
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await fetch('/auth/logout');
      setUser(null);
      // Optional: redirect to home or login page
      // window.location.href = '/app';
    } catch (error) {
      console.error('Error logging out:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkAuthStatus();
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, checkAuthStatus }}>
      {children}
    </AuthContext.Provider>
  );
};

// Create useAuth custom hook
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
