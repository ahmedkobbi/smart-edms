'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Loader2, ArrowRight, Check } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useToast } from '@/hooks/use-toast';
import { api, ApiRequestError } from '@/lib/api/client';

export default function SignupPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    tenantName: '',
    slug: '',
    adminName: '',
    adminEmail: '',
    adminPassword: '',
    company_website: '', // honeypot — hidden from real users
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      await api.post('/api/tenants/register', form);
      toast({ title: 'Account created', description: 'You can now sign in to your new workspace.' });
      router.push('/login?signup=1');
    } catch (err: any) {
      if (err instanceof ApiRequestError) {
        toast({ title: 'Signup failed', description: err.message, variant: 'destructive' });
      } else {
        toast({ title: 'Signup failed', description: 'An unexpected error occurred.', variant: 'destructive' });
      }
    } finally {
      setLoading(false);
    }
  }

  const slugAvailable = form.slug.length >= 2 && /^[a-z0-9-]+$/.test(form.slug);

  return (
    <div className="min-h-screen relative flex items-center justify-center mesh-bg overflow-hidden p-4">
      {/* Gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -end-40 w-96 h-96 rounded-full blur-3xl opacity-20" style={{ background: 'radial-gradient(circle, #0ea5e9, transparent 70%)' }} />
        <div className="absolute -bottom-40 -start-40 w-96 h-96 rounded-full blur-3xl opacity-20" style={{ background: 'radial-gradient(circle, #6366f1, transparent 70%)' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        {/* Logo + title */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative mb-4">
            <div className="absolute inset-0 blur-xl opacity-30 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl" />
            <div className="relative h-16 w-16 rounded-2xl glass-strong flex items-center justify-center shadow-xl">
              <Shield className="h-8 w-8 text-slate-900 dark:text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight gradient-text">Smart EDMS</h1>
          <p className="text-sm text-muted-foreground mt-1">Create your secure document workspace</p>
        </div>

        {/* Form card */}
        <div className="glass-strong rounded-2xl p-8 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Honeypot — hidden from real users */}
            <input
              type="text"
              name="company_website"
              value={form.company_website}
              onChange={(e) => setForm({ ...form, company_website: e.target.value })}
              className="hidden"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
            />

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Organization name *</label>
              <input
                type="text"
                required
                minLength={2}
                maxLength={200}
                value={form.tenantName}
                onChange={(e) => setForm({ ...form, tenantName: e.target.value })}
                className="w-full h-11 px-3 rounded-md glass-input border-0 focus-ring text-sm"
                placeholder="Acme Corporation"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Workspace URL *</label>
              <div className="flex items-center">
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={50}
                  pattern="[a-z0-9-]+"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
                  className="flex-1 h-11 px-3 rounded-s-md glass-input border-0 focus-ring text-sm"
                  placeholder="acme-corp"
                />
                <span className="h-11 px-3 flex items-center text-sm text-muted-foreground glass-input border-0 rounded-e-md border-s-0">
                  .smartedms.com
                </span>
              </div>
              {slugAvailable && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <Check className="h-3 w-3" /> Available
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Your name *</label>
              <input
                type="text"
                required
                minLength={1}
                maxLength={200}
                value={form.adminName}
                onChange={(e) => setForm({ ...form, adminName: e.target.value })}
                className="w-full h-11 px-3 rounded-md glass-input border-0 focus-ring text-sm"
                placeholder="John Doe"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Email *</label>
              <input
                type="email"
                required
                value={form.adminEmail}
                onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                className="w-full h-11 px-3 rounded-md glass-input border-0 focus-ring text-sm"
                placeholder="admin@acme.com"
                autoComplete="email"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Password *</label>
              <input
                type="password"
                required
                minLength={12}
                value={form.adminPassword}
                onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
                className="w-full h-11 px-3 pe-10 rounded-md glass-input border-0 focus-ring text-sm"
                placeholder="Min 12 chars, upper/lower/digit/special"
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground">Min 12 chars with upper, lower, digit, and special character.</p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-all text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Creating workspace…</>
              ) : (
                <>Create workspace <ArrowRight className="h-4 w-4" /></>
              )}
            </button>
          </form>

          <p className="text-xs text-muted-foreground text-center mt-4">
            By signing up, you agree to our Terms of Service and Privacy Policy.
            Your workspace starts with a 30-day free trial — no credit card required.
          </p>
        </div>

        {/* Sign in link */}
        <p className="text-center text-sm text-muted-foreground mt-6">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
