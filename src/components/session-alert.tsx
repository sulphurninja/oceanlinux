'use client';

import { useEffect, useState, createContext, useContext, ReactNode, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Clock,
  ShieldAlert,
  LogIn,
  RefreshCw,
  WifiOff,
  ServerCrash,
  KeyRound,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2
} from 'lucide-react';

// Types of session/auth alerts
export type SessionAlertType =
  | 'session_expired'
  | 'token_invalid'
  | 'unauthorized'
  | 'network_error'
  | 'server_error'
  | 'payment_session_expired'
  | 'action_requires_login'
  | 'account_suspended'
  | 'success'
  | 'error'
  | 'warning'
  | 'info';

interface SessionAlertConfig {
  type: SessionAlertType;
  title: string;
  message: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  primaryAction?: {
    label: string;
    action: () => void;
  };
  secondaryAction?: {
    label: string;
    action: () => void;
  };
  autoClose?: number; // ms
}

interface SessionAlertContextType {
  showAlert: (type: SessionAlertType, customMessage?: string) => void;
  showCustomAlert: (config: Partial<SessionAlertConfig> & { type: SessionAlertType }) => void;
  hideAlert: () => void;
  isVisible: boolean;
}

const SessionAlertContext = createContext<SessionAlertContextType | undefined>(undefined);

// Predefined alert configurations
const getAlertConfig = (
  type: SessionAlertType,
  customMessage?: string,
  router?: ReturnType<typeof useRouter>
): SessionAlertConfig => {
  const configs: Record<SessionAlertType, SessionAlertConfig> = {
    session_expired: {
      type: 'session_expired',
      title: 'Session Expired',
      message: customMessage || 'Your session has expired for security reasons. Please log in again to continue.',
      icon: Clock,
      iconColor: 'text-amber-500',
      primaryAction: {
        label: 'Log In Again',
        action: () => {
          localStorage.setItem('redirectAfterLogin', window.location.pathname);
          router?.push('/login');
        }
      },
      secondaryAction: {
        label: 'Go to Home',
        action: () => router?.push('/')
      }
    },
    token_invalid: {
      type: 'token_invalid',
      title: 'Authentication Error',
      message: customMessage || 'Your authentication token is invalid or has been tampered with. Please log in again.',
      icon: KeyRound,
      iconColor: 'text-red-500',
      primaryAction: {
        label: 'Log In',
        action: () => router?.push('/login')
      }
    },
    unauthorized: {
      type: 'unauthorized',
      title: 'Access Denied',
      message: customMessage || 'You don\'t have permission to access this resource. Please log in with an authorized account.',
      icon: ShieldAlert,
      iconColor: 'text-red-500',
      primaryAction: {
        label: 'Log In',
        action: () => router?.push('/login')
      },
      secondaryAction: {
        label: 'Go Back',
        action: () => router?.back()
      }
    },
    network_error: {
      type: 'network_error',
      title: 'Connection Problem',
      message: customMessage || 'Unable to connect to the server. Please check your internet connection and try again.',
      icon: WifiOff,
      iconColor: 'text-gray-500',
      primaryAction: {
        label: 'Retry',
        action: () => window.location.reload()
      }
    },
    server_error: {
      type: 'server_error',
      title: 'Server Error',
      message: customMessage || 'Something went wrong on our end. Our team has been notified. Please try again in a few moments.',
      icon: ServerCrash,
      iconColor: 'text-red-500',
      primaryAction: {
        label: 'Try Again',
        action: () => window.location.reload()
      },
      secondaryAction: {
        label: 'Contact Support',
        action: () => router?.push('/support/tickets')
      }
    },
    payment_session_expired: {
      type: 'payment_session_expired',
      title: 'Payment Session Expired',
      message: customMessage || 'Your payment session has expired. Don\'t worry - if your payment was successful, it will be processed automatically. You can check your order status in your dashboard.',
      icon: Clock,
      iconColor: 'text-amber-500',
      primaryAction: {
        label: 'View My Orders',
        action: () => router?.push('/dashboard/viewLinux')
      },
      secondaryAction: {
        label: 'Contact Support',
        action: () => router?.push('/support/tickets')
      }
    },
    action_requires_login: {
      type: 'action_requires_login',
      title: 'Login Required',
      message: customMessage || 'Please log in to continue with this action.',
      icon: LogIn,
      iconColor: 'text-blue-500',
      primaryAction: {
        label: 'Log In',
        action: () => {
          localStorage.setItem('redirectAfterLogin', window.location.pathname);
          router?.push('/login');
        }
      },
      secondaryAction: {
        label: 'Create Account',
        action: () => router?.push('/signup')
      }
    },
    account_suspended: {
      type: 'account_suspended',
      title: 'Account Suspended',
      message: customMessage || 'Your account has been temporarily suspended. Please contact support for assistance.',
      icon: ShieldAlert,
      iconColor: 'text-red-500',
      primaryAction: {
        label: 'Contact Support',
        action: () => router?.push('/support/tickets')
      }
    },
    success: {
      type: 'success',
      title: 'Success',
      message: customMessage || 'Operation completed successfully.',
      icon: CheckCircle2,
      iconColor: 'text-green-500',
      primaryAction: {
        label: 'Continue',
        action: () => { }
      },
      autoClose: 3000
    },
    error: {
      type: 'error',
      title: 'Error',
      message: customMessage || 'An error occurred. Please try again.',
      icon: XCircle,
      iconColor: 'text-red-500',
      primaryAction: {
        label: 'OK',
        action: () => { }
      }
    },
    warning: {
      type: 'warning',
      title: 'Warning',
      message: customMessage || 'Please review this information carefully.',
      icon: AlertTriangle,
      iconColor: 'text-amber-500',
      primaryAction: {
        label: 'OK',
        action: () => { }
      }
    },
    info: {
      type: 'info',
      title: 'Information',
      message: customMessage || 'Here\'s some information for you.',
      icon: RefreshCw,
      iconColor: 'text-blue-500',
      primaryAction: {
        label: 'Got it',
        action: () => { }
      }
    }
  };

  return configs[type];
};

export function SessionAlertProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isVisible, setIsVisible] = useState(false);
  const [currentConfig, setCurrentConfig] = useState<SessionAlertConfig | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  const hideAlert = useCallback(() => {
    setIsVisible(false);
    setCurrentConfig(null);
    setIsActionLoading(false);
  }, []);

  const showAlert = useCallback((type: SessionAlertType, customMessage?: string) => {
    const config = getAlertConfig(type, customMessage, router);
    setCurrentConfig(config);
    setIsVisible(true);

    // Auto-close if configured
    if (config.autoClose) {
      setTimeout(() => {
        hideAlert();
      }, config.autoClose);
    }
  }, [router, hideAlert]);

  const showCustomAlert = useCallback((config: Partial<SessionAlertConfig> & { type: SessionAlertType }) => {
    const baseConfig = getAlertConfig(config.type, config.message, router);
    setCurrentConfig({ ...baseConfig, ...config });
    setIsVisible(true);
  }, [router]);

  const handlePrimaryAction = async () => {
    if (currentConfig?.primaryAction) {
      setIsActionLoading(true);
      try {
        await currentConfig.primaryAction.action();
      } finally {
        setIsActionLoading(false);
        hideAlert();
      }
    }
  };

  const handleSecondaryAction = () => {
    if (currentConfig?.secondaryAction) {
      currentConfig.secondaryAction.action();
    }
    hideAlert();
  };

  const IconComponent = currentConfig?.icon || AlertTriangle;

  return (
    <SessionAlertContext.Provider value={{ showAlert, showCustomAlert, hideAlert, isVisible }}>
      {children}

      <AlertDialog open={isVisible} onOpenChange={setIsVisible}>
        <AlertDialogContent className="sm:max-w-md border-border/50 bg-background/95 backdrop-blur-xl">
          <AlertDialogHeader className="space-y-4">
            {/* Icon with glow effect */}
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted/50 ring-8 ring-muted/20">
              <IconComponent className={`h-8 w-8 ${currentConfig?.iconColor || 'text-primary'}`} />
            </div>

            <AlertDialogTitle className="text-center text-xl">
              {currentConfig?.title}
            </AlertDialogTitle>

            <AlertDialogDescription className="text-center text-base leading-relaxed">
              {currentConfig?.message}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter className="flex-col sm:flex-col gap-2 mt-4">
            {currentConfig?.primaryAction && (
              <Button
                onClick={handlePrimaryAction}
                disabled={isActionLoading}
                className="w-full"
                size="lg"
              >
                {isActionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {currentConfig.primaryAction.label}
              </Button>
            )}

            {currentConfig?.secondaryAction && (
              <Button
                variant="outline"
                onClick={handleSecondaryAction}
                className="w-full"
                size="lg"
              >
                {currentConfig.secondaryAction.label}
              </Button>
            )}
          </AlertDialogFooter>

          {/* Subtle decorative element */}
          <div className="absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
        </AlertDialogContent>
      </AlertDialog>
    </SessionAlertContext.Provider>
  );
}

// Hook to use session alerts
export function useSessionAlert() {
  const context = useContext(SessionAlertContext);
  if (context === undefined) {
    throw new Error('useSessionAlert must be used within a SessionAlertProvider');
  }
  return context;
}

// Utility function to handle API errors and show appropriate alerts
export function handleApiError(
  error: any,
  showAlert: (type: SessionAlertType, message?: string) => void,
  options?: {
    customMessages?: Partial<Record<number | 'network' | 'default', string>>;
  }
) {
  const { customMessages = {} } = options || {};

  // Network error
  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    showAlert('network_error', customMessages.network);
    return;
  }

  // HTTP status errors
  const status = error.status || error.response?.status;

  switch (status) {
    case 401:
      // Check if it's a token expiration
      const message = error.message?.toLowerCase() || '';
      if (message.includes('expired') || message.includes('jwt')) {
        showAlert('session_expired', customMessages[401]);
      } else {
        showAlert('unauthorized', customMessages[401]);
      }
      break;

    case 403:
      showAlert('unauthorized', customMessages[403] || 'You don\'t have permission to perform this action.');
      break;

    case 500:
    case 502:
    case 503:
      showAlert('server_error', customMessages[500]);
      break;

    default:
      showAlert('error', customMessages.default || error.message || 'An unexpected error occurred.');
  }
}
