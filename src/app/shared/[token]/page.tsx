'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { api, ApiRequestError } from '@/lib/api/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Loader2, Lock, FileText, Download, Eye } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface ShareInfo {
  share: {
    token: string;
    mode: string;
    hasPassword: boolean;
    expiresAt: string | null;
    watermark: boolean;
    viewCount: number;
    maxViews: number | null;
    document: {
      id: string;
      title: string;
      description: string | null;
      classification: { code: string; name: string; color: string } | null;
      ownerName: string | null;
    };
  };
}

export default function SharedDocumentPage() {
  const params = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState<ShareInfo | null>(null);
  const [password, setPassword] = useState('');
  const [pwRequired, setPwRequired] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [watermarkText, setWatermarkText] = useState<string | null>(null);

  useEffect(() => {
    api.get<ShareInfo>(`/api/shares/${params.token}`)
      .then((data) => {
        setShare(data);
        setPwRequired(data.share.hasPassword);
      })
      .catch((err: ApiRequestError) => setError(err.message))
      .finally(() => setLoading(false));
  }, [params.token]);

  async function handleView() {
    setViewing(true);
    try {
      const res = await api.post<{ url: string; watermark: boolean; watermarkText: string | null; mode: string }>(
        `/api/shares/${params.token}/view`,
        { password: password || undefined },
      );
      setViewUrl(res.url);
      setWatermarkText(res.watermark ? res.watermarkText : null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setViewing(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <Lock className="h-10 w-10 mx-auto text-red-500 mb-3" />
            <p className="font-medium">Access denied</p>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!share) return null;

  const doc = share.share.document;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950" dir="auto">
      {/* Classification banner */}
      {doc.classification && (
        <div
          className="px-4 py-2 text-sm font-medium text-white text-center"
          style={{ backgroundColor: doc.classification.color }}
        >
          <Shield className="inline h-3.5 w-3.5 mr-1.5" />
          {doc.classification.name}
        </div>
      )}

      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-slate-900 to-slate-700 flex items-center justify-center">
              <Shield className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold text-sm">Smart EDMS — Secure Share</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Mode: <span className="font-medium capitalize">{share.share.mode}</span>
            {' · '}
            Views: {share.share.viewCount}
            {share.share.maxViews && ` / ${share.share.maxViews}`}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8">
        {!viewUrl ? (
          <Card className="max-w-lg mx-auto">
            <CardContent className="p-6 space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <h1 className="text-lg font-semibold">{doc.title}</h1>
                </div>
                {doc.classification && (
                  <span
                    className="inline-block text-xs px-2 py-0.5 rounded font-mono"
                    style={{ backgroundColor: `${doc.classification.color}20`, color: doc.classification.color }}
                  >
                    {doc.classification.code}
                  </span>
                )}
              </div>
              {doc.description && <p className="text-sm text-muted-foreground">{doc.description}</p>}
              {doc.ownerName && <p className="text-xs text-muted-foreground">Shared by {doc.ownerName}</p>}
              {share.share.expiresAt && (
                <p className="text-xs text-muted-foreground">
                  Expires: {new Date(share.share.expiresAt).toLocaleString()}
                </p>
              )}
              {share.share.watermark && (
                <Alert>
                  <AlertDescription className="text-xs">
                    A dynamic watermark identifying the viewer will be overlaid on the document.
                  </AlertDescription>
                </Alert>
              )}
              {pwRequired && (
                <div className="space-y-1">
                  <Label htmlFor="pw">Password</Label>
                  <Input
                    id="pw"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleView()}
                  />
                </div>
              )}
              <Button onClick={handleView} disabled={viewing || (pwRequired && !password)} className="w-full">
                {viewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> :
                  share.share.mode === 'download' ? <Download className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                {share.share.mode === 'download' ? 'Download document' : 'View document'}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <WatermarkedDocument url={viewUrl} watermark={watermarkText} mode={share.share.mode} fileName={doc.title} />
        )}
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-3">
        <p className="text-center text-xs text-muted-foreground">
          Smart EDMS — access is logged and tamper-evident. Unauthorized use is prohibited.
        </p>
      </footer>
    </div>
  );
}

function WatermarkedDocument({ url, watermark, mode, fileName }: { url: string; watermark: string | null; mode: string; fileName: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  if (mode === 'download') {
    return (
      <div className="text-center">
        <p className="text-sm text-muted-foreground mb-3">Your download should start automatically. If not, click below:</p>
        <a href={url}>
          <Button>
            <Download className="mr-2 h-4 w-4" /> Download {fileName}
          </Button>
        </a>
        {watermark && (
          <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-950/30 rounded-md">
            <p className="text-xs font-mono break-all">{watermark}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative" dir="ltr">
      {watermark && (
        <>
          {/* Diagonal repeating watermark */}
          <div
            className="absolute inset-0 pointer-events-none z-10 opacity-10"
            style={{
              backgroundImage: `repeating-linear-gradient(-45deg, transparent, transparent 100px, ${'rgba(15,23,42,0.4)'} 100px, ${'rgba(15,23,42,0.4)'} 200px)`,
              backgroundSize: '400px 400px',
            }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-xl font-mono text-slate-900 break-all px-8 text-center select-none" dir="auto">{watermark}</p>
            </div>
          </div>
        </>
      )}
      <iframe
        src={url}
        className="w-full h-[80vh] border border-slate-200 dark:border-slate-800 rounded-md bg-white"
        title={fileName}
        sandbox="allow-same-origin"
      />
    </div>
  );
}
