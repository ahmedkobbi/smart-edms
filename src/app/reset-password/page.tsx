'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, ApiRequestError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Loader2, Lock, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';

export default function ResetPasswordPage() {
  const search = useSearchParams();
  const token = search.get('token');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post('/api/auth/reset-password', { token, password });
      setSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center mesh-bg px-4">
        <Card className="max-w-md w-full glass-strong">
          <CardContent className="p-8 text-center">
            <p className="text-sm font-medium">Invalid reset link</p>
            <p className="text-xs text-muted-foreground mt-1">No reset token found in the URL.</p>
            <Link href="/forgot-password" className="inline-block mt-4">
              <Button variant="outline">Request new link</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center mesh-bg px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="h-14 w-14 rounded-2xl glass-strong flex items-center justify-center mb-4 shadow-lg">
            <Shield className="h-7 w-7 text-slate-900 dark:text-white" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight gradient-text">Smart EDMS</h1>
        </div>

        <Card className="glass-strong shadow-xl">
          {success ? (
            <CardContent className="p-8 text-center">
              <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-500 mb-3" />
              <h2 className="text-lg font-semibold mb-2">Password updated</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Your password has been changed. You can now sign in with your new password.
              </p>
              <Link href="/login">
                <Button className="btn-premium">Sign in</Button>
              </Link>
            </CardContent>
          ) : (
            <form onSubmit={handleSubmit}>
              <CardHeader>
                <CardTitle className="text-xl">Reset password</CardTitle>
                <CardDescription>Choose a new password for your account.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">New password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-9 pr-10 glass-input border-0 h-11"
                      placeholder="Min 12 chars, upper/lower/digit/special"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Must be at least 12 characters with upper, lower, digit, and special character.
                  </p>
                </div>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
              <CardFooter>
                <Button type="submit" className="w-full btn-premium" disabled={loading || !password}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Update password
                </Button>
              </CardFooter>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
