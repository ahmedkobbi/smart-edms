'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassCard, PremiumSkeleton, PremiumEmptyState } from '@/components/ui/premium';
import { Loader2, PenTool, FileText, Clock, CheckCircle, XCircle, Ban, Plus, Mail, Trash2 } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';

const statusConfig: Record<string, { color: string; icon: any; bg: string }> = {
  draft: { color: 'text-gray-600', icon: FileText, bg: 'bg-gray-500/5' },
  sent: { color: 'text-blue-600', icon: Clock, bg: 'bg-blue-500/5' },
  delivered: { color: 'text-blue-600', icon: Clock, bg: 'bg-blue-500/5' },
  completed: { color: 'text-green-600', icon: CheckCircle, bg: 'bg-green-500/5' },
  declined: { color: 'text-red-600', icon: XCircle, bg: 'bg-red-500/5' },
  expired: { color: 'text-amber-600', icon: Clock, bg: 'bg-amber-500/5' },
  voided: { color: 'text-gray-600', icon: Ban, bg: 'bg-gray-500/5' },
};

export default function SignaturesPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery<any>({
    queryKey: ['signatures'],
    queryFn: () => api.get('/api/signatures'),
  });

  const voidMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.post(`/api/signatures/${id}/void`, { reason }),
    onSuccess: () => { toast({ title: t('signatures.requestVoided') }); queryClient.invalidateQueries({ queryKey: ['signatures'] }); },
    onError: (err: any) => toast({ title: t('signatures.failed'), description: err?.message, variant: 'destructive' }),
  });

  const requests = data?.items || [];
  const stats = {
    total: requests.length,
    pending: requests.filter((r: any) => r.status === 'sent' || r.status === 'delivered').length,
    completed: requests.filter((r: any) => r.status === 'completed').length,
    voided: requests.filter((r: any) => r.status === 'voided' || r.status === 'expired').length,
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <PenTool className="h-7 w-7 text-primary" />
            {t('signatures.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t('signatures.subtitle')}</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">{t('signatures.newRequest')}</span>
          <span className="sm:hidden">New</span>
        </Button>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'text-primary', bg: 'bg-primary/5' },
          { label: 'Pending', value: stats.pending, color: 'text-blue-600', bg: 'bg-blue-500/5' },
          { label: 'Completed', value: stats.completed, color: 'text-green-600', bg: 'bg-green-500/5' },
          { label: 'Voided', value: stats.voided, color: 'text-gray-600', bg: 'bg-gray-500/5' },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
            <GlassCard className="p-4" hover={false}>
              <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
            </GlassCard>
          </motion.div>
        ))}
      </div>

      {/* Create Form */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <CreateSignatureForm onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['signatures'] }); }} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <GlassCard key={i} className="p-5" hover={false}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-2">
                    <PremiumSkeleton className="h-5 w-48" />
                    <PremiumSkeleton className="h-4 w-64" />
                    <div className="flex gap-2 mt-2"><PremiumSkeleton className="h-6 w-20" /><PremiumSkeleton className="h-6 w-20" /></div>
                  </div>
                  <PremiumSkeleton className="h-10 w-20" />
                </div>
              </GlassCard>
            ))}
          </div>
        ) : requests.length === 0 ? (
          <PremiumEmptyState icon={PenTool} title={t('signatures.noRequests')} />
        ) : (
          <AnimatePresence mode="popLayout">
            {requests.map((req: any, i: number) => {
              const config = statusConfig[req.status] || statusConfig.draft;
              const Icon = config.icon;
              const recipients = typeof req.recipients === 'string' ? JSON.parse(req.recipients) : req.recipients;
              return (
                <motion.div key={req.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ delay: i * 0.05 }}>
                  <GlassCard className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <div className={`p-1.5 rounded-lg ${config.bg} shrink-0`}>
                            <Icon className={`h-4 w-4 ${config.color}`} />
                          </div>
                          <h3 className="font-semibold truncate">{req.document?.title || 'Unknown'}</h3>
                          <Badge className={`capitalize ${config.bg} ${config.color} border-0`} variant="outline">{req.status}</Badge>
                          <Badge variant="outline" className="capitalize shrink-0">{req.provider.replace('_', ' ')}</Badge>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {recipients?.map((r: any, idx: number) => (
                            <Badge key={idx} variant="secondary" className="text-xs gap-1">
                              {r.role === 'signer' && <Mail className="h-3 w-3" />}
                              {r.name} <span className="text-muted-foreground">({r.email})</span>
                            </Badge>
                          ))}
                        </div>
                        <div className="flex gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
                          <span>{t('signatures.sent')}: {req.sentAt ? new Date(req.sentAt).toLocaleDateString() : '—'}</span>
                          <span>{t('signatures.expires')}: {req.expiresAt ? new Date(req.expiresAt).toLocaleDateString() : '—'}</span>
                          {req.completedAt && <span className="text-green-600">{t('signatures.completedAt')}: {new Date(req.completedAt).toLocaleDateString()}</span>}
                        </div>
                      </div>
                      {(req.status === 'sent' || req.status === 'delivered') && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700 hover:bg-red-500/5 shrink-0"
                          onClick={() => {
                            const reason = prompt(t('signatures.reasonForVoiding'));
                            if (reason) voidMutation.mutate({ id: req.id, reason });
                          }}
                        >
                          <Ban className="h-4 w-4" />
                          <span className="hidden sm:inline ms-1">{t('signatures.void')}</span>
                        </Button>
                      )}
                    </div>
                  </GlassCard>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

function CreateSignatureForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [documentId, setDocumentId] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [recipients, setRecipients] = useState([{ email: '', name: '', role: 'signer', routingOrder: 1 }]);
  const [expiryDays, setExpiryDays] = useState(30);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/api/signatures', data),
    onSuccess: () => { toast({ title: t('signatures.requestSent') }); onCreated(); },
    onError: (err: any) => toast({ title: t('signatures.failed'), description: err?.message, variant: 'destructive' }),
  });

  const handleSubmit = () => {
    const newErrors: Record<string, string> = {};
    if (!documentId) newErrors.documentId = 'Required';
    if (subject.length < 3) newErrors.subject = 'Minimum 3 characters';
    if (recipients.some(r => !r.email || !r.name)) newErrors.recipients = 'All recipients need name + email';
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    createMutation.mutate({ documentId, provider: 'internal', recipients, emailConfig: { subject, message, expiryDays } });
  };

  return (
    <GlassCard className="p-6" hover={false}>
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <Plus className="h-5 w-5 text-primary" />
        {t('signatures.newRequestTitle')}
      </h3>
      <div className="space-y-4">
        <div>
          <input
            className={`glass-input w-full px-3 py-2 rounded-lg ${errors.documentId ? 'ring-2 ring-red-500/30' : ''}`}
            placeholder={t('signatures.documentId')}
            value={documentId}
            onChange={e => { setDocumentId(e.target.value); setErrors({}); }}
          />
          {errors.documentId && <p className="text-xs text-red-500 mt-1">{errors.documentId}</p>}
        </div>
        <div>
          <input
            className={`glass-input w-full px-3 py-2 rounded-lg ${errors.subject ? 'ring-2 ring-red-500/30' : ''}`}
            placeholder={t('signatures.emailSubject')}
            value={subject}
            onChange={e => { setSubject(e.target.value); setErrors({}); }}
          />
          {errors.subject && <p className="text-xs text-red-500 mt-1">{errors.subject}</p>}
        </div>
        <textarea
          className="glass-input w-full px-3 py-2 rounded-lg resize-none"
          placeholder={t('signatures.messageToRecipients')}
          rows={2}
          value={message}
          onChange={e => setMessage(e.target.value)}
        />
        <div className="space-y-2">
          {recipients.map((r, i) => (
            <div key={i} className="flex gap-2">
              <input
                className="glass-input flex-1 px-3 py-2 rounded-lg"
                placeholder={t('signatures.name')}
                value={r.name}
                onChange={e => { const v = [...recipients]; v[i].name = e.target.value; setRecipients(v); }}
              />
              <input
                className="glass-input flex-1 px-3 py-2 rounded-lg"
                placeholder={t('signatures.email')}
                value={r.email}
                onChange={e => { const v = [...recipients]; v[i].email = e.target.value; setRecipients(v); }}
              />
              {recipients.length > 1 && (
                <Button variant="ghost" size="sm" onClick={() => setRecipients(recipients.filter((_, idx) => idx !== i))} className="text-red-600">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          {errors.recipients && <p className="text-xs text-red-500">{errors.recipients}</p>}
          <Button variant="outline" size="sm" onClick={() => setRecipients([...recipients, { email: '', name: '', role: 'signer', routingOrder: recipients.length + 1 }])}>
            <Plus className="h-4 w-4" /> {t('signatures.addRecipient')}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm whitespace-nowrap">{t('signatures.expiryDays')}:</label>
          <input type="number" className="glass-input w-24 px-3 py-2 rounded-lg" value={expiryDays} onChange={e => setExpiryDays(Number(e.target.value))} />
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>{t('signatures.cancel')}</Button>
          <Button size="sm" onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('signatures.send')}
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}
