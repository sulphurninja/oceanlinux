'use client'

import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useSessionAlert } from '@/components/session-alert';
import { redirectToLogin } from '@/lib/redirectToLogin';

// Define a type for the user state
type BillingAddress = {
    line?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
};

type User = {
    name: string;
    email: string;
    id?: string;
    _id?: string;
    isAdmin?: boolean;
    createdAt?: string;
    stats?: any;
    phone?: string;
    avatar?: string;
    isVerified?: boolean;
    userType?: 'customer' | 'reseller' | 'admin';
    billingAddress?: BillingAddress;
} | null;

// Define the context type
interface AuthContextType {
    user: User;
    setUser: React.Dispatch<React.SetStateAction<User>>;
    isLoading: boolean;
    isAuthenticated: boolean;
    refreshUser: () => Promise<void>;
    logout: () => Promise<void>;
}

// Create the context with a default undefined value
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// AuthProvider props type
interface AuthProviderProps {
    children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
    const [user, setUser] = useState<User>(null);
    const [isLoading, setIsLoading] = useState(true);
    const pathname = usePathname();
    const { showAlert } = useSessionAlert();
    const pathnameRef = useRef(pathname);
    const showAlertRef = useRef(showAlert);
    pathnameRef.current = pathname;
    showAlertRef.current = showAlert;

    const fetchUser = useCallback(async (opts?: { silent?: boolean }) => {
        try {
            if (!opts?.silent) setIsLoading(true);
            const res = await fetch('/api/users/me', {
                credentials: 'include'
            });
            
            if (res.ok) {
                const userData = await res.json();
                setUser(userData);
                return;
            }

            // Handle different error statuses
            const errorData = await res.json().catch(() => ({}));
            const errorCode = errorData.code || '';
            const path = pathnameRef.current;
            const alert = showAlertRef.current;
            
            if (res.status === 401) {
                // Don't redirect or show alert if already on login page
                if (path === '/login' || path === '/signup') {
                    setUser(null);
                    return;
                }
                
                // Store current path for redirect after login
                if (path && path !== '/login') {
                    localStorage.setItem('redirectAfterLogin', path);
                }
                
                // Show appropriate message based on error code
                if (errorCode === 'SESSION_EXPIRED' || errorData.message?.includes('expired')) {
                    alert('session_expired');
                } else if (errorCode === 'NO_TOKEN') {
                    alert('action_requires_login', 'Please log in to access your dashboard.');
                } else {
                    alert('unauthorized');
                }
                
                setUser(null);
            } else {
                console.error('Failed to fetch user:', errorData.message);
                setUser(null);
            }
        } catch (error) {
            console.error('Auth fetch error:', error);
            
            // Network error
            if (error instanceof TypeError && error.message.includes('fetch')) {
                showAlertRef.current('network_error');
            }
            
            setUser(null);
        } finally {
            if (!opts?.silent) setIsLoading(false);
        }
    }, []);

    const refreshUser = useCallback(async () => {
        await fetchUser({ silent: true });
    }, [fetchUser]);

    const logout = useCallback(async () => {
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'include'
            });
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            setUser(null);
            redirectToLogin();
        }
    }, []);

    useEffect(() => {
        fetchUser();
    }, [fetchUser]);

    // Periodic token check (every 5 minutes) — skip while the tab is hidden
    useEffect(() => {
        const checkInterval = setInterval(() => {
            if (typeof document !== 'undefined' && document.hidden) return;
            if (user) {
                fetch('/api/users/me', { credentials: 'include' })
                    .then(res => {
                        if (res.status === 401) {
                            showAlertRef.current('session_expired');
                            setUser(null);
                        }
                    })
                    .catch(() => {
                        // Ignore network errors in background check
                    });
            }
        }, 5 * 60 * 1000);

        return () => clearInterval(checkInterval);
    }, [user]);

    return (
        <AuthContext.Provider value={{ 
            user, 
            setUser, 
            isLoading, 
            isAuthenticated: !!user,
            refreshUser,
            logout
        }}>
            {children}
        </AuthContext.Provider>
    );
};

// Custom hook to use the auth context
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
