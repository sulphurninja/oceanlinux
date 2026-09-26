'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Lock, Loader2 } from 'lucide-react';

export default function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [manualKey, setManualKey] = useState('');

  const returnUrl = searchParams.get('returnUrl') || '/admin/dashboard';
  const setupMode = Boolean(qrDataUrl);

  useEffect(() => {
    let cancelled = false;

    const checkGate = async () => {
      try {
        const res = await fetch('/api/admin/gate', { credentials: 'include' });
        const data = await res.json();
        if (cancelled) return;

        if (data.authenticated) {
          router.replace(returnUrl.startsWith('/admin') ? returnUrl : '/admin/dashboard');
          router.refresh();
          return;
        }

        setTotpEnabled(Boolean(data.totpEnabled));

        if (data.configured === false) {
          setConfigured(false);
          setError('Admin password is not set on the server (ADMIN_PANEL_PASSWORD).');
        } else {
          setConfigured(true);
          setError('');
        }
      } catch {
        if (!cancelled) {
          setConfigured(true);
          setError('');
        }
      }
    };

    checkGate();
    return () => {
      cancelled = true;
    };
  }, [returnUrl, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/admin/gate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, code }),
      });
      const data = await res.json();

      if (data.setupRequired && data.qrDataUrl) {
        setQrDataUrl(data.qrDataUrl);
        setManualKey(String(data.manualKey || ''));
        setCode('');
        setError('');
        return;
      }

      if (!res.ok) {
        setError(data.message || 'Access denied');
        return;
      }

      router.replace(returnUrl.startsWith('/admin') ? returnUrl : '/admin/dashboard');
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md border-border/60 shadow-lg">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Admin Panel</CardTitle>
          <CardDescription>
            {setupMode
              ? 'Scan this QR in Google Authenticator, then enter the 6-digit code.'
              : totpEnabled
                ? 'Enter the admin password and the Google Authenticator code.'
                : 'Enter the admin access password to continue.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {setupMode ? (
              <div className="space-y-3 text-center">
                <img
                  src={qrDataUrl}
                  alt="Google Authenticator QR code"
                  className="mx-auto h-52 w-52 rounded-md border bg-white p-2"
                />
                {manualKey ? (
                  <p className="break-all font-mono text-xs text-muted-foreground">{manualKey}</p>
                ) : null}
              </div>
            ) : (
              <Input
                type="password"
                placeholder="Admin password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                autoFocus
                required
                disabled={!configured}
              />
            )}
            {(totpEnabled || setupMode) && (
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6-digit authenticator code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
              />
            )}
            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={loading || !configured || (!setupMode && !password) || ((totpEnabled || setupMode) && code.length !== 6)}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying…
                </>
              ) : setupMode ? (
                'Confirm authenticator'
              ) : (
                'Unlock Admin Panel'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
