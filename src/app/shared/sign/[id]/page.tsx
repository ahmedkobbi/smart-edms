'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { GlassCard } from '@/components/ui/premium';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, PenTool, CheckCircle, AlertCircle, FileText } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

export default function InternalSigningPage({ params }: { params: { id: string } }) {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';
  const [signed, setSigned] = useState(false);
  const [signatureText, setSignatureText] = useState('');

  const { data, isLoading } = useQuery<any>({
    queryKey: ['signature-request', params.id],
    queryFn: () => api.get(`/api/signatures/${params.id}`),
  });

  const signMutation = useMutation({
    mutationFn: () => api.post(`/api/signatures/${params.id}/sign`, { email, signatureText }),
    onSuccess: (result: any) => {
      setSigned(true);
    },
    onError: (err: any) => {
      alert(err?.message || 'Failed to sign');
    },
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const request = data?.request;
  if (!request) {
    return (
      <div className="flex justify-center py-12">
        <GlassCard className="p-8 max-w-md text-center" hover={false}>
          <AlertCircle className="h-10 w-10 mx-auto text-red-500 mb-2" />
          <p>Signature request not found.</p>
        </GlassCard>
      </div>
    );
  }

  if (signed) {
    return (
      <div className="flex justify-center py-12">
        <GlassCard className="p-8 max-w-md text-center" hover={false}>
          <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-3" />
          <h2 className="text-xl font-semibold">Document Signed</h2>
          <p className="text-sm text-muted-foreground mt-2">Your electronic signature has been recorded with a SHA-256 attestation hash.</p>
        </GlassCard>
      </div>
    );
  }

  const recipients = typeof request.recipients === 'string' ? JSON.parse(request.recipients) : request.recipients;

  return (
    <div className="flex justify-center py-12 px-4">
      <GlassCard className="p-8 max-w-lg w-full" hover={false}>
        <div className="text-center mb-6">
          <PenTool className="h-10 w-10 mx-auto text-primary mb-2" />
          <h1 className="text-xl font-semibold">Sign Document</h1>
          <div className="flex items-center justify-center gap-2 mt-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{request.document?.title}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="glass-card rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">Signing as</p>
            <p className="font-medium">{email}</p>
          </div>

          <div className="glass-card rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">Current status</p>
            <Badge variant="secondary" className="capitalize">{request.status}</Badge>
          </div>

          {recipients && recipients.length > 0 && (
            <div className="glass-card rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-2">All recipients ({recipients.length})</p>
              <div className="space-y-1">
                {recipients.map((r: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span>{r.name} ({r.email})</span>
                    <Badge variant="outline" className="text-xs capitalize">
                      {r.status || 'pending'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-sm font-medium mb-1 block">Type your full name as your electronic signature</label>
            <input
              className="glass-input w-full px-3 py-2 rounded-lg"
              placeholder="Enter your full legal name"
              value={signatureText}
              onChange={e => setSignatureText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && signatureText) signMutation.mutate(); }}
            />
          </div>

          <div className="text-xs text-muted-foreground p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
            By typing your name and clicking "Sign Document", you acknowledge that this electronic signature
            is legally binding under the Electronic Signatures in Global and National Commerce Act (ESIGN) and
            the Uniform Electronic Transactions Act (UETA). A SHA-256 attestation hash will be recorded.
          </div>

          <Button
            className="w-full"
            onClick={() => signMutation.mutate()}
            disabled={!signatureText || signMutation.isPending}
          >
            {signMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenTool className="h-4 w-4" />}
            Sign Document
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}
