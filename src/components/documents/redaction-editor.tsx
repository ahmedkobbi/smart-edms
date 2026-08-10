'use client';

import { useState, useRef, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Eye, Square, Trash2, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Region {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  reason?: string;
}

interface RedactionEditorProps {
  docId: string;
  previewUrl: string;
  mimeType: string;
  onClose: () => void;
}

export function RedactionEditor({ docId, previewUrl, mimeType, onClose }: RedactionEditorProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [regions, setRegions] = useState<Region[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentRegion, setCurrentRegion] = useState<Region | null>(null);
  const [reason, setReason] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setDrawing(true);
    setStartPos({ x, y });
    setCurrentRegion({ page: 1, x, y, w: 0, h: 0 });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drawing || !startPos || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setCurrentRegion({
      page: 1,
      x: Math.min(startPos.x, x),
      y: Math.min(startPos.y, y),
      w: Math.abs(x - startPos.x),
      h: Math.abs(y - startPos.y),
    });
  }, [drawing, startPos]);

  const handleMouseUp = useCallback(() => {
    if (drawing && currentRegion && currentRegion.w > 0.01 && currentRegion.h > 0.01) {
      setRegions([...regions, { ...currentRegion, reason: reason || undefined }]);
    }
    setDrawing(false);
    setStartPos(null);
    setCurrentRegion(null);
  }, [drawing, currentRegion, regions, reason]);

  const removeRegion = (index: number) => {
    setRegions(regions.filter((_, i) => i !== index));
  };

  const applyRedaction = useMutation({
    mutationFn: () => api.post(`/api/documents/${docId}/redact`, { regions, reason: reason || 'Manual redaction' }),
    onSuccess: () => {
      toast({ title: 'Redaction applied', description: `Created derivative version with ${regions.length} redacted region(s).` });
      qc.invalidateQueries({ queryKey: ['document', docId] });
      onClose();
    },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  const formatPercent = (v: number) => `${(v * 100).toFixed(1)}%`;

  return (
    <Card className="glass-card border-0">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Square className="h-4 w-4" /> Redaction editor
        </CardTitle>
        <CardDescription>
          Click and drag on the document to select regions to redact. A new derivative version will be created — the original is preserved.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {mimeType.startsWith('image/') || mimeType === 'application/pdf' ? (
          <>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Reason for redaction (optional)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="flex-1 glass-input border-0"
              />
              <Badge variant="secondary" className="text-xs">{regions.length} region(s)</Badge>
            </div>

            <div
              ref={containerRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className="relative border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden cursor-crosshair select-none"
              style={{ minHeight: '400px' }}
            >
              {mimeType.startsWith('image/') ? (
                <img src={previewUrl} alt="Document" className="w-full h-auto pointer-events-none" />
              ) : (
                <iframe src={previewUrl} className="w-full h-[600px] pointer-events-none" title="Document" />
              )}

              {/* Existing regions */}
              {regions.map((r, i) => (
                <div
                  key={i}
                  className="absolute border-2 border-red-500 bg-red-500/30 flex items-start justify-end p-0.5"
                  style={{
                    left: formatPercent(r.x),
                    top: formatPercent(r.y),
                    width: formatPercent(r.w),
                    height: formatPercent(r.h),
                  }}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); removeRegion(i); }}
                    className="bg-red-500 text-white rounded p-0.5 hover:bg-red-600"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}

              {/* Current drawing region */}
              {currentRegion && (
                <div
                  className="absolute border-2 border-blue-500 bg-blue-500/20 pointer-events-none"
                  style={{
                    left: formatPercent(currentRegion.x),
                    top: formatPercent(currentRegion.y),
                    width: formatPercent(currentRegion.w),
                    height: formatPercent(currentRegion.h),
                  }}
                />
              )}
            </div>

            {regions.length > 0 && (
              <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-premium">
                {regions.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs p-2 rounded glass-card border-0">
                    <Badge variant="outline" className="text-[10px]">R{i + 1}</Badge>
                    <span className="font-mono text-muted-foreground">
                      x:{formatPercent(r.x)} y:{formatPercent(r.y)} w:{formatPercent(r.w)} h:{formatPercent(r.h)}
                    </span>
                    {r.reason && <span className="text-muted-foreground truncate">— {r.reason}</span>}
                    <Button variant="ghost" size="sm" className="ml-auto h-6 text-red-600" onClick={() => removeRegion(i)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button
                onClick={() => applyRedaction.mutate()}
                disabled={regions.length === 0 || applyRedaction.isPending}
                className="btn-premium"
              >
                {applyRedaction.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-2 h-3.5 w-3.5" />}
                Apply redaction ({regions.length})
              </Button>
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            <Eye className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm font-medium">Visual redaction not available for {mimeType}</p>
            <p className="text-xs text-muted-foreground mt-1">Only images and PDFs support visual region selection.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
