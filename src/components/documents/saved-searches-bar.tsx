'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Bookmark, Trash2, Plus, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';

export function SavedSearchesBar({ onApply }: { onApply: (query: Record<string, unknown>) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showInput, setShowInput] = useState(false);
  const [name, setName] = useState('');

  const { data } = useQuery<{ items: any[] }>({
    queryKey: ['saved-searches'],
    queryFn: () => api.get('/api/saved-searches'),
  });

  const save = useMutation({
    mutationFn: () => {
      const params = new URLSearchParams(window.location.search);
      const query: Record<string, unknown> = {};
      params.forEach((v, k) => { query[k] = v; });
      return api.post('/api/saved-searches', { name, query });
    },
    onSuccess: () => {
      toast({ title: 'Search saved' });
      qc.invalidateQueries({ queryKey: ['saved-searches'] });
      setShowInput(false);
      setName('');
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/api/saved-searches/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-searches'] }),
  });

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {data?.items && data.items.length > 0 && (
        <>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Bookmark className="h-3 w-3" /> Saved:
          </span>
          {data.items.slice(0, 5).map((s) => (
            <div key={s.id} className="flex items-center gap-1 group">
              <button
                onClick={() => onApply(typeof s.query === 'string' ? JSON.parse(s.query) : s.query)}
                className="text-xs px-2 py-1 rounded glass-card border-0 hover-lift"
              >
                {s.name}
              </button>
              <button
                onClick={() => del.mutate(s.id)}
                className="opacity-0 group-hover:opacity-100 text-red-500 transition-opacity"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </>
      )}
      {showInput ? (
        <div className="flex items-center gap-1">
          <Input
            placeholder="Search name…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-7 w-32 text-xs glass-input border-0"
            autoFocus
          />
          <Button size="sm" className="h-7 px-2" onClick={() => save.mutate()} disabled={!name || save.isPending}>
            {save.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          </Button>
        </div>
      ) : (
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowInput(true)}>
          <Bookmark className="me-1 h-3 w-3" /> Save current search
        </Button>
      )}
    </div>
  );
}
