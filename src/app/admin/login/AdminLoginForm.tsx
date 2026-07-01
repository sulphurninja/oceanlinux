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
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Verified from the live gate API (not the stale URL param).
  const [configured, setConfigured] = useState(true);

  const returnUrl = searchParams.get('returnUrl') || '/admin/dashboard';

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
        body: JSON.stringify({ password }),
      });
      const data = await res.json();

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
            Enter the admin access password to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
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
            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={loading || !password || !configured}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying…
                </>
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
