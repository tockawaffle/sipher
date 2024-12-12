// contexts/user.tsx
'use client';

import {createContext, useContext, useState} from 'react';
import {useRouter} from 'next/navigation';

interface UserContextType {
  user: NonNullable<SiPher.User>;
  getUser: (context: string, userId?: string) => Promise<NonNullable<SiPher.User>>;
  updateUser: (newUserData: NonNullable<SiPher.User>) => void;
}

const UserContext = createContext<UserContextType | null>(null);

export function useUser() {
  const context = useContext(UserContext);
  const router = useRouter();
  
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  
  return {
    user: context.user,
    updateUser: context.updateUser,
    getUser: async (context: string, userId?: string) => {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`useUser().getUser(): Being called by ${context}`)
      }
      
      try {
        const response = await fetch(`/api/auth/get_user?${
          userId && `uuid=${
            encodeURIComponent(userId)
          }`
        }`);
        if (!response.ok) {
          const error = await response.json();
          if (error.message?.includes("Auth session missing!")) {
            throw new Error('No authenticated user');
          }
          throw new Error(error.message || 'Authentication failed');
        }
        
        const {user} = await response.json();
        return user as NonNullable<SiPher.User>;
      } catch (error) {
        console.error('Failed to get user:', error);
        router.push('/auth/login');
        throw error;
      }
    },
    checkAuth: async (context: string) => {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`useUser().checkAuth(): Being called by ${context}`)
      }
      try {
        const response = await fetch('/api/auth/get_user');
        return response.ok;
      } catch {
        return false;
      }
    }
  };
}

export function UserProvider(
  {
    children,
    initialUser
  }: {
    children: React.ReactNode;
    initialUser: NonNullable<SiPher.User>;
  }
) {
  const [user, setUser] = useState<NonNullable<SiPher.User>>(initialUser);

  const updateUser = (newUserData: NonNullable<SiPher.User>) => {
    setUser(newUserData);
  };

  return (
    <UserContext.Provider value={{
      user,
      updateUser,
      getUser: async (context: string, userId?: string) => {
        const response = await fetch(`/api/auth/get_user?${
          userId && `uuid=${
            encodeURIComponent(userId)
          }`
        }`);
        if (!response.ok) {
          throw new Error('Failed to get user');
        }
        const {user} = await response.json();
        return user as NonNullable<SiPher.User>;
      }
    }}>
      {children}
    </UserContext.Provider>
  );
}