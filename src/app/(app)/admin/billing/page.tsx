'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/premium';
import { CreditCard, Loader2, HardDrive, Users, FileText, Bitcoin, Check, ExternalLink, Clock, AlertCircle, CreditCard as CardIcon } from 'lucide-react';
import { formatBytes } from '@/lib/utils/format';
import { useI18n } from '@/i18n/use-i18n';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

// Plan definitions — mirrored from billing-policy.ts (server-authoritative)
const PLANS = [
  { id: 'starter', name: 'Starter', monthly: 29, annual: 290, seats: 25, storage: '50 GB' },
  { id: 'business', name: 'Business', monthly: 99, annual: 990, seats: 200, storage: '500 GB' },
  { id: 'enterprise', name: 'Enterprise', monthly: 499, annual: 4990, seats: 10000, storage: '10 TB' },
] as const;

const CRYPTO_OPTIONS = [
  { id: 'btc', name: 'Bitcoin', symbol: 'BTC' },
  { id: 'eth', name: 'Ethereum', symbol: 'ETH' },
  { id: 'usdttrc20', name: 'USDT (TRC20)', symbol: 'USDT' },
  { id: 'usdterc20', name: 'USDT (ERC20)', symbol: 'USDT' },
  { id: 'usdc', name: 'USD Coin', symbol: 'USDC' },
  { id: 'ltc', name: 'Litecoin', symbol: 'LTC' },
] as const;

const INVOICE_STATUS_COLORS: Record<string, string> = {
  pending: 'secondary',
  waiting: 'secondary',
  confirming: 'default',
  confirmed: 'default',
  failed: 'destructive',
  expired: 'outline',
  refunded: 'outline',
};

export default function AdminBillingPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [payCurrency, setPayCurrency] = useState<string>('btc');
  const [paymentMethod, setPaymentMethod] = useState<'crypto' | 'card'>('crypto');
  const [showCheckout, setShowCheckout] = useState(false);
  const [pollingInvoiceId, setPollingInvoiceId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ['admin-billing'],
    queryFn: () => api.get('/api/admin/billing'),
  });

  // Invoice history
  const { data: invoicesData } = useQuery<any>({
    queryKey: ['billing-invoices'],
    queryFn: () => api.get('/api/billing/invoices'),
    enabled: !!data,
  });

  // Checkout mutation
  const checkout = useMutation({
    mutationFn: (params: { plan: string; billingCycle: string; payCurrency: string; idempotencyKey: string }) =>
      api.post<any>('/api/billing/checkout', params),
    onSuccess: (res) => {
      setPollingInvoiceId(res.invoiceId);
      // Redirect to NowPayments invoice page
      window.location.href = res.invoiceUrl;
    },
    onError: (err: any) => {
      toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' });
      setShowCheckout(false);
    },
  });

  // Stripe checkout mutation
  const stripeCheckout = useMutation({
    mutationFn: (params: { plan: string; billingCycle: string; idempotencyKey: string }) =>
      api.post<any>('/api/billing/stripe-checkout', params),
    onSuccess: (res) => {
      setPollingInvoiceId(res.invoiceId);
      window.location.href = res.checkoutUrl;
    },
    onError: (err: any) => {
      toast({ title: t('common.failed'), description: err?.message, variant: 'destructive' });
      setShowCheckout(false);
    },
  });

  // Poll invoice status after returning from NowPayments
  const returnUrl = searchParams.get('invoice_id');
  const returnStatus = searchParams.get('status');

  // Initialize polling from URL params (once on mount)
  const effectivePollingId = pollingInvoiceId || (returnUrl && returnStatus !== 'canceled' ? returnUrl : null);

  const { data: pollData } = useQuery<any>({
    queryKey: ['invoice-status', effectivePollingId],
    queryFn: () => api.get(`/api/billing/status/${effectivePollingId}`),
    enabled: !!effectivePollingId,
    refetchInterval: (query) => {
      const status = query.state.data?.invoice?.status;
      if (status === 'confirmed' || status === 'failed' || status === 'expired') {
        return false; // stop polling on terminal status
      }
      return 3000; // poll every 3s
    },
  });

  // Show success toast when payment is confirmed (guard with ref to prevent re-fire)
  const confirmedRef = useRef(false);
  useEffect(() => {
    if (pollData?.invoice?.status === 'confirmed' && !confirmedRef.current) {
      confirmedRef.current = true;
      toast({ title: t('admin.billing.paymentConfirmedToast'), description: t('admin.billing.paymentConfirmedDesc') });
      refetch();
    }
  }, [pollData, toast, refetch]);

  if (isLoading || !data) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const sub = data.subscription;
  const usage = data.usage;
  const billingMode = data.billingMode || 'manual';

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('nav.billing')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('admin.billing.subtitle')}</p>
      </div>

      {/* Payment status banner (after returning from NowPayments) */}
      <AnimatePresence>
        {effectivePollingId && pollData?.invoice && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <PaymentStatusBanner
              status={pollData.invoice.status}
              amountUsd={pollData.invoice.amountUsd}
              cryptoAmount={pollData.invoice.amountDueCrypto}
              cryptoCurrency={pollData.invoice.cryptoCurrency}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Current plan card */}
      <GlassCard className="p-6">
        <div className="flex items-center justify-between gap-6 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-slate-900 to-slate-700 dark:from-slate-700 dark:to-slate-500 flex items-center justify-center">
              <CreditCard className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('admin.billing.currentPlan')}</p>
              <p className="text-2xl font-semibold capitalize">{sub.plan}</p>
              <Badge variant={sub.status === 'active' ? 'default' : sub.status === 'trialing' ? 'secondary' : 'destructive'} className="text-xs capitalize mt-1">
                {sub.status}
              </Badge>
            </div>
          </div>
          <div className="text-end">
            <p className="text-xs text-muted-foreground">{t('admin.billing.period')}</p>
            <p className="text-sm font-medium">
              {sub.currentPeriodStart ? new Date(sub.currentPeriodStart).toLocaleDateString() : '—'}
              {' → '}
              {sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : '—'}
            </p>
          </div>
        </div>

        {/* Usage stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
          <UsageStat icon={Users} label={t('admin.billing.seats')} value={`${usage.seats} / ${usage.seatsLimit}`} pct={usage.seatsLimit > 0 ? (usage.seats / usage.seatsLimit) * 100 : 0} />
          <UsageStat icon={FileText} label={t('documents.title')} value={usage.documents} pct={0} />
          <UsageStat icon={HardDrive} label={t('admin.billing.storage')} value={`${formatBytes(usage.storageUsedBytes)} / ${formatBytes(usage.storageLimitBytes)}`} pct={usage.storageUsedPct} />
        </div>
      </GlassCard>

      {/* Upgrade section */}
      {sub.plan !== 'enterprise' && (
        <GlassCard className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold">{t('admin.billing.upgradePlan')}</h3>
              <p className="text-xs text-muted-foreground mt-1">{t('admin.billing.upgradeDesc')}</p>
            </div>
            <div className="flex items-center gap-2">
              <Bitcoin className="h-6 w-6 text-amber-500" />
              <CardIcon className="h-6 w-6 text-blue-500" />
            </div>
          </div>

          {/* Billing cycle toggle */}
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${billingCycle === 'monthly' ? 'bg-primary text-primary-foreground' : 'glass border-0'}`}
            >
              {t('admin.billing.monthly')}
            </button>
            <button
              onClick={() => setBillingCycle('annual')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${billingCycle === 'annual' ? 'bg-primary text-primary-foreground' : 'glass border-0'}`}
            >
              {t('admin.billing.annual')}
              <Badge variant="secondary" className="ms-2 text-[10px]">{t('admin.billing.twoMonthsFree')}</Badge>
            </button>
          </div>

          {/* Plan cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            {PLANS.map((plan) => {
              const isSelected = selectedPlan === plan.id;
              const isCurrent = sub.plan === plan.id;
              const price = billingCycle === 'annual' ? plan.annual : plan.monthly;
              return (
                <button
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan.id)}
                  disabled={isCurrent}
                  className={`relative text-start p-4 rounded-xl border transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : isCurrent
                      ? 'border-green-500/30 bg-green-500/5 opacity-60 cursor-not-allowed'
                      : 'border-border hover:border-primary/30 glass-card'
                  }`}
                >
                  {isCurrent && (
                    <Badge className="absolute top-2 end-2 text-[10px]" variant="default">
                      <Check className="h-3 w-3 me-1" /> {t('admin.billing.currentPlanBadge')}
                    </Badge>
                  )}
                  <p className="font-semibold text-sm capitalize">{plan.name}</p>
                  <p className="text-2xl font-bold mt-1">${price}<span className="text-xs font-normal text-muted-foreground">/{billingCycle === 'annual' ? 'yr' : 'mo'}</span></p>
                  <div className="text-xs text-muted-foreground mt-2 space-y-0.5">
                    <p>{t('admin.billing.seatsFeature', { seats: plan.seats })}</p>
                    <p>{t('admin.billing.storageFeature', { storage: plan.storage })}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Payment method + checkout */}
          {selectedPlan && !showCheckout && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden">
              <div className="pt-4 border-t">
                {/* Payment method toggle */}
                <p className="text-xs font-medium text-muted-foreground mb-2">{t('admin.billing.payWith')}</p>
                <div className="flex items-center gap-2 mb-4">
                  <button
                    onClick={() => setPaymentMethod('crypto')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                      paymentMethod === 'crypto' ? 'bg-primary text-primary-foreground' : 'glass border-0'
                    }`}
                  >
                    <Bitcoin className="h-4 w-4" /> Crypto
                  </button>
                  <button
                    onClick={() => setPaymentMethod('card')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                      paymentMethod === 'card' ? 'bg-primary text-primary-foreground' : 'glass border-0'
                    }`}
                  >
                    <CardIcon className="h-4 w-4" /> Card
                  </button>
                </div>

                {/* Crypto currency selector (only when crypto is selected) */}
                {paymentMethod === 'crypto' && (
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
                    {CRYPTO_OPTIONS.map((crypto) => (
                      <button
                        key={crypto.id}
                        onClick={() => setPayCurrency(crypto.id)}
                        className={`p-2 rounded-lg border text-center transition-all ${
                          payCurrency === crypto.id
                            ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                            : 'border-border hover:border-primary/30 glass-card'
                        }`}
                      >
                        <p className="text-xs font-medium">{crypto.symbol}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{crypto.name}</p>
                      </button>
                    ))}
                  </div>
                )}

                {/* Crypto checkout button */}
                {paymentMethod === 'crypto' && (
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => {
                      checkout.mutate({
                        plan: selectedPlan,
                        billingCycle,
                        payCurrency,
                        idempotencyKey: crypto.randomUUID(),
                      });
                    }}
                    disabled={checkout.isPending}
                  >
                    {checkout.isPending ? (
                      <><Loader2 className="h-4 w-4 animate-spin me-2" /> {t('admin.billing.redirecting')}</>
                    ) : (
                      <><Bitcoin className="h-4 w-4 me-2" /> {t('admin.billing.continueToPayment')}</>
                    )}
                  </Button>
                )}

                {/* Stripe card checkout button */}
                {paymentMethod === 'card' && (
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => {
                      stripeCheckout.mutate({
                        plan: selectedPlan,
                        billingCycle,
                        idempotencyKey: crypto.randomUUID(),
                      });
                    }}
                    disabled={stripeCheckout.isPending}
                  >
                    {stripeCheckout.isPending ? (
                      <><Loader2 className="h-4 w-4 animate-spin me-2" /> {t('admin.billing.redirecting')}</>
                    ) : (
                      <><CardIcon className="h-4 w-4 me-2" /> {t('admin.billing.continueToPayment')}</>
                    )}
                  </Button>
                )}

                <p className="text-xs text-muted-foreground text-center mt-3">
                  {paymentMethod === 'crypto'
                    ? 'BTC, ETH, USDT, USDC, LTC accepted. Payment confirmed on blockchain confirmation.'
                    : 'Visa, Mastercard, Amex via Stripe. Payment confirmed instantly.'}
                </p>
              </div>
            </motion.div>
          )}
        </GlassCard>
      )}

      {/* Invoice history */}
      <GlassCard className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold">{t('admin.billing.invoiceHistory')}</h3>
            <p className="text-xs text-muted-foreground mt-1">{t('admin.billing.invoiceHistoryDesc')}</p>
          </div>
        </div>

        {!invoicesData?.items?.length ? (
          <div className="text-center py-8">
            <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">{t('admin.billing.noInvoices')}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-900">
            {invoicesData.items.map((inv: any) => (
              <div key={inv.id} className="py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium capitalize">{inv.plan}</p>
                    <Badge variant={(INVOICE_STATUS_COLORS[inv.status] as any) || 'secondary'} className="text-xs capitalize">
                      {inv.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    ${inv.amountUsd} · {new Date(inv.createdAt).toLocaleDateString()}
                    {inv.cryptoCurrency && ` · ${inv.amountDueCrypto} ${inv.cryptoCurrency.toUpperCase()}`}
                  </p>
                </div>
                {inv.invoiceUrl && inv.status === 'waiting' && (
                  <a href={inv.invoiceUrl} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline">
                      <ExternalLink className="h-3 w-3 me-1" /> {t('admin.billing.pay')}
                    </Button>
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* Plan details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('admin.billing.planDetails')}</CardTitle>
          <CardDescription>{t('admin.billing.planDetailsDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <DetailRow label={t('admin.billing.plan')} value={<span className="capitalize">{sub.plan}</span>} />
          <DetailRow label={t('admin.billing.status')} value={<span className="capitalize">{sub.status}</span>} />
          <DetailRow label={t('admin.billing.seatsIncluded')} value={sub.seats} />
          <DetailRow label={t('admin.billing.storageLimit')} value={formatBytes(Number(sub.storageBytes))} />
          {sub.stripeCustomerId && <DetailRow label={t('admin.billing.stripeCustomer')} value={sub.stripeCustomerId} />}
          {sub.stripeSubscriptionId && <DetailRow label={t('admin.billing.stripeSubscription')} value={sub.stripeSubscriptionId} />}
          <DetailRow label={t('admin.billing.billingMode')} value={<Badge variant="outline" className="text-xs capitalize">{billingMode}</Badge>} />
        </CardContent>
      </Card>
    </div>
  );
}

// --- Helper components ---

function UsageStat({ icon: Icon, label, value, pct }: { icon: any; label: string; value: string | number; pct: number }) {
  return (
    <div className="glass-card rounded-xl p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className="text-sm font-semibold">{value}</p>
      {pct > 0 && <Progress value={Math.min(100, pct)} className="h-1 mt-2" />}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function PaymentStatusBanner({ status, amountUsd, cryptoAmount, cryptoCurrency }: { status: string; amountUsd: number; cryptoAmount?: number; cryptoCurrency?: string }) {
  const { t } = useI18n();
  const isConfirmed = status === 'confirmed';
  const isFailed = status === 'failed' || status === 'expired';
  const isPending = status === 'waiting' || status === 'confirming' || status === 'pending';

  const icon = isConfirmed ? <Check className="h-5 w-5 text-green-500" /> :
               isFailed ? <AlertCircle className="h-5 w-5 text-red-500" /> :
               <Clock className="h-5 w-5 text-amber-500 animate-pulse" />;

  const title = isConfirmed ? t('admin.billing.paymentConfirmed') :
                isFailed ? t('admin.billing.paymentFailed') :
                t('admin.billing.paymentInProgress');

  const desc = isConfirmed ? t('admin.billing.paymentConfirmedBannerDesc', { amount: amountUsd }) :
               isFailed ? t('admin.billing.paymentFailedBannerDesc', { status }) :
               t('admin.billing.paymentInProgressBannerDesc', { cryptoAmount: cryptoAmount ?? '', cryptoCurrency: cryptoCurrency ?? '' });

  const bgClass = isConfirmed ? 'border-green-500/20 bg-green-500/5' :
                  isFailed ? 'border-red-500/20 bg-red-500/5' :
                  'border-amber-500/20 bg-amber-500/5';

  return (
    <div className={`glass-card rounded-xl p-4 border ${bgClass} flex items-center gap-3`}>
      {icon}
      <div className="flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}
