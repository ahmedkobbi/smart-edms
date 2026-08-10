/**
 * Smart EDMS — Public landing page (/)
 *
 * Premium glassmorphism marketing page with:
 *   - Hero section (gradient orbs, glass card, CTA buttons)
 *   - Features grid (6 key features with icons)
 *   - Pricing section (3 plans)
 *   - Security highlights (encryption, audit, compliance)
 *   - Footer
 *
 * Authenticated users are redirected to /dashboard.
 */

import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth/auth-options';
import { Shield, FileText, Search, ScrollText, Lock, Globe, Bitcoin, Check, ArrowRight } from 'lucide-react';
import Link from 'next/link';

const FEATURES = [
  { icon: FileText, title: 'Document Governance', desc: 'Upload, classify, version, redact, and share documents with full lifecycle control. Envelope encryption at rest with per-document DEKs.' },
  { icon: Shield, title: 'Zero-Trust Security', desc: 'RBAC + ABAC, step-up auth, break-glass, hardware key enforcement. 125+ pentest findings patched.' },
  { icon: ScrollText, title: 'Tamper-Evident Audit', desc: 'SHA-256 hash-chained audit log. Every action recorded. Signed daily receipts for compliance evidence.' },
  { icon: Search, title: 'AI-Powered Search', desc: 'Full-text search with Arabic analyzers, semantic hybrid re-ranking, PII detection, and policy risk analysis.' },
  { icon: Lock, title: 'Crypto-Shredding', desc: 'Per-document encryption keys can be individually deleted, making content permanently unrecoverable.' },
  { icon: Globe, title: 'Multi-Tenant SaaS', desc: 'Isolated tenant scoping, 5-locale i18n (EN/FR/AR/ES/DE), RTL support, SSO (OIDC + SAML), passkeys.' },
];

const PLANS = [
  { name: 'Starter', monthly: 29, annual: 290, seats: 25, storage: '50 GB', features: ['All core features', '25 seats', '50 GB storage', 'Email support'] },
  { name: 'Business', monthly: 99, annual: 990, seats: 200, storage: '500 GB', features: ['Everything in Starter', '200 seats', '500 GB storage', 'AI features', 'Priority support'] },
  { name: 'Enterprise', monthly: 499, annual: 4990, seats: 10000, storage: '10 TB', features: ['Everything in Business', '10,000 seats', '10 TB storage', 'SSO + SAML', 'Dedicated support', 'Custom SLA'] },
];

export default async function Home() {
  const session = await getServerSession();
  if (session?.user) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen mesh-bg">
      {/* Navigation */}
      <nav className="glass border-b border-white/10 dark:border-white/5 sticky top-0 z-30" style={{ paddingTop: 'var(--safe-top)', height: 'calc(3.5rem + var(--safe-top))' }}>
        <div className="h-full max-w-6xl mx-auto px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg glass-strong flex items-center justify-center">
              <Shield className="h-5 w-5 text-slate-900 dark:text-white" />
            </div>
            <span className="font-bold text-lg gradient-text">Smart EDMS</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login" className="text-sm font-medium px-4 py-2 hover:text-primary transition-colors">Sign in</Link>
            <Link href="/signup" className="text-sm font-medium px-4 py-2 h-11 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-all inline-flex items-center">Get started</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative py-20 px-4 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -end-40 w-96 h-96 rounded-full blur-3xl opacity-20" style={{ background: 'radial-gradient(circle, #0ea5e9, transparent 70%)' }} />
          <div className="absolute -bottom-40 -start-40 w-96 h-96 rounded-full blur-3xl opacity-20" style={{ background: 'radial-gradient(circle, #6366f1, transparent 70%)' }} />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <div className="glass-card inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-6">
            <Bitcoin className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-medium">Crypto payments accepted (BTC, ETH, USDT, USDC)</span>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-4">
            Secure Document Governance
            <br /><span className="gradient-text">for Regulated Industries</span>
          </h1>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            Smart EDMS is a high-assurance, multi-tenant SaaS Electronic Document Management System
            with tamper-evident audit, classification, retention, legal hold, and workflow governance.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/signup" className="w-full sm:w-auto h-12 px-8 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-all text-base font-medium inline-flex items-center justify-center gap-2">
              Start free trial <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/login" className="w-full sm:w-auto h-12 px-8 rounded-md glass border-0 hover-lift transition-all text-base font-medium inline-flex items-center justify-center">
              Sign in
            </Link>
          </div>
          <p className="text-xs text-muted-foreground mt-4">No credit card required · 30-day trial · Cancel anytime</p>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Enterprise-grade features, built in</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="glass-card rounded-2xl p-6 hover-lift transition-all">
                <div className="h-10 w-10 rounded-lg glass-strong flex items-center justify-center mb-4">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-base mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-2">Simple, transparent pricing</h2>
          <p className="text-sm text-muted-foreground text-center mb-12">Pay with crypto or card. Prices are calculated server-side — zero client trust.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {PLANS.map((plan) => (
              <div key={plan.name} className="glass-card rounded-2xl p-6 flex flex-col">
                <h3 className="font-semibold text-lg">{plan.name}</h3>
                <p className="text-3xl font-bold mt-2">${plan.monthly}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                <p className="text-xs text-muted-foreground mt-1">or ${plan.annual}/yr (save 2 months)</p>
                <div className="text-xs text-muted-foreground mt-2">{plan.seats} seats · {plan.storage} storage</div>
                <ul className="space-y-2 mt-4 mb-6 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                <Link href="/signup" className="h-11 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-all text-sm font-medium inline-flex items-center justify-center">
                  Start with {plan.name}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security highlights */}
      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="glass-strong rounded-2xl p-8 shadow-2xl">
            <Lock className="h-10 w-10 text-primary mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-4">Security is not a feature. It's the foundation.</h2>
            <p className="text-sm text-muted-foreground mb-6">
              AES-256-GCM envelope encryption · Argon2id passwords · TOTP MFA with replay protection ·
              SSO with PKCE + SAML signature verification · SSRF DNS pinning · Redis-backed rate limiting ·
              Hash-chained audit log · 349 automated tests · 12-rule payment security model
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {['ISO 27001', 'SOC 2', 'GDPR', 'HIPAA', 'PCI DSS'].map((cert) => (
                <span key={cert} className="glass-card px-3 py-1 rounded-full text-xs font-medium">{cert}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-white/10 dark:border-white/5">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Smart EDMS — Secure Document Governance Platform</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link href="/login" className="hover:text-foreground transition-colors">Sign in</Link>
            <Link href="/signup" className="hover:text-foreground transition-colors">Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
