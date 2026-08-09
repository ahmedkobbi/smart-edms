'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Loader2, Lock, Mail, KeyRound } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function LoginPage() {
  const router = useRouter();
  const search = useSearchParams();
  const { toast } = useToast();
  const callbackUrl = search.get('callbackUrl') || '/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [mfaPendingToken, setMfaPendingToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsMfa, setNeedsMfa] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await signIn('credentials', {
        redirect: false,
        email,
        password,
        mfaToken: mfaToken || undefined,
        mfaPendingToken: mfaPendingToken || undefined,
      });

      if (!result) {
        setError('No response from authentication service');
        return;
      }

      if (result.error) {
        if (result.error.startsWith('MFA_REQUIRED:')) {
          setMfaPendingToken(result.error.split(':')[1]);
          setNeedsMfa(true);
          setError(null);
          toast({
            title: 'MFA required',
            description: 'Enter the 6-digit code from your authenticator app.',
          });
          return;
        }
        setError(result.error);
        return;
      }

      toast({ title: 'Signed in', description: 'Welcome to Smart EDMS' });
      router.push(callbackUrl);
      router.refresh();
    } catch (err: any) {
      setError(err?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 dark:from-slate-100 dark:to-slate-400 flex items-center justify-center mb-4 shadow-lg">
            <Shield className="h-7 w-7 text-white dark:text-slate-900" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Smart EDMS</h1>
          <p className="text-sm text-muted-foreground mt-1">Secure Document Governance Platform</p>
        </div>

        <Card className="border-slate-200 dark:border-slate-800 shadow-xl">
          <CardHeader>
            <CardTitle className="text-xl">Sign in</CardTitle>
            <CardDescription>
              {needsMfa
                ? 'Enter your multi-factor authentication code to continue.'
                : 'Use your work credentials to access Smart EDMS.'}
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {!needsMfa && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-9"
                        placeholder="you@company.com"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type="password"
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-9"
                        placeholder="••••••••••"
                      />
                    </div>
                  </div>
                </>
              )}

              {needsMfa && (
                <div className="space-y-2">
                  <Label htmlFor="mfaToken">Authenticator code</Label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="mfaToken"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]*"
                      maxLength={6}
                      required
                      value={mfaToken}
                      onChange={(e) => setMfaToken(e.target.value.replace(/\D/g, ''))}
                      className="pl-9 tracking-widest text-lg"
                      placeholder="000000"
                      autoFocus
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Enter the 6-digit code from your authenticator app.
                  </p>
                </div>
              )}

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {needsMfa ? 'Verify & sign in' : 'Sign in'}
              </Button>
              {needsMfa && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setNeedsMfa(false);
                    setMfaPendingToken('');
                    setMfaToken('');
                    setError(null);
                  }}
                >
                  Back to password
                </Button>
              )}
            </CardFooter>
          </form>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6 leading-relaxed">
          Smart EDMS — designed to support ISO 27001, SOC 2, GDPR and HIPAA-aligned controls.
          <br />
          Access is logged and tamper-evident. Unauthorized access is prohibited.
        </p>
      </div>
    </div>
  );
}
