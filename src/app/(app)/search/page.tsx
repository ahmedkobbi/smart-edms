'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search as SearchIcon, Loader2, Filter } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface SearchResult {
  items: any[];
  total: number;
  page: number;
  pageSize: number;
  facets: {
    classifications: { id: string; count: number }[];
    tags: { name: string; count: number }[];
    states: { state: string; count: number }[];
  };
}

export default function SearchPage() {
  const [q, setQ] = useState('');
  const [classificationId, setClassificationId] = useState('all');
  const [state, setState] = useState('all');
  const [page, setPage] = useState(1);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (classificationId !== 'all') p.set('classifications', classificationId);
    if (state !== 'all') p.set('state', state);
    p.set('page', String(page));
    return p.toString();
  }, [q, classificationId, state, page]);

  const { data: classifications } = useQuery<{ items: any[] }>({
    queryKey: ['classifications'],
    queryFn: () => api.get('/api/classifications'),
  });

  const { data, isLoading } = useQuery<SearchResult>({
    queryKey: ['search', params],
    queryFn: () => api.get(`/api/search?${params}`),
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Permission-aware search across all documents in your tenant.
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search title, description, tags…"
                value={q}
                onChange={(e) => { setQ(e.target.value); setPage(1); }}
                className="pl-9"
                autoFocus
              />
            </div>
            <Select value={classificationId} onValueChange={(v) => { setClassificationId(v); setPage(1); }}>
              <SelectTrigger className="w-full md:w-48">
                <Filter className="mr-2 h-3.5 w-3.5" />
                <SelectValue placeholder="Classification" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classifications</SelectItem>
                {classifications?.items.map((c) => (
                  <SelectItem key={c.id} value={c.code}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={state} onValueChange={(v) => { setState(v); setPage(1); }}>
              <SelectTrigger className="w-full md:w-40"><SelectValue placeholder="State" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All states</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="record">Record</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Facets */}
        <div className="space-y-4">
          {data?.facets && (
            <>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Classifications</p>
                  <div className="space-y-1">
                    {data.facets.classifications.map((c) => {
                      const cls = classifications?.items.find((x) => x.id === c.id);
                      return (
                        <button
                          key={c.id}
                          onClick={() => { setClassificationId(cls?.code ?? 'all'); setPage(1); }}
                          className="w-full flex items-center justify-between text-sm hover:bg-slate-50 dark:hover:bg-slate-900 px-2 py-1 rounded"
                        >
                          <span className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cls?.color || '#94a3b8' }} />
                            {cls?.name ?? 'Unknown'}
                          </span>
                          <span className="text-xs text-muted-foreground">{c.count}</span>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {data.facets.tags.length > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Tags</p>
                    <div className="flex flex-wrap gap-1">
                      {data.facets.tags.slice(0, 20).map((t) => (
                        <Badge key={t.name} variant="secondary" className="text-xs">{t.name} ({t.count})</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>

        {/* Results */}
        <div className="lg:col-span-3">
          {isLoading ? (
            <div className="p-8 text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : !data?.items?.length ? (
            <Card>
              <CardContent className="p-12 text-center">
                <SearchIcon className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-sm font-medium">No results</p>
                <p className="text-xs text-muted-foreground mt-1">Try different keywords or filters.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{data.total} result(s)</p>
              {data.items.map((doc) => (
                <Link
                  key={doc.id}
                  href={`/documents/${doc.id}`}
                  className="block p-4 rounded-md border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="h-10 w-1 rounded-full flex-shrink-0"
                      style={{ backgroundColor: doc.classification?.color || '#94a3b8' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{doc.title}</p>
                        {doc.classification && (
                          <Badge variant="outline" className="text-xs font-mono" style={{ borderColor: doc.classification.color, color: doc.classification.color }}>
                            {doc.classification.code}
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-xs">{doc.state}</Badge>
                      </div>
                      {doc.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{doc.description}</p>}
                      <p className="text-xs text-muted-foreground mt-1">
                        v{doc.currentVersion} · {doc.owner?.name ?? doc.owner?.email ?? 'Unknown'} · {formatDistanceToNow(new Date(doc.updatedAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
              {data.total > data.pageSize && (
                <div className="flex justify-center pt-4">
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)}>
                    Load more
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
