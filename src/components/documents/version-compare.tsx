'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { GitCompare, Loader2, Plus, Minus, Equal } from 'lucide-react';
import { motion } from 'framer-motion';
import { LoadingState } from '@/components/ui/premium';

export function VersionCompare({ docId, versions }: { docId: string; versions: any[] }) {
  const [fromN, setFromN] = useState<string>(versions[1]?.versionNumber?.toString() ?? '1');
  const [toN, setToN] = useState<string>(versions[0]?.versionNumber?.toString() ?? '2');

  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ['version-compare', docId, fromN, toN],
    queryFn: () => api.get(`/api/documents/${docId}/compare?from=${fromN}&to=${toN}`),
    enabled: false, // manual trigger
  });

  return (
    <Card className="glass-card border-0">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <GitCompare className="h-4 w-4" /> Version comparison
        </CardTitle>
        <CardDescription>Line-by-line diff between two versions</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">From</label>
            <Select value={fromN} onValueChange={setFromN}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v.id} value={v.versionNumber.toString()}>v{v.versionNumber}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <GitCompare className="h-4 w-4 mb-2.5 text-muted-foreground" />
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">To</label>
            <Select value={toN} onValueChange={setToN}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v.id} value={v.versionNumber.toString()}>v{v.versionNumber}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => refetch()} disabled={isLoading || fromN === toN}>
            {isLoading ? <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" /> : <GitCompare className="me-2 h-3.5 w-3.5" />}
            Compare
          </Button>
        </div>

        {data && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <div className="flex items-center gap-3 text-xs">
              <Badge variant="outline">v{data.from.versionNumber}</Badge>
              <span className="text-muted-foreground">→</span>
              <Badge variant="outline">v{data.to.versionNumber}</Badge>
              <div className="flex gap-2 ms-auto">
                <span className="flex items-center gap-1 text-emerald-600">
                  <Plus className="h-3 w-3" /> {data.stats.added}
                </span>
                <span className="flex items-center gap-1 text-red-600">
                  <Minus className="h-3 w-3" /> {data.stats.removed}
                </span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Equal className="h-3 w-3" /> {data.stats.unchanged}
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden max-h-96 overflow-y-auto scrollbar-premium">
              {data.diff.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">No differences</p>
              ) : (
                <div className="font-mono text-xs">
                  {data.diff.map((line: any, i: number) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(i * 0.01, 0.5) }}
                      className={`flex items-start gap-2 px-3 py-0.5 ${
                        line.type === 'add' ? 'bg-emerald-50 dark:bg-emerald-950/30' :
                        line.type === 'remove' ? 'bg-red-50 dark:bg-red-950/30' :
                        ''
                      }`}
                    >
                      <span className="text-muted-foreground select-none w-8 text-end flex-shrink-0">
                        {line.lineNumber}
                      </span>
                      <span className="select-none flex-shrink-0">
                        {line.type === 'add' ? <Plus className="h-3 w-3 text-emerald-500" /> :
                         line.type === 'remove' ? <Minus className="h-3 w-3 text-red-500" /> :
                         <Equal className="h-3 w-3 text-muted-foreground/50" />}
                      </span>
                      <span className={`flex-1 break-all ${
                        line.type === 'add' ? 'text-emerald-700 dark:text-emerald-400' :
                        line.type === 'remove' ? 'text-red-700 dark:text-red-400' :
                        'text-muted-foreground'
                      }`}>
                        {line.content || ' '}
                      </span>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
