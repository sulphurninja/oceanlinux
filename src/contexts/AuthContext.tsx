'use client'

import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useSessionAlert } from '@/components/session-alert';

// Define a type for the user state
type User = {
    name: string;
    email: string;
    id: string;
    isAdmin?: boolean;
    stats?: any;
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
    const router = useRouter();
    const pathname = usePathname();
    const { showAlert } = useSessionAlert();

    const fetchUser = useCallback(async () => {
        try {
            setIsLoading(true);
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
            
            if (res.status === 401) {
                // Don't redirect or show alert if already on login page
                if (pathname === '/login' || pathname === '/signup') {
                    setUser(null);
                    return;
                }
                
                // Store current path for redirect after login
                if (pathname && pathname !== '/login') {
                    localStorage.setItem('redirectAfterLogin', pathname);
                }
                
                // Show appropriate message based on error code
                if (errorCode === 'SESSION_EXPIRED' || errorData.message?.includes('expired')) {
                    showAlert('session_expired');
                } else if (errorCode === 'NO_TOKEN') {
                    showAlert('action_requires_login', 'Please log in to access your dashboard.');
                } else {
                    showAlert('unauthorized');
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
                showAlert('network_error');
            }
            
            setUser(null);
        } finally {
            setIsLoading(false);
        }
    }, [pathname, showAlert]);

    const refreshUser = useCallback(async () => {
        await fetchUser();
    }, [fetchUser]);

    const logout = useCallback(async () => {
        try {
            const res = await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'include'
            });

            // Clear local storage
            localStorage.removeItem('lastClientTxnId');
            localStorage.removeItem('lastRenewalTxnId');
            localStorage.removeItem('renewalOrderId');
            localStorage.removeItem('redirectAfterLogin');
            
            setUser(null);
            
            if (res.ok) {
                router.push('/login');
            } else {
                // Still redirect even if logout API fails
                router.push('/login');
            }
        } catch (error) {
            console.error('Logout error:', error);
            // Still clear state and redirect on error
            setUser(null);
            router.push('/login');
        }
    }, [router]);

    useEffect(() => {
        fetchUser();
    }, [fetchUser]);

    // Periodic token check (every 5 minutes)
    useEffect(() => {
        const checkInterval = setInterval(() => {
            if (user) {
                // Silently check if session is still valid
                fetch('/api/users/me', { credentials: 'include' })
                    .then(res => {
                        if (res.status === 401) {
                            showAlert('session_expired');
                            setUser(null);
                        }
                    })
                    .catch(() => {
                        // Ignore network errors in background check
                    });
            }
        }, 5 * 60 * 1000); // 5 minutes

        return () => clearInterval(checkInterval);
    }, [user, showAlert]);

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
