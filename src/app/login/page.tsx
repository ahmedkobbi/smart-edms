'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Loader2, Lock, Mail, KeyRound, ArrowRight, Eye, EyeOff, Fingerprint, LogIn } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useI18n } from '@/i18n/use-i18n';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const search = useSearchParams();
  const { toast } = useToast();
  const { t } = useI18n();
  // SECURITY FIX (L-AUTH-5): Validate callbackUrl is same-origin (relative
  // path) before redirecting. An attacker can craft a phishing link like
  // /login?callbackUrl=https://evil.com — after the victim logs in, they
  // would be redirected to the attacker's site. Reject anything that is
  // not a relative path (no protocol, no //, no backslashes).
  const rawCallback = search.get('callbackUrl') || '/dashboard';
  const callbackUrl = (rawCallback.startsWith('/') && !rawCallback.startsWith('//') && !rawCallback.startsWith('/\\'))
    ? rawCallback
    : '/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="min-h-screen relative flex items-center justify-center mesh-bg overflow-hidden">
      {/* Animated gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute -top-40 -end-40 w-96 h-96 rounded-full blur-3xl opacity-20"
          style={{ background: 'radial-gradient(circle, #0ea5e9, transparent 70%)' }}
          animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -bottom-40 -start-40 w-96 h-96 rounded-full blur-3xl opacity-20"
          style={{ background: 'radial-gradient(circle, #6366f1, transparent 70%)' }}
          animate={{ x: [0, -30, 0], y: [0, 20, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute top-1/2 start-1/2 w-72 h-72 rounded-full blur-3xl opacity-10"
          style={{ background: 'radial-gradient(circle, #10b981, transparent 70%)' }}
          animate={{ x: [0, 20, 0], y: [0, -30, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        className="w-full max-w-md px-4 relative z-10"
      >
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="flex flex-col items-center mb-8"
        >
          <div className="relative mb-4">
            <div className="absolute inset-0 blur-xl opacity-30 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl" />
            <div className="relative h-16 w-16 rounded-2xl glass-strong flex items-center justify-center shadow-xl">
              <Shield className="h-8 w-8 text-slate-900 dark:text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight gradient-text">Smart EDMS</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('common.tagline')}</p>
        </motion.div>

        {/* Glass card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="glass-strong rounded-2xl p-8 shadow-2xl"
        >
          <AnimatePresence mode="wait">
            {!needsMfa ? (
              <motion.div
                key="password"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
              >
                <h2 className="text-xl font-semibold mb-1">{t('auth.signIn')}</h2>
                <p className="text-sm text-muted-foreground mb-6">{t('auth.welcomeBack')}</p>
              </motion.div>
            ) : (
              <motion.div
                key="mfa"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <h2 className="text-xl font-semibold mb-1 flex items-center gap-2">
                  <Fingerprint className="h-5 w-5 text-blue-500" />
                  {t('auth.mfaRequired')}
                </h2>
                <p className="text-sm text-muted-foreground mb-6">{t('auth.enterMfaCode')}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!needsMfa && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="space-y-2"
              >
                <Label htmlFor="email" className="text-sm font-medium">{t('auth.email')}</Label>
                <div className="relative group">
                  <Mail className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-blue-500 transition-colors" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="ps-10 glass-input border-0 h-11 focus-ring"
                    placeholder="you@company.com"
                  />
                </div>
              </motion.div>
            )}

            {!needsMfa && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="space-y-2"
              >
                <Label htmlFor="password" className="text-sm font-medium">{t('auth.password')}</Label>
                <div className="relative group">
                  <Lock className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-blue-500 transition-colors" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="ps-10 pe-10 glass-input border-0 h-11 focus-ring"
                    placeholder="••••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </motion.div>
            )}

            {needsMfa && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="space-y-2"
              >
                <Label htmlFor="mfaToken" className="text-sm font-medium">{t('auth.mfaToken')}</Label>
                <div className="relative group">
                  <KeyRound className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-blue-500 transition-colors" />
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
                    className="ps-10 glass-input border-0 h-11 tracking-[0.3em] text-lg text-center focus-ring"
                    placeholder="000000"
                    autoFocus
                  />
                </div>
              </motion.div>
            )}

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Button
                type="submit"
                className="w-full btn-premium h-11 text-sm font-medium"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="ms-2 h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="ms-2 h-4 w-4" />
                )}
                {needsMfa ? t('auth.verifyAndSignIn') : t('auth.signIn')}
              </Button>
            </motion.div>

            {needsMfa && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setNeedsMfa(false);
                    setMfaPendingToken('');
                    setMfaToken('');
                    setError(null);
                  }}
                >
                  {t('auth.backToPassword')}
                </Button>
              </motion.div>
            )}

            {!needsMfa && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.45 }}
                className="text-center"
              >
                <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
                  {t('auth.forgotPassword')}
                </Link>
              </motion.div>
            )}

            {!needsMfa && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="relative"
              >
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-slate-200 dark:border-slate-800" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white/80 dark:bg-slate-900/80 px-2 text-muted-foreground">or</span>
                </div>
              </motion.div>
            )}

            {!needsMfa && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55 }}
                className="space-y-2"
              >
                <Button
                  type="button"
                  variant="outline"
                  className="w-full glass-input border-0 h-11"
                  onClick={() => {
                    // Will be replaced with actual passkey flow
                    toast({ title: 'Passkey sign-in', description: 'Passkey authentication will be available after enrollment in Settings → Security.' });
                  }}
                >
                  <Fingerprint className="ms-2 h-4 w-4" />
                  {t('auth.signInWithPasskey')}
                </Button>
                <SsoButtons />
              </motion.div>
            )}
          </form>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-center text-xs text-muted-foreground mt-6 leading-relaxed"
        >
          {t('common.tagline')}
        </motion.p>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  SSO Provider Buttons
// ---------------------------------------------------------------------------

function SsoButtons() {
  const [providers, setProviders] = useState<any[]>([]);

  useEffect(() => {
    // SECURITY FIX (L-UI-1): The public SSO providers endpoint requires a
    // `?tenant=<slug>` query param (M5 fix). Without it the endpoint returns
    // `{ items: [] }` and SSO buttons never render — SSO users could not
    // log in. Resolve the tenant slug from NEXT_PUBLIC_TENANT_SLUG (single-
    // tenant deploy) or from the URL query string (multi-tenant).
    const tenantSlug =
      (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tenant')) ||
      process.env.NEXT_PUBLIC_TENANT_SLUG ||
      '';
    const url = tenantSlug
      ? `/api/admin/sso-providers/public?tenant=${encodeURIComponent(tenantSlug)}`
      : '/api/admin/sso-providers/public';
    fetch(url)
      .then((r) => r.ok ? r.json() : { items: [] })
      .then((data) => setProviders(data.items || []))
      .catch(() => {});
  }, []);

  if (providers.length === 0) return null;

  return (
    <>
      {providers.map((p) => (
        <Button
          key={p.id}
          type="button"
          variant="outline"
          className="w-full glass-input border-0 h-11"
          onClick={() => {
            window.location.href = `/api/auth/sso/${p.id}/init`;
          }}
        >
          <LogIn className="ms-2 h-4 w-4" />
          Sign in with {p.name}
        </Button>
      ))}
    </>
  );
}
