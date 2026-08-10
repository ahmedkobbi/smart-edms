'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Edit3, Users, Radio } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { CollaborativeEditor } from '@/components/documents/collaborative-editor';
import { motion } from 'framer-motion';
import { useSession } from 'next-auth/react';

export function CollaborationPanel({ docId, tenantId }: { docId: string; tenantId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: session } = useSession();
  const [joined, setJoined] = useState(false);

  // Get existing extracted text for initial content
  const { data: docData } = useQuery<any>({
    queryKey: ['document', docId],
    queryFn: () => api.get(`/api/documents/${docId}`),
  });

  const { data: sessionData, isLoading } = useQuery<any>({
    queryKey: ['collab-session', docId],
    queryFn: () => api.get(`/api/documents/${docId}/collaboration/session`),
    refetchInterval: 10_000,
  });

  const joinSession = useMutation({
    mutationFn: () => api.post(`/api/documents/${docId}/collaboration/session`),
    onSuccess: (res: any) => {
      setJoined(true);
      toast({ title: 'Joined collaboration session' });
      qc.invalidateQueries({ queryKey: ['collab-session', docId] });
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  const collabServiceUrl = process.env.NEXT_PUBLIC_COLLAB_SERVICE_URL || 'http://localhost:3004';
  const docName = `${tenantId}:${docId}`;
  const user = (session as any)?.user;

  if (isLoading) {
    return (
      <Card className="glass-card border-0">
        <CardContent className="p-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!joined) {
    return (
      <Card className="glass-card border-0">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Edit3 className="h-4 w-4" /> Collaborative editing
          </CardTitle>
          <CardDescription>
            Edit this document together with your team in real-time. Changes are synchronized
            instantly and auto-saved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sessionData?.presence?.length > 0 && (
            <div className="flex items-center gap-2 p-3 rounded-lg glass-card border-0">
              <Users className="h-4 w-4 text-emerald-500" />
              <div className="flex -space-x-2">
                {sessionData.presence.slice(0, 5).map((p: any) => (
                  <div
                    key={p.userId}
                    className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium text-white border-2 border-white dark:border-slate-900"
                    style={{ backgroundColor: p.color }}
                    title={p.name}
                  >
                    {p.name.slice(0, 2).toUpperCase()}
                  </div>
                ))}
              </div>
              <span className="text-sm text-muted-foreground">
                {sessionData.presence.length} {sessionData.presence.length === 1 ? 'person' : 'people'} editing now
              </span>
            </div>
          )}
          <Button onClick={() => joinSession.mutate()} disabled={joinSession.isPending}>
            {joinSession.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Edit3 className="mr-2 h-4 w-4" />}
            Start editing
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Extract text content from document for initial seed
  const initialContent = docData?.document?.versions?.[0]
    ? `# ${docData.document.title}\n\n${docData.document.description || ''}\n\nStart collaborating here…`
    : 'Start collaborating…';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <CollaborativeEditor
        documentId={docId}
        tenantId={tenantId}
        userId={user?.id || 'unknown'}
        userName={user?.name || user?.email || 'Unknown'}
        userEmail={user?.email || ''}
        wsEndpoint={collabServiceUrl}
        docName={docName}
        initialContent={initialContent}
      />
    </motion.div>
  );
}
