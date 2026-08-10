'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Shield, ShieldCheck, Loader2, KeyRound, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';

export function SecuritySection({ mfaEnabled }: { mfaEnabled: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [mfaOpen, setMfaOpen] = useState(false);
  const [mfaStep, setMfaStep] = useState<'setup' | 'verify' | 'disable'>('setup');
  const [mfaSetup, setMfaSetup] = useState<{ secret: string; uri: string; qr: string } | null>(null);
  const [mfaToken, setMfaToken] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  const changePw = useMutation({
    mutationFn: () => api.post('/api/me/password', { currentPassword: pwCurrent, newPassword: pwNew }),
    onSuccess: () => {
      toast({ title: 'Password changed', description: 'All other sessions were signed out.' });
      setPwCurrent(''); setPwNew('');
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  const setupMfa = useMutation({
    mutationFn: () => api.post('/api/me/mfa?action=setup'),
    onSuccess: (res: any) => {
      setMfaSetup(res);
      setMfaStep('verify');
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  const enableMfa = useMutation({
    mutationFn: () => api.post('/api/me/mfa?action=enable', { token: mfaToken }),
    onSuccess: (res: any) => {
      setBackupCodes(res.backupCodes);
      toast({ title: 'MFA enabled', description: 'Save your backup codes — they will not be shown again.' });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  const disableMfa = useMutation({
    mutationFn: () => api.post('/api/me/mfa?action=disable', { token: mfaToken }),
    onSuccess: () => {
      toast({ title: 'MFA disabled' });
      setMfaOpen(false);
      setMfaToken('');
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  function openMfaDialog() {
    setMfaOpen(true);
    setMfaToken('');
    if (mfaEnabled) {
      setMfaStep('disable');
    } else {
      setMfaStep('setup');
      setMfaSetup(null);
      setupMfa.mutate();
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" /> Multi-factor authentication
          </CardTitle>
          <CardDescription>
            TOTP-based MFA (Google Authenticator, 1Password, Authy, etc.). Required for sensitive actions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {mfaEnabled ? (
                <>
                  <Badge variant="default" className="bg-emerald-600"><ShieldCheck className="me-1 h-3 w-3" /> Enabled</Badge>
                  <span className="text-sm text-muted-foreground">TOTP active</span>
                </>
              ) : (
                <>
                  <Badge variant="secondary">Disabled</Badge>
                  <span className="text-sm text-muted-foreground">Not configured</span>
                </>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={openMfaDialog}>
              <KeyRound className="me-2 h-3.5 w-3.5" />
              {mfaEnabled ? 'Manage MFA' : 'Enable MFA'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="h-4 w-4" /> Change password
          </CardTitle>
          <CardDescription>
            Min 12 chars, must include upper/lower/digit/special. Other sessions will be terminated.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="curPw">Current password</Label>
            <Input id="curPw" type="password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="newPw">New password</Label>
            <Input id="newPw" type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} />
          </div>
          <Button size="sm" onClick={() => changePw.mutate()} disabled={!pwCurrent || !pwNew || changePw.isPending}>
            {changePw.isPending && <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" />}
            Update password
          </Button>
        </CardContent>
      </Card>

      <Dialog open={mfaOpen} onOpenChange={(v) => { setMfaOpen(v); if (!v) { setBackupCodes(null); setMfaToken(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {mfaStep === 'disable' ? 'Disable MFA' : mfaStep === 'verify' ? 'Verify MFA' : 'Setting up MFA…'}
            </DialogTitle>
            <DialogDescription>
              {mfaStep === 'disable' ? 'Enter your current TOTP code to disable.' :
               mfaStep === 'verify' ? 'Scan the QR code, then enter the 6-digit code from your app.' :
               'Generating secret…'}
            </DialogDescription>
          </DialogHeader>

          {mfaStep === 'verify' && mfaSetup && (
            <div className="space-y-3 py-2">
              {mfaSetup.qr && (
                <div className="flex justify-center">
                  <img src={mfaSetup.qr} alt="QR code" width={200} height={200} />
                </div>
              )}
              <div className="space-y-1">
                <Label>Or enter secret manually</Label>
                <p className="font-mono text-xs bg-slate-50 dark:bg-slate-900 p-2 rounded break-all">{mfaSetup.secret}</p>
              </div>
              <div className="space-y-1">
                <Label>Verification code</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={mfaToken}
                  onChange={(e) => setMfaToken(e.target.value.replace(/\D/g, ''))}
                  className="tracking-widest text-lg text-center"
                  placeholder="000000"
                />
              </div>
              {backupCodes && (
                <Alert>
                  <AlertDescription>
                    <p className="font-medium mb-1">Backup codes (save now — shown once):</p>
                    <div className="grid grid-cols-2 gap-1 font-mono text-xs">
                      {backupCodes.map((c) => <span key={c}>{c}</span>)}
                    </div>
                  </AlertDescription>
                </Alert>
              )}
              <Button onClick={() => enableMfa.mutate()} disabled={mfaToken.length !== 6 || enableMfa.isPending} className="w-full">
                {enableMfa.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                Enable MFA
              </Button>
            </div>
          )}

          {mfaStep === 'disable' && (
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label>Current TOTP code</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={mfaToken}
                  onChange={(e) => setMfaToken(e.target.value.replace(/\D/g, ''))}
                  className="tracking-widest text-lg text-center"
                  placeholder="000000"
                />
              </div>
              <Button onClick={() => disableMfa.mutate()} disabled={mfaToken.length !== 6 || disableMfa.isPending} variant="destructive" className="w-full">
                {disableMfa.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                Disable MFA
              </Button>
            </div>
          )}

          {mfaStep === 'setup' && (
            <div className="py-8 text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
