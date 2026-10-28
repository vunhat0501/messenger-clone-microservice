import { signOut as authSignOut } from '@/app/auth/lib/auth';
import { api } from '@/lib/api';
import { create } from 'zustand';
import { AuthenticatedUser } from '@workspace/types';

interface AuthState {
  user: AuthenticatedUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  signUp: (credentials: {
    name: string;
    email: string;
    password: string;
  }) => Promise<void>;
  signIn: (credentials: any) => Promise<void>;
  signOut: () => Promise<void>;
  checkSession: () => Promise<void>;
  deleteAccount: (userId: number) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  signUp: async (credentials) => {
    try {
      const payload = {
        userName: credentials.name,
        email: credentials.email,
        password: credentials.password,
      };

      await api.post('/auth/signup', payload);
    } catch (error) {
      console.error('Signup error:', error);
      throw error;
    }
  },

  signIn: async (credentials) => {
    try {
      const response = await api.post('/auth/signin', credentials);
      const raw = response.data?.data;
      const userData = raw?.data ? raw.data : raw;
      set({ user: userData, isAuthenticated: true, isLoading: false });
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  },

  signOut: async () => {
    try {
      await api.post('/auth/signout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      await authSignOut();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  checkSession: async () => {
    try {
      const response = await api.get('/auth/me');
      const raw = response.data?.data;
      const userData = raw?.data ? raw.data : raw;
      if (userData) {
        set({ user: userData, isAuthenticated: true, isLoading: false });
      }
    } catch (error) {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  deleteAccount: async (userId: number) => {
    try {
      await api.delete(`/users/${userId}`);
      await authSignOut();

      set({ user: null, isAuthenticated: false, isLoading: false });
      if (typeof window !== 'undefined') {
        window.location.href = '/auth/signin';
      }
    } catch (error) {
      console.error('Account deletion error:', error);
      throw error;
    }
  },
}));
