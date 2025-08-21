import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AuthContextType, User } from '../types';
import api from '../utils/api';
import { toast } from 'react-toastify';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Utility function to safely parse JSON
const parseUserSafely = (userStr: string): User | null => {
  try {
    const parsed = JSON.parse(userStr);
    
    // Validate required user fields to prevent XSS
    if (!parsed || typeof parsed !== 'object' ||
        !parsed.id || typeof parsed.id !== 'number' ||
        !parsed.email || typeof parsed.email !== 'string' ||
        !parsed.username || typeof parsed.username !== 'string') {
      throw new Error('Invalid user structure');
    }
    
    // Sanitize user data
    return {
      id: parsed.id,
      username: parsed.username.trim(),
      email: parsed.email.trim().toLowerCase(),
      is_admin: parsed.is_admin || false,
      profile_picture: parsed.profile_picture || null,
      created_at: parsed.created_at || null,
      updated_at: parsed.updated_at || null
    };
  } catch (error) {
    console.error('Failed to parse stored user data:', error);
    // Clear corrupted data
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    return null;
  }
};

// Utility function to validate token format
const isValidTokenFormat = (token: string): boolean => {
  // JWT should have 3 parts separated by dots
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  
  // Each part should be base64-like (allowing URL-safe base64)
  const base64Regex = /^[A-Za-z0-9_-]+$/;
  return parts.every(part => base64Regex.test(part));
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [profilePictureVersion, setProfilePictureVersion] = useState(Date.now());

  // Memoized verify function to prevent race conditions
  const verifyToken = useCallback(async (tokenToVerify: string) => {
    if (isVerifying) return; // Prevent concurrent verification
    
    setIsVerifying(true);
    try {
      const response = await api.get('/auth/me');
      if (response.data?.user) {
        const updatedUser = {
          id: response.data.user.id,
          username: response.data.user.username?.trim() || '',
          email: response.data.user.email?.trim().toLowerCase() || '',
          is_admin: response.data.user.is_admin || false,
          profile_picture: response.data.user.profile_picture || null,
          created_at: response.data.user.created_at || null,
          updated_at: response.data.user.updated_at || null
        };
        setUser(updatedUser);
        // Update localStorage with the verified user data
        localStorage.setItem('user', JSON.stringify(updatedUser));
      } else {
        throw new Error('Invalid user data from server');
      }
    } catch (error) {
      console.error('Token verification failed:', error);
      logout();
    } finally {
      setLoading(false);
      setIsVerifying(false);
    }
  }, [isVerifying]);

  useEffect(() => {
    const initializeAuth = () => {
      const storedToken = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');

      if (storedToken && storedUser) {
        // Validate token format before using it
        if (!isValidTokenFormat(storedToken)) {
          console.warn('Invalid token format, clearing storage');
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setLoading(false);
          return;
        }

        // Safely parse user data
        const parsedUser = parseUserSafely(storedUser);
        if (parsedUser) {
          setToken(storedToken);
          setUser(parsedUser);
          verifyToken(storedToken);
        } else {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };

    initializeAuth();
  }, [verifyToken]);

  const login = async (email: string, password: string) => {
    try {
      const response = await api.post('/auth/login', { email: email.trim(), password });
      const { token: newToken, user: newUser } = response.data;

      // Validate response data
      if (!newToken || !isValidTokenFormat(newToken) || !newUser) {
        throw new Error('Invalid response from server');
      }

      // Sanitize user data before storing
      const sanitizedUser = {
        id: newUser.id,
        username: newUser.username?.trim() || '',
        email: newUser.email?.trim().toLowerCase() || '',
        is_admin: newUser.is_admin || false,
        profile_picture: newUser.profile_picture || null,
        created_at: newUser.created_at || null,
        updated_at: newUser.updated_at || null
      };

      setToken(newToken);
      setUser(sanitizedUser);

      localStorage.setItem('token', newToken);
      localStorage.setItem('user', JSON.stringify(sanitizedUser));

      toast.success('Login successful!');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Login failed';
      // Don't expose server details to prevent information leakage
      throw new Error(errorMessage.includes('server') ? 'Login failed' : errorMessage);
    }
  };

  const register = async (username: string, email: string, password: string) => {
    try {
      const response = await api.post('/auth/register', { 
        username: username.trim(), 
        email: email.trim().toLowerCase(), 
        password 
      });
      const { token: newToken, user: newUser } = response.data;

      // Validate response data
      if (!newToken || !isValidTokenFormat(newToken) || !newUser) {
        throw new Error('Invalid response from server');
      }

      // Sanitize user data before storing
      const sanitizedUser = {
        id: newUser.id,
        username: newUser.username?.trim() || '',
        email: newUser.email?.trim().toLowerCase() || '',
        is_admin: newUser.is_admin || false,
        profile_picture: newUser.profile_picture || null,
        created_at: newUser.created_at || null,
        updated_at: newUser.updated_at || null
      };

      setToken(newToken);
      setUser(sanitizedUser);

      localStorage.setItem('token', newToken);
      localStorage.setItem('user', JSON.stringify(sanitizedUser));

      toast.success('Registration successful!');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Registration failed';
      // Don't expose server details to prevent information leakage
      throw new Error(errorMessage.includes('server') ? 'Registration failed' : errorMessage);
    }
  };

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    toast.info('Logged out successfully');
  }, []);

  const updateUser = useCallback(async (updates: Partial<User>) => {
    console.log('[AUTH_CONTEXT] updateUser llamado con:', updates);
    
    if (user) {
      const updatedUser = { ...user, ...updates };
      console.log('[AUTH_CONTEXT] Usuario antes:', user);
      console.log('[AUTH_CONTEXT] Usuario después:', updatedUser);
      
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      
      // Si se actualizó la foto de perfil, actualizar la versión con timestamp
      if (updates.profile_picture !== undefined) {
        console.log('[AUTH_CONTEXT] Actualizando versión de foto de perfil');
        const newVersion = Date.now();
        console.log('[AUTH_CONTEXT] Nueva versión:', newVersion);
        setProfilePictureVersion(newVersion);
      }
      
      // También verificar con el servidor para obtener la información más actualizada
      if (token) {
        try {
          console.log('[AUTH_CONTEXT] Consultando servidor para sincronizar usuario...');
          const response = await api.get('/auth/me');
          console.log('[AUTH_CONTEXT] Respuesta del servidor:', response.data);
          
          if (response.data?.user) {
            const serverUser = {
              id: response.data.user.id,
              username: response.data.user.username?.trim() || '',
              email: response.data.user.email?.trim().toLowerCase() || '',
              is_admin: response.data.user.is_admin || false,
              profile_picture: response.data.user.profile_picture || null,
              created_at: response.data.user.created_at || null,
              updated_at: response.data.user.updated_at || null
            };
            console.log('[AUTH_CONTEXT] Actualizando con datos del servidor:', serverUser);
            setUser(serverUser);
            localStorage.setItem('user', JSON.stringify(serverUser));
          }
        } catch (error) {
          console.error('Error al sincronizar usuario con servidor:', error);
          // Mantener la actualización local si falla la sincronización
        }
      }
    }
  }, [user, token]);

  const value: AuthContextType = {
    user,
    token,
    login,
    register,
    logout,
    updateUser,
    profilePictureVersion,
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};