'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/premium';
import { Loader2, PenTool, FileText, Clock, CheckCircle, XCircle, Eye, Ban } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { motion } from 'framer-motion';

const statusConfig: Record<string, { color: string; icon: any }> = {
  draft: { color: 'border-gray-500/20 bg-gray-500/5', icon: FileText },
  sent: { color: 'border-blue-500/20 bg-blue-500/5', icon: Clock },
  delivered: { color: 'border-blue-500/20 bg-blue-500/5', icon: Clock },
  completed: { color: 'border-green-500/20 bg-green-500/5', icon: CheckCircle },
  declined: { color: 'border-red-500/20 bg-red-500/5', icon: XCircle },
  expired: { color: 'border-amber-500/20 bg-amber-500/5', icon: Clock },
  voided: { color: 'border-gray-500/20 bg-gray-500/5', icon: Ban },
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
    onSuccess: () => { toast({ title: 'Request voided' }); queryClient.invalidateQueries({ queryKey: ['signatures'] }); },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const requests = data?.items || [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <PenTool className="h-6 w-6 text-primary" />
            E-Signatures
          </h1>
          <p className="text-sm text-muted-foreground mt-1">DocuSign and Adobe Sign integration for electronic signatures</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <PenTool className="h-4 w-4" /> New Signature Request
        </Button>
      </div>

      {showCreate && <CreateSignatureForm onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['signatures'] }); }} />}

      <div className="space-y-3">
        {requests.length === 0 ? (
          <GlassCard className="p-12 text-center" hover={false}>
            <PenTool className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No signature requests yet.</p>
          </GlassCard>
        ) : (
          requests.map((req: any, i: number) => {
            const config = statusConfig[req.status] || statusConfig.draft;
            const Icon = config.icon;
            const recipients = typeof req.recipients === 'string' ? JSON.parse(req.recipients) : req.recipients;
            return (
              <motion.div key={req.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <GlassCard className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className="h-4 w-4" />
                        <h3 className="font-semibold">{req.document?.title || 'Unknown document'}</h3>
                        <Badge className={`capitalize ${config.color}`}>{req.status}</Badge>
                        <Badge variant="outline" className="capitalize">{req.provider.replace('_', ' ')}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {recipients?.map((r: any, idx: number) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {r.name} ({r.email})
                          </Badge>
                        ))}
                      </div>
                      <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                        <span>Sent: {req.sentAt ? new Date(req.sentAt).toLocaleDateString() : '—'}</span>
                        <span>Expires: {req.expiresAt ? new Date(req.expiresAt).toLocaleDateString() : '—'}</span>
                        {req.completedAt && <span className="text-green-600">Completed: {new Date(req.completedAt).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    {(req.status === 'sent' || req.status === 'delivered') && (
                      <Button size="sm" variant="outline" onClick={() => {
                        const reason = prompt('Reason for voiding:');
                        if (reason) voidMutation.mutate({ id: req.id, reason });
                      }}>
                        <Ban className="h-4 w-4" /> Void
                      </Button>
                    )}
                  </div>
                </GlassCard>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}

function CreateSignatureForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [documentId, setDocumentId] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [recipients, setRecipients] = useState([{ email: '', name: '', role: 'signer', routingOrder: 1 }]);
  const [expiryDays, setExpiryDays] = useState(30);

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/api/signatures', data),
    onSuccess: () => { toast({ title: 'Signature request sent' }); onCreated(); },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  return (
    <GlassCard className="p-6">
      <h3 className="font-semibold mb-4">New Signature Request</h3>
      <div className="space-y-4">
        <input className="glass-input w-full px-3 py-2 rounded-lg" placeholder="Document ID" value={documentId} onChange={e => setDocumentId(e.target.value)} />
        <input className="glass-input w-full px-3 py-2 rounded-lg" placeholder="Email subject" value={subject} onChange={e => setSubject(e.target.value)} />
        <textarea className="glass-input w-full px-3 py-2 rounded-lg" placeholder="Message to recipients (optional)" rows={2} value={message} onChange={e => setMessage(e.target.value)} />
        <div className="space-y-2">
          {recipients.map((r, i) => (
            <div key={i} className="flex gap-2">
              <input className="glass-input flex-1 px-3 py-2 rounded-lg" placeholder="Name" value={r.name} onChange={e => { const v = [...recipients]; v[i].name = e.target.value; setRecipients(v); }} />
              <input className="glass-input flex-1 px-3 py-2 rounded-lg" placeholder="Email" value={r.email} onChange={e => { const v = [...recipients]; v[i].email = e.target.value; setRecipients(v); }} />
              {recipients.length > 1 && (
                <Button variant="outline" size="sm" onClick={() => setRecipients(recipients.filter((_, idx) => idx !== i))}>Remove</Button>
              )}
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setRecipients([...recipients, { email: '', name: '', role: 'signer', routingOrder: recipients.length + 1 }])}>+ Add Recipient</Button>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm">Expiry (days):</label>
          <input type="number" className="glass-input w-24 px-3 py-2 rounded-lg" value={expiryDays} onChange={e => setExpiryDays(Number(e.target.value))} />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => createMutation.mutate({ documentId, provider: 'internal', recipients, emailConfig: { subject, message, expiryDays } })} disabled={!documentId || !subject || createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send'}
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}
