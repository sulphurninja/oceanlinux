'use client';

import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GoogleLogin, GoogleOAuthProvider, CredentialResponse } from '@react-oauth/google';
import {
  JUST_LOGGED_IN_KEY,
  LOGIN_POPUP_SHOWN_KEY,
  POST_LOGIN_SPLASH_DONE_KEY,
  setPostLoginLoadingScreen,
} from '@/lib/post-login';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

function resolveSafeReturnPath(path: string | null | undefined): string | null {
  if (!path || !path.startsWith('/') || path.startsWith('//')) return null;
  return path;
}

function resolvePostLoginPath(userType: string | undefined, returnToParam?: string | null): string {
  const fromQuery = resolveSafeReturnPath(returnToParam);
  if (fromQuery) return fromQuery;

  try {
    const stored = localStorage.getItem('redirectAfterLogin');
    const fromStorage = resolveSafeReturnPath(stored);
    if (fromStorage) {
      localStorage.removeItem('redirectAfterLogin');
      return fromStorage;
    }
  } catch {
    /* ignore */
  }

  return userType === 'reseller' ? '/dashboard/reseller-wallet' : '/dashboard';
}

export function GoogleAuthProvider({ children }: { children: ReactNode }) {
  if (!GOOGLE_CLIENT_ID) return <>{children}</>;
  return <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>{children}</GoogleOAuthProvider>;
}

type GoogleSignInButtonProps = {
  mode?: 'login' | 'signup';
  returnTo?: string | null;
  disabled?: boolean;
  onError?: (message: string) => void;
  onLoadingChange?: (loading: boolean) => void;
};

export function GoogleSignInButton({
  mode = 'login',
  returnTo = null,
  disabled = false,
  onError,
  onLoadingChange,
}: GoogleSignInButtonProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [buttonWidth, setButtonWidth] = useState(320);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const updateWidth = () => {
      const width = Math.floor(node.getBoundingClientRect().width);
      if (width > 0) setButtonWidth(width);
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const handleSuccess = useCallback(
    async (credentialResponse: CredentialResponse) => {
      if (!credentialResponse.credential) {
        onError?.('Google did not return a valid credential.');
        return;
      }

      onLoadingChange?.(true);

      try {
        const response = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ credential: credentialResponse.credential }),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          onError?.(data.message || 'Google Sign-In failed. Please try again.');
          return;
        }

        sessionStorage.removeItem(LOGIN_POPUP_SHOWN_KEY);
        sessionStorage.removeItem(POST_LOGIN_SPLASH_DONE_KEY);

        const path = resolvePostLoginPath(data.result?.userType, returnTo);
        const isDashboard = path.startsWith('/dashboard');
        if (isDashboard) {
          sessionStorage.setItem(JUST_LOGGED_IN_KEY, '1');
          setPostLoginLoadingScreen();
        }

        router.replace(path);
      } catch {
        onError?.('Unable to reach the server. Please try again.');
      } finally {
        onLoadingChange?.(false);
      }
    },
    [onError, onLoadingChange, returnTo, router]
  );

  if (!GOOGLE_CLIENT_ID) return null;

  return (
    <div
      ref={containerRef}
      className="google-signin-light w-full flex justify-center [&>div]:!w-full [&>div]:!max-w-full"
    >
      <GoogleLogin
        onSuccess={handleSuccess}
        onError={() => onError?.('Google Sign-In was cancelled or failed.')}
        theme="outline"
        size="large"
        shape="rectangular"
        text={mode === 'signup' ? 'signup_with' : 'continue_with'}
        width={buttonWidth}
        locale="en"
        useOneTap={false}
      />
    </div>
  );
}

export function AuthDivider({ label = 'or' }: { label?: string }) {
  return (
    <div className="relative my-4">
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t border-white/[0.08]" />
      </div>
      <div className="relative flex justify-center text-xs uppercase tracking-wide">
        <span className="bg-transparent px-2 text-white/40">{label}</span>
      </div>
    </div>
  );
}
