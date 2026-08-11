'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/premium';
import { Loader2, Workflow, Save, Play, ArrowLeft } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { useToast } from '@/hooks/use-toast';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

// Import bpmn-js CSS for proper diagram rendering
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css';

export default function BpmnEditorPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams();
  const queryClient = useQueryClient();
  const defId = params.id as string;
  const canvasRef = useRef<HTMLDivElement>(null);
  const [xml, setXml] = useState('');
  const [modeler, setModeler] = useState<any>(null);

  const { data, isLoading } = useQuery<any>({
    queryKey: ['bpmn-definition', defId],
    queryFn: () => api.get(`/api/bpmn/definitions/${defId}`),
  });

  const saveMutation = useMutation({
    mutationFn: (newXml: string) => api.post('/api/bpmn/definitions', {
      processKey: data.definition.processKey,
      name: data.definition.name,
      description: data.definition.description,
      bpmnXml: newXml,
    }),
    onSuccess: () => { toast({ title: 'Saved' }); queryClient.invalidateQueries({ queryKey: ['bpmn-definition', defId] }); queryClient.invalidateQueries({ queryKey: ['bpmn-definitions'] }); },
    onError: (err: any) => toast({ title: 'Save failed', description: err?.message, variant: 'destructive' }),
  });

  const publishMutation = useMutation({
    mutationFn: () => api.post(`/api/bpmn/definitions/${defId}/publish`),
    onSuccess: () => { toast({ title: 'Process published' }); queryClient.invalidateQueries({ queryKey: ['bpmn-definition', defId] }); },
    onError: (err: any) => toast({ title: 'Publish failed', description: err?.message, variant: 'destructive' }),
  });

  useEffect(() => {
    if (!data?.definition || modeler) return;

    // Dynamically import bpmn-js (client-side only)
    import('bpmn-js/lib/Modeler').then(async (Module: any) => {
      const Modeler = Module.default;
      const m = new Modeler({ container: canvasRef.current });
      try {
        await m.importXML(data.definition.bpmnXml);
        setModeler(m);
      } catch (err) {
        console.error('BPMN import failed', err);
      }
    }).catch(err => {
      console.warn('bpmn-js not available, showing XML editor only', err);
    });

    return () => { if (modeler) modeler.destroy(); };
  }, [data]);

  const handleSave = async () => {
    if (modeler) {
      try {
        const result = await modeler.saveXML({ format: true });
        saveMutation.mutate(result.xml);
      } catch (err) {
        toast({ title: 'Export failed', variant: 'destructive' });
      }
    } else {
      saveMutation.mutate(xml);
    }
  };

  if (isLoading || !data) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const def = data.definition;

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/admin/bpmn-designer')}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Workflow className="h-5 w-5 text-primary" />
            {def.name}
          </h1>
          <Badge variant="outline">v{def.version}</Badge>
          <Badge variant="secondary" className="capitalize">{def.status}</Badge>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleSave} disabled={saveMutation.isPending}>
            <Save className="h-4 w-4" /> {saveMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
          {def.status === 'draft' && (
            <Button size="sm" onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending}>
              <Play className="h-4 w-4" /> {publishMutation.isPending ? 'Publishing...' : 'Publish'}
            </Button>
          )}
        </div>
      </div>

      <GlassCard className="p-0 overflow-hidden" hover={false}>
        <div ref={canvasRef} className="w-full h-[600px] bg-white dark:bg-gray-900" />
      </GlassCard>

      {def.parsedElements && (
        <GlassCard className="p-4" hover={false}>
          <h3 className="text-sm font-semibold mb-2">Parsed Elements</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div><span className="text-muted-foreground">Start Events:</span> {def.parsedElements.startEvent ? 1 : 0}</div>
            <div><span className="text-muted-foreground">End Events:</span> {def.parsedElements.endEvents?.length || 0}</div>
            <div><span className="text-muted-foreground">User Tasks:</span> {def.parsedElements.userTasks?.length || 0}</div>
            <div><span className="text-muted-foreground">Gateways:</span> {def.parsedElements.gateways?.length || 0}</div>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
