'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSessionAlert, SessionAlertType, handleApiError } from '@/components/session-alert';
import { toast } from 'sonner';

interface ApiOptions {
  showErrorAlert?: boolean;
  showSuccessToast?: boolean;
  successMessage?: string;
  errorMessages?: Partial<Record<number | 'network' | 'default', string>>;
  onUnauthorized?: () => void;
  retryOnFail?: boolean;
  maxRetries?: number;
}

interface ApiResponse<T> {
  data: T | null;
  error: Error | null;
  status: number | null;
}

export function useApi() {
  const { showAlert } = useSessionAlert();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const fetchWithAuth = useCallback(async <T = any>(
    url: string,
    options: RequestInit = {},
    apiOptions: ApiOptions = {}
  ): Promise<ApiResponse<T>> => {
    const {
      showErrorAlert = true,
      showSuccessToast = false,
      successMessage,
      errorMessages = {},
      onUnauthorized,
      retryOnFail = false,
      maxRetries = 1
    } = apiOptions;

    setIsLoading(true);
    let lastError: Error | null = null;
    let attempts = 0;

    while (attempts <= (retryOnFail ? maxRetries : 0)) {
      try {
        const response = await fetch(url, {
          ...options,
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...options.headers,
          },
        });

        const contentType = response.headers.get('content-type');
        let data: any = null;

        if (contentType?.includes('application/json')) {
          data = await response.json();
        } else {
          data = await response.text();
        }

        if (!response.ok) {
          const error: any = new Error(data?.message || `Request failed with status ${response.status}`);
          error.status = response.status;
          error.data = data;

          // Handle auth errors
          if (response.status === 401) {
            if (onUnauthorized) {
              onUnauthorized();
            } else if (showErrorAlert) {
              // Check for specific auth error types
              const errorMsg = data?.message?.toLowerCase() || '';
              
              if (errorMsg.includes('expired') || errorMsg.includes('jwt expired')) {
                showAlert('session_expired', errorMessages[401] || 'Your session has expired. Please log in again to continue.');
              } else if (errorMsg.includes('invalid') || errorMsg.includes('malformed')) {
                showAlert('token_invalid', errorMessages[401]);
              } else {
                showAlert('unauthorized', errorMessages[401]);
              }
            }

            setIsLoading(false);
            return { data: null, error, status: response.status };
          }

          throw error;
        }

        // Success
        if (showSuccessToast && successMessage) {
          toast.success(successMessage);
        }

        setIsLoading(false);
        return { data: data as T, error: null, status: response.status };

      } catch (error: any) {
        lastError = error;
        attempts++;

        // Only retry on network errors or 5xx errors
        const shouldRetry = retryOnFail &&
          attempts <= maxRetries &&
          (error.name === 'TypeError' || (error.status && error.status >= 500));

        if (!shouldRetry) {
          break;
        }

        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 500));
      }
    }

    // Handle final error
    if (showErrorAlert && lastError) {
      handleApiError(lastError, showAlert, { customMessages: errorMessages });
    }

    setIsLoading(false);
    return { data: null, error: lastError, status: (lastError as any)?.status || null };
  }, [showAlert, router]);

  // Convenience methods
  const get = useCallback(<T = any>(url: string, options?: ApiOptions) => {
    return fetchWithAuth<T>(url, { method: 'GET' }, options);
  }, [fetchWithAuth]);

  const post = useCallback(<T = any>(url: string, body?: any, options?: ApiOptions) => {
    return fetchWithAuth<T>(url, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }, options);
  }, [fetchWithAuth]);

  const put = useCallback(<T = any>(url: string, body?: any, options?: ApiOptions) => {
    return fetchWithAuth<T>(url, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }, options);
  }, [fetchWithAuth]);

  const del = useCallback(<T = any>(url: string, options?: ApiOptions) => {
    return fetchWithAuth<T>(url, { method: 'DELETE' }, options);
  }, [fetchWithAuth]);

  return {
    fetchWithAuth,
    get,
    post,
    put,
    del,
    isLoading
  };
}

// Standalone function for use outside of React components (e.g., in API routes)
export async function checkAuthAndHandle(
  request: Request,
  getDataFromToken: (req: any) => Promise<string | null>
): Promise<{ userId: string | null; errorResponse: Response | null }> {
  try {
    const userId = await getDataFromToken(request);

    if (!userId) {
      return {
        userId: null,
        errorResponse: new Response(
          JSON.stringify({
            message: 'Session expired. Please log in again.',
            code: 'SESSION_EXPIRED'
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
          }
        )
      };
    }

    return { userId, errorResponse: null };
  } catch (error: any) {
    const message = error.message?.toLowerCase() || '';

    let code = 'UNAUTHORIZED';
    let userMessage = 'Authentication required. Please log in.';

    if (message.includes('expired')) {
      code = 'SESSION_EXPIRED';
      userMessage = 'Your session has expired. Please log in again.';
    } else if (message.includes('invalid') || message.includes('malformed')) {
      code = 'TOKEN_INVALID';
      userMessage = 'Invalid authentication. Please log in again.';
    }

    return {
      userId: null,
      errorResponse: new Response(
        JSON.stringify({ message: userMessage, code }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    };
  }
}


